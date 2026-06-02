/**
 * Multimodal content blocks — universal OpenRouter path.
 *
 * Takes an array of attachments (already hydrated to signed URLs + mime types
 * by the chat endpoint) and produces content blocks the OpenAI-compatible
 * chat.completions endpoint accepts. OpenRouter forwards these to ANY model
 * — Anthropic, OpenAI, Google, AND xAI/Grok, Moonshot, Qwen — via two
 * universal shapes plus one request-body plugin:
 *
 *   images   → {type:'image_url', image_url:{url}}                (vision models)
 *   pdfs     → {type:'file', file:{filename, file_data:'data:...;base64,...'}}
 *              + request-body plugins:[{id:'file-parser', pdf:{engine}}]
 *              OpenRouter's file-parser parses the PDF server-side and feeds
 *              the text/layout to the model — so even non-PDF-native models
 *              (Grok) can read a contract.
 *   text/md/csv → inlined directly into a text block: no parsing needed.
 *
 * The previous build dropped images for xai/Grok and had PDF support only
 * for Anthropic. That was a self-imposed limit, not an OpenRouter one. This
 * version stops dropping: every vision-capable model gets the image_url
 * block, every model gets the file-parser PDF path, and plain-text formats
 * are inlined so they work without any provider support at all.
 *
 * Anthropic keeps its native `image`/`document` source-URL shape as a small
 * optimization (Claude reads page layout + OCRs scans natively, no plugin
 * round-trip), but the universal path is the default and covers everything
 * else.
 *
 * v1 cuts: video, audio, docx, xlsx (the agent path's `read_attachment` tool
 * still covers docx/xlsx on demand), image generation (output already exists
 * via generate_studio_image).
 */

import { detectProvider } from '@/lib/llm';

export interface MultimodalAttachment {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
}

/**
 * OpenRouter file-parser PDF engine.
 *   'pdf-text'    — free; extracts the text layer of digital/born-PDF files.
 *   'mistral-ocr' — paid; OCRs scanned/image-only PDFs (realtor contract
 *                   scans, faxed disclosures). Switch here to enable OCR.
 *   'native'      — defer to a model's own native file handling.
 * Single source of truth: the request-body plugin in direct-llm.ts reads this.
 */
export const PDF_PARSER_ENGINE = 'pdf-text';

/** Max PDF bytes we'll base64-inline before bailing with a calm note. PDFs
 *  base64-expand ~33%, so 20MB of PDF is ~27MB of payload — past that we
 *  refuse rather than blow the request body. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Max chars of an inlined text/markdown/csv file. ~200KB is generous for a
 *  realtor's notes / CSV export; past it we truncate with a note so we never
 *  bloat the prompt with a giant paste. */
const MAX_TEXT_CHARS = 200_000;

/** A content block in the shape the OpenAI-API-compatible chat.completions
 *  endpoint accepts. OpenRouter forwards Anthropic/Google blocks and the
 *  `file` block via the same `messages[].content[]` array. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'image'; source: { type: 'url'; url: string; media_type?: string } }
  | { type: 'document'; source: { type: 'url'; url: string; media_type?: string } };

export interface BuildResult {
  /** Content blocks to attach to the user message. */
  blocks: ContentBlock[];
  /** True when at least one `file` (PDF) block was emitted — the caller must
   *  attach the OpenRouter file-parser plugin to the request body. */
  needsFileParser: boolean;
  /** A one-line Chippi-voice note when an attachment couldn't be delivered
   *  (missing URL, oversized PDF, failed fetch). Empty when everything made
   *  it through. The caller splices this onto the user text + surfaces it. */
  fallbackNote: string;
  /** Attachments that couldn't be delivered — for telemetry / UX surfacing. */
  unsupported: MultimodalAttachment[];
}

/** True when the mime type is an image we can encode for any vision-capable
 *  model. PNG / JPEG / WebP / GIF cover what realtors actually paste — HEIC,
 *  AVIF, BMP, TIFF are rejected by the upload route upstream. */
export function isImageMime(mime: string): boolean {
  const m = (mime || '').toLowerCase();
  return m === 'image/png' || m === 'image/jpeg' || m === 'image/webp' || m === 'image/gif';
}

export function isPdfMime(mime: string): boolean {
  return (mime || '').toLowerCase() === 'application/pdf';
}

/** Plain-text formats we can inline directly with no parsing. */
export function isInlineTextMime(mime: string): boolean {
  const m = (mime || '').toLowerCase();
  return m === 'text/plain' || m === 'text/markdown' || m === 'text/csv';
}

/**
 * Whether a provider can consume image blocks. Retained for the router /
 * external callers + existing tests. On the universal path every vision
 * model gets images through `image_url`; this reports the providers we've
 * confirmed have vision behind OpenRouter.
 */
export function providerSupportsImages(provider: string): boolean {
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

/**
 * Whether a provider handles PDFs NATIVELY (no plugin). Only Anthropic does.
 * Every other model reads PDFs via the OpenRouter file-parser plugin instead,
 * so this no longer gates whether a PDF is delivered — it only picks the
 * encoding (native document block vs. file-parser file block).
 */
export function providerSupportsPdfs(provider: string): boolean {
  return provider === 'anthropic';
}

/**
 * Build the content blocks for a single user-message turn. Async because the
 * universal PDF/text paths fetch the attachment bytes from the signed URL
 * (PDFs are base64-inlined; text is read and spliced into a text block).
 *
 * Always returns at least one text block. Images/PDFs/text are appended for
 * every model. `needsFileParser` is true when any PDF `file` block was
 * emitted so the caller attaches the file-parser plugin.
 */
export async function buildMultimodalContent(
  model: string,
  userText: string,
  attachments: MultimodalAttachment[],
): Promise<BuildResult> {
  const provider = detectProvider(model);
  const blocks: ContentBlock[] = [];
  const unsupported: MultimodalAttachment[] = [];
  const notes: string[] = [];
  let needsFileParser = false;

  // Always lead with the user's text so the model anchors on it regardless of
  // how many attachments stack up after.
  if (userText && userText.trim()) {
    blocks.push({ type: 'text', text: userText });
  }

  for (const a of attachments) {
    if (!a.url) {
      // Missing URL = signed-URL minting failed upstream. Already logged.
      unsupported.push(a);
      continue;
    }

    if (isImageMime(a.mimeType)) {
      blocks.push(encodeImage(provider, a));
      continue;
    }

    if (isPdfMime(a.mimeType)) {
      const pdf = await encodePdf(provider, a);
      if (pdf.block) {
        blocks.push(pdf.block);
        if (pdf.usedFileParser) needsFileParser = true;
      } else {
        unsupported.push(a);
        if (pdf.note) notes.push(pdf.note);
      }
      continue;
    }

    if (isInlineTextMime(a.mimeType)) {
      const text = await fetchTextInline(a);
      if (text.block) {
        blocks.push(text.block);
      } else {
        unsupported.push(a);
        if (text.note) notes.push(text.note);
      }
      continue;
    }

    // Anything else — docx, xlsx, json — isn't handled here. The agent path's
    // `read_attachment` tool covers those.
    unsupported.push(a);
    notes.push(`${a.filename} isn't a type I can read here.`);
  }

  // Edge case: attachments-only turn with no text. OpenRouter tolerates a
  // content array without a leading text block, but Anthropic prefers one —
  // add an implicit prompt so every provider gets a well-shaped message.
  if (blocks.length === 0 || !blocks.some((b) => b.type === 'text')) {
    blocks.unshift({ type: 'text', text: 'Take a look at this.' });
  }

  return {
    blocks,
    needsFileParser,
    fallbackNote: notes.length > 0 ? notes.join(' ') : '',
    unsupported,
  };
}

function encodeImage(provider: string, a: MultimodalAttachment): ContentBlock {
  if (provider === 'anthropic') {
    // Claude reads URL-sourced images natively; OpenRouter forwards the shape.
    return { type: 'image', source: { type: 'url', url: a.url, media_type: a.mimeType } };
  }
  // openai / google / xai / moonshot / qwen — every vision model behind
  // OpenRouter speaks the OpenAI image_url shape.
  return { type: 'image_url', image_url: { url: a.url } };
}

/**
 * Encode a PDF. Anthropic gets its native `document` URL block (no plugin,
 * native OCR). Everything else fetches the bytes, base64-inlines them as a
 * `file` block, and flags `usedFileParser` so the caller attaches the
 * OpenRouter file-parser plugin — which parses the PDF server-side for ANY
 * model, including Grok.
 */
async function encodePdf(
  provider: string,
  a: MultimodalAttachment,
): Promise<{ block: ContentBlock | null; usedFileParser: boolean; note: string }> {
  if (provider === 'anthropic') {
    return {
      block: { type: 'document', source: { type: 'url', url: a.url, media_type: 'application/pdf' } },
      usedFileParser: false,
      note: '',
    };
  }

  try {
    const res = await fetch(a.url);
    if (!res.ok) {
      return { block: null, usedFileParser: false, note: `Couldn't fetch ${a.filename}.` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES) {
      return {
        block: null,
        usedFileParser: false,
        note: `${a.filename} is too large to read here (over ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)}MB).`,
      };
    }
    const dataUrl = `data:application/pdf;base64,${buf.toString('base64')}`;
    return {
      block: { type: 'file', file: { filename: a.filename, file_data: dataUrl } },
      usedFileParser: true,
      note: '',
    };
  } catch {
    return { block: null, usedFileParser: false, note: `Couldn't read ${a.filename}.` };
  }
}

/**
 * Fetch a text/markdown/csv attachment and inline its contents as a text
 * block. No library needed — these are already text. Truncated at
 * MAX_TEXT_CHARS with a note so a huge paste can't bloat the prompt.
 */
async function fetchTextInline(
  a: MultimodalAttachment,
): Promise<{ block: ContentBlock | null; note: string }> {
  try {
    const res = await fetch(a.url);
    if (!res.ok) {
      return { block: null, note: `Couldn't fetch ${a.filename}.` };
    }
    let contents = await res.text();
    if (contents.length > MAX_TEXT_CHARS) {
      contents = contents.slice(0, MAX_TEXT_CHARS) + '\n\n[truncated — file was longer than I can read here]';
    }
    return {
      block: { type: 'text', text: `\n\n[Attached ${a.filename}]\n${contents}` },
      note: '',
    };
  } catch {
    return { block: null, note: `Couldn't read ${a.filename}.` };
  }
}
