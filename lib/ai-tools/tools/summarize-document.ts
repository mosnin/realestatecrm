/**
 * `summarize_document` — bounded LLM summary of an uploaded text-y File's
 * extracted content (TXT, Markdown, PDF, DOCX, CSV). Companion to
 * `read_spreadsheet` (deterministic math, no LLM) for the "what's in this
 * document" ask that genuinely needs prose.
 *
 * Tenant lookup mirrors `read_file.ts`: File row fetched by `id` +
 * `spaceId` — the `.eq('spaceId', ctx.space.id)` IS the security boundary.
 * Byte download mirrors `app/api/cron/extraction-backfill/route.ts`: a
 * short-lived signed URL fetched with plain `fetch()`.
 *
 * Text extraction reuses `lib/extraction/extract.ts::extractAttachmentText`
 * — the same parser the chat-attachment pipeline uses for PDF/DOCX/XLSX/
 * CSV/TXT — rather than a new extractor. It never throws; a genuinely
 * unreadable file (image, unsupported binary, parse failure) is reported
 * honestly instead of being handed to the model as empty context.
 *
 * LLM call follows the getLLMClient() + usageAccountingParams() +
 * recordChatUsage billing contract used elsewhere for bounded, ungrounded
 * generation (see `lib/cma-narrative.ts`). The model is told to use ONLY
 * the extracted text and to say so plainly when content was truncated —
 * no invented facts.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { extractAttachmentText } from '@/lib/extraction/extract';
import { getLLMClient, hasLLMKey, openaiModel, usageAccountingParams } from '@/lib/llm';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const SIGN_TTL_SECONDS = 300;
// Same rationale as lib/cma-narrative.ts: short grounded copy, not a
// reasoning task — a small, cheap model is the right tool.
const MODEL = 'gpt-4.1-mini';
const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 700;
/** Cap on characters actually sent to the model. extractAttachmentText
 *  already caps at 50k chars (MAX_EXTRACTED_CHARS); this is a tighter
 *  cost/latency bound for a summarization call specifically. */
const MAX_SUMMARY_INPUT_CHARS = 12_000;

const parameters = z
  .object({
    fileId: z.string().min(1).describe('The File.id to summarize.'),
    focus: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Optional aspect to focus the summary on, e.g. "key dates" or "financial terms".'),
  })
  .describe('Summarize an uploaded text-y file (TXT, Markdown, PDF, DOCX, CSV) with a bounded LLM call.');

interface SummarizeDocumentResult {
  fileId: string;
  name: string;
  mimeType: string;
  summary: string;
  truncated: boolean;
  charsConsidered: number;
}

export const summarizeDocumentTool = defineTool<typeof parameters, SummarizeDocumentResult>({
  name: 'summarize_document',
  riskLevel: 'safe',
  description:
    'Summarize an uploaded text-y file (TXT, Markdown, PDF, DOCX, CSV) by File.id with a bounded LLM call. Optional focus narrows the summary to one aspect. Use list_files to find the file id first.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const { data: row, error } = await supabase
      .from('File')
      .select('id, name, mimeType, storageKey')
      .eq('id', args.fileId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (error) {
      return { summary: `File lookup failed: ${error.message}`, display: 'error' };
    }
    if (!row) {
      return { summary: `No file with id "${args.fileId}" in this workspace.`, display: 'error' };
    }
    const r = row as { id: string; name: string; mimeType: string; storageKey: string };

    if (!hasLLMKey()) {
      return { summary: 'No LLM key configured — document summaries are unavailable right now.', display: 'error' };
    }

    let buffer: Buffer;
    try {
      const url = await getSignedDownloadUrl(r.storageKey, SIGN_TTL_SECONDS);
      const res = await fetch(url, { signal: ctx.signal });
      if (!res.ok) {
        return { summary: `Could not download ${r.name} (storage returned ${res.status}).`, display: 'error' };
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return {
        summary: `Could not download ${r.name}: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    const extraction = await extractAttachmentText(buffer, r.mimeType, r.name);
    if (extraction.status === 'skipped') {
      return { summary: `${r.name} is an image or an unsupported format — there's no text to summarize.`, display: 'error' };
    }
    if (extraction.status === 'failed' || !extraction.text) {
      return { summary: `Could not extract readable text from ${r.name}.`, display: 'error' };
    }

    const fullText = extraction.text;
    const truncated = fullText.length > MAX_SUMMARY_INPUT_CHARS;
    const input = truncated ? fullText.slice(0, MAX_SUMMARY_INPUT_CHARS) : fullText;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    ctx.signal.addEventListener('abort', onExternalAbort);

    try {
      const client = getLLMClient();
      const model = openaiModel(MODEL);
      const focusLine = args.focus ? ` Focus the summary on: ${args.focus}.` : '';
      const systemPrompt =
        "You summarize a realtor's uploaded document plainly and honestly. " +
        'GROUNDING: use ONLY what is present in the provided text — never invent facts, numbers, names, dates, or clauses that are not there. ' +
        'If the text looks truncated or incomplete, say so briefly rather than guessing at the rest. ' +
        `Write 3-6 sentences of plain prose — no headings, no bullet points, no markdown.${focusLine}`;

      const response = await client.chat.completions.create(
        {
          model,
          temperature: 0.3,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Filename: ${r.name}\n\n${input}${truncated ? '\n\n[content truncated]' : ''}`,
            },
          ],
          // Cast: `usage` is an OpenRouter request extension the OpenAI SDK's
          // param type doesn't know about; empty on direct-OpenAI deploys.
          ...(usageAccountingParams() as Record<string, never>),
        },
        { signal: controller.signal },
      );

      // Billing accuracy: every completed call lands in ChatUsage, exact
      // OpenRouter cost preferred (usage-accounting opt-in above) — same
      // contract as lib/cma-narrative.ts.
      const u = response.usage as
        | (typeof response.usage & { prompt_tokens_details?: { cached_tokens?: number }; cost?: number })
        | undefined;
      if (u) {
        const costUsd =
          typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0 ? u.cost : undefined;
        void recordChatUsage({
          spaceId: ctx.space.id,
          model,
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
          costUsd,
          userId: ctx.userId,
          route: 'agent',
          runtime: 'ts',
        });
      }

      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return { summary: `Could not generate a summary for ${r.name} (empty model response).`, display: 'error' };
      }

      return {
        summary: text,
        data: {
          fileId: r.id,
          name: r.name,
          mimeType: r.mimeType,
          summary: text,
          truncated,
          charsConsidered: input.length,
        },
        display: 'plain',
      };
    } catch (err) {
      logger.warn('[summarize_document] LLM call failed', {
        fileId: r.id,
        err: err instanceof Error ? err.message : String(err),
      });
      return { summary: `Could not summarize ${r.name}: the model call failed.`, display: 'error' };
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onExternalAbort);
    }
  },
});
