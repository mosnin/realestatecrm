/**
 * The multimodal guards decide whether an attachment can reach the model and,
 * if not, whether to upgrade the turn to a vision model instead of silently
 * dropping the file. Pin the MIME allow-list (PNG/JPEG/WebP/GIF + PDF only),
 * the per-provider capability table, and pickModelForAttachments' upgrade rules
 * — including the two guards that prevent an upgrade loop (already on the
 * fallback / can't pick a provider). A regression here drops a realtor's photo.
 */

import { describe, it, expect } from 'vitest';
import {
  isImageMime,
  isPdfMime,
  providerSupportsImages,
  providerSupportsPdfs,
  pickModelForAttachments,
  VISION_FALLBACK_MODEL,
} from '@/lib/chat/multimodal';

type Attachment = Parameters<typeof pickModelForAttachments>[1][number];
const img = { mimeType: 'image/png' } as Attachment;
const pdf = { mimeType: 'application/pdf' } as Attachment;

describe('MIME guards', () => {
  it('accepts the supported image types (case-insensitive) and rejects others', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'IMAGE/PNG']) {
      expect(isImageMime(m)).toBe(true);
    }
    for (const m of ['image/heic', 'image/avif', 'image/bmp', 'application/pdf', '', 'text/plain']) {
      expect(isImageMime(m)).toBe(false);
    }
  });

  it('recognizes only application/pdf as a PDF', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
    expect(isPdfMime('APPLICATION/PDF')).toBe(true);
    expect(isPdfMime('image/png')).toBe(false);
    expect(isPdfMime('')).toBe(false);
  });
});

describe('provider capabilities', () => {
  it('lists the vision providers; PDFs are Anthropic-only', () => {
    for (const p of ['anthropic', 'openai', 'google', 'qwen']) expect(providerSupportsImages(p)).toBe(true);
    expect(providerSupportsImages('deepseek')).toBe(false);
    expect(providerSupportsPdfs('anthropic')).toBe(true);
    for (const p of ['openai', 'google', 'qwen', 'deepseek']) expect(providerSupportsPdfs(p)).toBe(false);
  });
});

describe('pickModelForAttachments', () => {
  it('never upgrades when there are no attachments', () => {
    expect(pickModelForAttachments('deepseek/deepseek-chat', [], true)).toEqual({
      model: 'deepseek/deepseek-chat',
      upgraded: false,
    });
  });

  it('keeps the model when its provider can already see the attachment', () => {
    expect(pickModelForAttachments('anthropic/claude-x', [img], true).upgraded).toBe(false);
    expect(pickModelForAttachments('anthropic/claude-x', [pdf], true).upgraded).toBe(false); // anthropic does PDFs
  });

  it('upgrades a text-only model to the vision fallback when allowed', () => {
    const r = pickModelForAttachments('deepseek/deepseek-chat', [img], true);
    expect(r).toEqual({ model: VISION_FALLBACK_MODEL, upgraded: true });
  });

  it('does NOT upgrade when the caller cannot pick another provider', () => {
    expect(pickModelForAttachments('deepseek/deepseek-chat', [img], false)).toEqual({
      model: 'deepseek/deepseek-chat',
      upgraded: false,
    });
  });

  it('does NOT upgrade when already on the fallback model (no loop)', () => {
    // qwen can't read PDFs and is the fallback itself -> stay put rather than loop
    expect(pickModelForAttachments(VISION_FALLBACK_MODEL, [pdf], true)).toEqual({
      model: VISION_FALLBACK_MODEL,
      upgraded: false,
    });
  });
});
