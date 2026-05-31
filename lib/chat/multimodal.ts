/**
 * Multimodal content blocks — Phase 4.
 *
 * Takes an array of attachments (already hydrated to URLs + mime types by
 * the chat endpoint) and produces provider-shaped content blocks the LLM
 * SDK can pass through to the underlying model.
 *
 * Per-provider quirks (the whole point of this module):
 *
 *   anthropic (Claude vision/document)
 *     - Images: `{type: 'image', source: {type: 'url', url}}`. OpenRouter
 *       forwards Anthropic's `source: { type: 'url' }` shape verbatim.
 *     - PDFs:   `{type: 'document', source: {type: 'url', url}}` — Claude's
 *       PDF support reads page-level layout AND OCRs scanned PDFs. The
 *       same block shape handles realtor contract scans + MLS PDFs.
 *
 *   openai (GPT-4o / GPT-5 vision)
 *     - Images: `{type: 'image_url', image_url: {url}}` (OpenAI Chat
 *       Completions vision shape — what OpenRouter speaks).
 *     - PDFs:   no native PDF input. v1 strategy: pass a one-line text
 *       block explaining the attachment is unreadable. Sophisticated
 *       PDF-to-image conversion is deferred (see DEFERRED below) — for
 *       v1 we tell the realtor in the response to ask via Claude.
 *
 *   google (Gemini)
 *     - Both:   `{type: 'image_url', image_url: {url}}` — Gemini-via-
 *       OpenRouter accepts the same OpenAI-shaped image block. Native
 *       PDFs via Gemini's Files API are deferred; URL-shape is what works
 *       through OpenRouter today.
 *
 *   xai (Grok)
 *     - Images: limited vision support today; the safe play is to drop
 *       the attachments and emit a calm Chippi-voice line in the text
 *       block so the realtor knows to switch models. The router can then
 *       choose to escalate or not.
 *
 *   deepseek / moonshotai / qwen / unknown
 *     - Treated as "no vision" — same path as xai. Fall back to text.
 *
 * v1 cuts: video, audio, docx, image generation (input only — output
 * already exists via generate_studio_image).
 *
 * DEFERRED:
 *   - OpenAI PDF support via pdf-to-image conversion or OpenAI Files API
 *   - Gemini Files API native PDF
 *   - Provider auto-fallback when current model can't see (e.g. Grok →
 *     Claude for one turn) — router heuristic gets us most of the way
 *     today
 */

import { detectProvider } from '@/lib/llm';

export interface MultimodalAttachment {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
}

/** A content block in the shape the OpenAI-API-compatible chat.completions
 *  endpoint accepts. OpenRouter forwards Anthropic/Google blocks via the
 *  same `messages[].content[]` array; provider-specific shapes are passed
 *  through unchanged. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'image'; source: { type: 'url'; url: string; media_type?: string } }
  | { type: 'document'; source: { type: 'url'; url: string; media_type?: string } };

export interface BuildResult {
  /** Content blocks to attach to the user message. */
  blocks: ContentBlock[];
  /** Attachments the provider can't see — for telemetry / UX surfacing. */
  unsupported: MultimodalAttachment[];
  /** A one-line Chippi-voice note when we dropped attachments; empty
   *  string when nothing was dropped. The caller can splice this onto
   *  the assistant response or surface as a toast. */
  fallbackNote: string;
}

/** True when the mime type is an image we can encode for any vision-capable
 *  provider. PNG / JPEG / WebP / GIF cover what realtors actually paste —
 *  HEIC, AVIF, BMP, TIFF are explicitly not supported (the upload route
 *  rejects them upstream). */
export function isImageMime(mime: string): boolean {
  const m = (mime || '').toLowerCase();
  return m === 'image/png' || m === 'image/jpeg' || m === 'image/webp' || m === 'image/gif';
}

export function isPdfMime(mime: string): boolean {
  return (mime || '').toLowerCase() === 'application/pdf';
}

/**
 * Decide which providers can actually consume which attachment types.
 * Centralised so the router + the multimodal builder agree.
 */
export function providerSupportsImages(provider: string): boolean {
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

export function providerSupportsPdfs(provider: string): boolean {
  // OpenAI / Google PDF input via OpenRouter is unreliable today; only
  // Anthropic handles it natively + reliably. Honest about what works.
  return provider === 'anthropic';
}

/**
 * Build the content blocks for a single user-message turn.
 *
 * Always returns at least one text block (the raw user message); image /
 * PDF blocks are appended for attachments the provider supports. Anything
 * unsupported lands in `unsupported` so the caller can decide whether to
 * escalate models or surface a soft note.
 */
export function buildMultimodalContent(
  model: string,
  userText: string,
  attachments: MultimodalAttachment[],
): BuildResult {
  const provider = detectProvider(model);
  const blocks: ContentBlock[] = [];
  const unsupported: MultimodalAttachment[] = [];

  // Always lead with the user's text so the model anchors on it regardless
  // of how many attachments stack up after.
  if (userText && userText.trim()) {
    blocks.push({ type: 'text', text: userText });
  }

  const supportsImg = providerSupportsImages(provider);
  const supportsPdf = providerSupportsPdfs(provider);

  for (const a of attachments) {
    if (!a.url) {
      // Missing URL = signed-URL minting failed upstream. Skip silently —
      // we already logged on the way in.
      unsupported.push(a);
      continue;
    }
    if (isImageMime(a.mimeType)) {
      if (!supportsImg) {
        unsupported.push(a);
        continue;
      }
      blocks.push(...encodeImage(provider, a));
      continue;
    }
    if (isPdfMime(a.mimeType)) {
      if (!supportsPdf) {
        unsupported.push(a);
        continue;
      }
      blocks.push(...encodePdf(provider, a));
      continue;
    }
    // Anything else — text, csv, docx, xlsx — is not handled by the
    // multimodal path. The agent path's `read_attachment` tool covers
    // those.
    unsupported.push(a);
  }

  const fallbackNote = unsupported.length > 0
    ? composeFallbackNote(provider, unsupported)
    : '';

  // Edge case: pure attachments-only turn with no text. The OpenAI Chat
  // Completions API tolerates a `content: [...]` array without a text block,
  // but Anthropic's content array prefers a leading text block. Add an
  // implicit "Take a look at this." so every provider gets a well-shaped
  // message — and the model knows what's being asked.
  if (blocks.length === 0 || (!blocks.some((b) => b.type === 'text') && (supportsImg || supportsPdf))) {
    blocks.unshift({ type: 'text', text: 'Take a look at this.' });
  }

  return { blocks, unsupported, fallbackNote };
}

function encodeImage(provider: string, a: MultimodalAttachment): ContentBlock[] {
  if (provider === 'anthropic') {
    return [{
      type: 'image',
      source: { type: 'url', url: a.url, media_type: a.mimeType },
    }];
  }
  // openai + google share the OpenAI image_url shape on OpenRouter.
  return [{ type: 'image_url', image_url: { url: a.url } }];
}

function encodePdf(provider: string, a: MultimodalAttachment): ContentBlock[] {
  if (provider === 'anthropic') {
    return [{
      type: 'document',
      source: { type: 'url', url: a.url, media_type: 'application/pdf' },
    }];
  }
  // No other provider has reliable PDF input via OpenRouter today; the
  // caller routed here in error. Returning [] is safer than emitting a
  // shape the API will 400 on; this attachment will already be in
  // `unsupported` because providerSupportsPdfs() gated us.
  return [];
}

/**
 * One calm sentence telling the realtor an attachment didn't make it to
 * the model — Chippi voice, no apology, no emoji. Sonner toast or inline
 * note depending on caller preference.
 */
function composeFallbackNote(
  provider: string,
  unsupported: MultimodalAttachment[],
): string {
  const hasImages = unsupported.some((a) => isImageMime(a.mimeType));
  const hasPdfs = unsupported.some((a) => isPdfMime(a.mimeType));
  if (provider === 'xai') {
    if (hasImages && hasPdfs) {
      return 'Grok can\'t see images or PDFs — switch to Claude or GPT-5 for image and PDF support.';
    }
    if (hasImages) {
      return 'Grok can\'t see that — switch to Claude or GPT-5 for image support.';
    }
    if (hasPdfs) {
      return 'Grok can\'t read PDFs — switch to Claude for PDF support.';
    }
  }
  if (hasPdfs && !providerSupportsPdfs(provider)) {
    return 'Your current model can\'t read PDFs — switch to Claude for PDF support.';
  }
  if (hasImages && !providerSupportsImages(provider)) {
    return 'Your current model can\'t see images — switch to Claude, GPT-5, or Gemini for image support.';
  }
  return 'One or more attachments aren\'t supported by your current model.';
}
