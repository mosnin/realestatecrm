/**
 * `read_attachment` — return the extracted contents of a chat attachment.
 *
 * Read-only. Documents and spreadsheets are extracted at upload time
 * (`/api/ai/attachments` → lib/extraction/extract.ts) into
 * Attachment.extractedText; this tool serves that text back to the model
 * on later turns (the upload turn already gets it injected inline by
 * lib/chat/multimodal.ts). Supports offsets so the model can page through
 * extractions bigger than one response.
 *
 * Schema: Attachment table from migration 20260430120000_attachments.sql.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

/** Max characters returned per call — page with `offset` for the rest. */
const PAGE_CHARS = 20_000;

const parameters = z
  .object({
    attachmentId: z.string().min(1).describe('The Attachment.id to read.'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Character offset into the extracted text (for paging long documents). Default 0.'),
  })
  .describe('Read the extracted text contents of a chat attachment (PDF, DOCX, XLSX, CSV, TXT).');

interface ReadAttachmentResult {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  extractionStatus: 'pending' | 'skipped' | 'done' | 'failed';
  /** The extracted text page starting at `offset`. Null when unavailable. */
  content: string | null;
  /** Total extracted length; content continues past offset+content.length when smaller. */
  totalChars: number;
}

export const readAttachmentTool = defineTool<typeof parameters, ReadAttachmentResult>({
  name: 'read_attachment',
  riskLevel: 'safe',
  description:
    'Read the extracted text contents of an attachment (PDF, DOCX, XLSX, CSV, TXT) by id. Returns up to 20k characters per call; pass offset to page through longer documents. Images have no extracted text.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: row, error } = await supabase
      .from('Attachment')
      .select('id, filename, mimeType, sizeBytes, extractionStatus, extractedText')
      .eq('id', args.attachmentId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (error) {
      return { summary: `Attachment lookup failed: ${error.message}`, display: 'error' };
    }
    if (!row) {
      return {
        summary: `No attachment with id "${args.attachmentId}" in this workspace.`,
        display: 'error',
      };
    }

    const r = row as {
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
      extractionStatus: 'pending' | 'skipped' | 'done' | 'failed' | null;
      extractedText: string | null;
    };
    const status = (r.extractionStatus ?? 'pending') as ReadAttachmentResult['extractionStatus'];
    const text = typeof r.extractedText === 'string' ? r.extractedText : '';
    const offset = Math.min(args.offset ?? 0, text.length);
    const content = text ? text.slice(offset, offset + PAGE_CHARS) : null;

    const sizeKb = r.sizeBytes != null ? `${Math.round(r.sizeBytes / 1024)} KB` : 'unknown size';
    let summary: string;
    if (content) {
      const remaining = text.length - (offset + content.length);
      summary =
        remaining > 0
          ? `${r.filename} (${r.mimeType}, ${sizeKb}) — ${content.length} chars from offset ${offset}; ${remaining} more available.`
          : `${r.filename} (${r.mimeType}, ${sizeKb}).`;
    } else if (status === 'skipped') {
      summary = `${r.filename} is an image — it has no extracted text (it is shown to vision models directly).`;
    } else if (status === 'failed') {
      summary = `${r.filename} (${r.mimeType}, ${sizeKb}) — text extraction failed for this file.`;
    } else {
      summary = `${r.filename} (${r.mimeType}, ${sizeKb}) — no extracted text available.`;
    }

    return {
      summary,
      data: {
        attachmentId: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes ?? null,
        extractionStatus: status,
        content,
        totalChars: text.length,
      },
      display: 'plain',
    };
  },
});
