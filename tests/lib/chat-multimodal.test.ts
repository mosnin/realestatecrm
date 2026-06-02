/**
 * Tests for the universal multimodal builder.
 *
 * The builder now fetches bytes for PDFs (base64-inline) and text/md/csv
 * (inline), so `fetch` is mocked. Coverage: images become image_url blocks
 * for every model (Grok no longer drops them), PDFs become `file` blocks
 * with needsFileParser true, and .md/.txt/.csv get inlined as text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMultimodalContent,
  isImageMime,
  isPdfMime,
  isInlineTextMime,
  providerSupportsImages,
  providerSupportsPdfs,
  PDF_PARSER_ENGINE,
} from '@/lib/chat/multimodal';

const IMG = {
  id: 'a1',
  filename: 'shot.png',
  mimeType: 'image/png',
  url: 'https://example.com/shot.png',
};
const JPG = {
  id: 'a2',
  filename: 'mls.jpg',
  mimeType: 'image/jpeg',
  url: 'https://example.com/mls.jpg',
};
const PDF = {
  id: 'a3',
  filename: 'contract.pdf',
  mimeType: 'application/pdf',
  url: 'https://example.com/contract.pdf',
};
const MD = {
  id: 'a4',
  filename: 'notes.md',
  mimeType: 'text/markdown',
  url: 'https://example.com/notes.md',
};

/** Mock fetch: PDFs return bytes, text returns a string body. */
function mockFetch(opts?: { textBody?: string; ok?: boolean }) {
  const ok = opts?.ok ?? true;
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('.pdf')) {
      return {
        ok,
        arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer, // %PDF
      } as unknown as Response;
    }
    return {
      ok,
      text: async () => opts?.textBody ?? '# Notes\nfollow up Tuesday',
    } as unknown as Response;
  });
}

describe('isImageMime / isPdfMime / isInlineTextMime', () => {
  it('recognizes the supported image types', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('image/webp')).toBe(true);
    expect(isImageMime('image/gif')).toBe(true);
    expect(isImageMime('image/heic')).toBe(false);
    expect(isImageMime('IMAGE/PNG')).toBe(true);
  });
  it('recognizes pdf', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
    expect(isPdfMime('APPLICATION/PDF')).toBe(true);
    expect(isPdfMime('text/pdf')).toBe(false);
  });
  it('recognizes inline text types', () => {
    expect(isInlineTextMime('text/plain')).toBe(true);
    expect(isInlineTextMime('text/markdown')).toBe(true);
    expect(isInlineTextMime('text/csv')).toBe(true);
    expect(isInlineTextMime('application/pdf')).toBe(false);
  });
});

describe('providerSupports*', () => {
  it('reports native image support per provider', () => {
    expect(providerSupportsImages('anthropic')).toBe(true);
    expect(providerSupportsImages('openai')).toBe(true);
    expect(providerSupportsImages('google')).toBe(true);
  });
  it('reports native (no-plugin) pdf support — only anthropic', () => {
    expect(providerSupportsPdfs('anthropic')).toBe(true);
    expect(providerSupportsPdfs('openai')).toBe(false);
    expect(providerSupportsPdfs('xai')).toBe(false);
  });
});

describe('buildMultimodalContent — universal image path', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anthropic uses native image source blocks', async () => {
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', 'Tell me about this.', [IMG, JPG]);
    expect(r.fallbackNote).toBe('');
    expect(r.needsFileParser).toBe(false);
    expect(r.blocks[0]).toEqual({ type: 'text', text: 'Tell me about this.' });
    expect(r.blocks[1]).toEqual({
      type: 'image',
      source: { type: 'url', url: IMG.url, media_type: 'image/png' },
    });
  });

  it('openai uses image_url blocks', async () => {
    const r = await buildMultimodalContent('openai/gpt-5.5', 'What is this?', [IMG]);
    expect(r.blocks[0]).toEqual({ type: 'text', text: 'What is this?' });
    expect(r.blocks[1]).toEqual({ type: 'image_url', image_url: { url: IMG.url } });
  });

  it('GROK no longer drops images — emits an image_url block', async () => {
    const r = await buildMultimodalContent('x-ai/grok-4.3', 'Look at this listing.', [IMG]);
    expect(r.unsupported).toEqual([]);
    expect(r.fallbackNote).toBe('');
    expect(r.blocks[1]).toEqual({ type: 'image_url', image_url: { url: IMG.url } });
  });
});

describe('buildMultimodalContent — PDFs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anthropic gets a native document block, no file-parser', async () => {
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', 'Summarize this contract.', [PDF]);
    expect(r.needsFileParser).toBe(false);
    expect(r.blocks[1]).toEqual({
      type: 'document',
      source: { type: 'url', url: PDF.url, media_type: 'application/pdf' },
    });
  });

  it('GROK gets a file block + needsFileParser true (universal path)', async () => {
    const r = await buildMultimodalContent('x-ai/grok-4.3', 'Read this contract.', [PDF]);
    expect(r.unsupported).toEqual([]);
    expect(r.needsFileParser).toBe(true);
    const fileBlock = r.blocks.find((b) => b.type === 'file');
    expect(fileBlock).toBeDefined();
    expect(fileBlock).toMatchObject({
      type: 'file',
      file: {
        filename: 'contract.pdf',
        file_data: expect.stringMatching(/^data:application\/pdf;base64,/),
      },
    });
  });

  it('openai also gets the file-parser PDF path', async () => {
    const r = await buildMultimodalContent('openai/gpt-5.5', 'Read this.', [PDF]);
    expect(r.needsFileParser).toBe(true);
    expect(r.blocks.some((b) => b.type === 'file')).toBe(true);
  });
});

describe('buildMultimodalContent — inline text/markdown/csv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inlines a .md attachment as a text block for any model', async () => {
    vi.stubGlobal('fetch', mockFetch({ textBody: '# Notes\nfollow up Tuesday' }));
    const r = await buildMultimodalContent('x-ai/grok-4.3', 'Use my notes.', [MD]);
    expect(r.needsFileParser).toBe(false);
    expect(r.unsupported).toEqual([]);
    const inlined = r.blocks.find(
      (b) => b.type === 'text' && (b as { text: string }).text.includes('[Attached notes.md]'),
    );
    expect(inlined).toBeDefined();
    expect((inlined as { text: string }).text).toContain('follow up Tuesday');
  });

  it('truncates an oversized text file with a note', async () => {
    const big = 'x'.repeat(250_000);
    vi.stubGlobal('fetch', mockFetch({ textBody: big }));
    const r = await buildMultimodalContent('openai/gpt-5.5', 'Read this.', [MD]);
    const inlined = r.blocks.find(
      (b) => b.type === 'text' && (b as { text: string }).text.includes('[Attached notes.md]'),
    ) as { text: string };
    expect(inlined.text).toContain('[truncated');
    expect(inlined.text.length).toBeLessThan(210_000);
  });
});

describe('buildMultimodalContent — edge cases', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns just a text block when no attachments', async () => {
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', 'Hi.', []);
    expect(r.blocks).toEqual([{ type: 'text', text: 'Hi.' }]);
    expect(r.unsupported).toEqual([]);
    expect(r.needsFileParser).toBe(false);
  });

  it('synthesises a leading text block when none provided but attachments present', async () => {
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', '', [IMG]);
    expect(r.blocks[0].type).toBe('text');
    expect((r.blocks[0] as { text: string }).text).toMatch(/Take a look/i);
  });

  it('drops attachments with missing URLs', async () => {
    const noUrl = { ...IMG, url: '' };
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', 'See this.', [noUrl]);
    expect(r.unsupported).toEqual([noUrl]);
    expect(r.blocks.some((b) => b.type === 'image' || b.type === 'image_url')).toBe(false);
  });

  it('drops unsupported mimes (e.g. docx) with a note', async () => {
    const docx = {
      id: 'a5',
      filename: 'a.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      url: 'https://example.com/a.docx',
    };
    const r = await buildMultimodalContent('anthropic/claude-opus-4.7', 'Read this.', [docx]);
    expect(r.unsupported).toEqual([docx]);
    expect(r.fallbackNote).toMatch(/a\.docx/);
  });

  it('exports the file-parser engine constant', () => {
    expect(PDF_PARSER_ENGINE).toBe('pdf-text');
  });
});
