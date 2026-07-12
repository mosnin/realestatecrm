/**
 * `read_session_report` — read the markdown deliverable a completed work
 * session produced. This is what makes "ask Chippi about this" work: the
 * session card drops the realtor into chat with the session referenced, and
 * the model pulls the actual report text instead of guessing from the
 * two-line summary. Read-only; the report is the session's own output.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getObjectText } from '@/lib/storage';
import { defineTool } from '../types';

const parameters = z
  .object({
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe('WorkSession id. Omit to read the most recently completed session.'),
  })
  .describe("Read a completed work session's full report.");

/** Keep the report within a sane context budget for a chat turn. */
const REPORT_CHAR_CAP = 12_000;

interface ReadSessionReportResult {
  sessionId: string;
  goal: string;
  reportName: string | null;
  markdown: string;
}

export const readSessionReportTool = defineTool<typeof parameters, ReadSessionReportResult>({
  name: 'read_session_report',
  riskLevel: 'safe',
  description:
    'Read the full markdown report of a completed background work session. Use when the realtor asks about a work session, its findings, or its recommendations. Omit sessionId for the latest one.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let query = supabase
      .from('WorkSession')
      .select('id, goal, summary, artifactFileId, artifactName, status, createdAt')
      .eq('spaceId', ctx.space.id)
      .eq('status', 'completed')
      .order('createdAt', { ascending: false })
      .limit(1);
    if (args.sessionId) {
      query = supabase
        .from('WorkSession')
        .select('id, goal, summary, artifactFileId, artifactName, status, createdAt')
        .eq('spaceId', ctx.space.id)
        .eq('id', args.sessionId)
        .limit(1);
    }
    const { data } = await query;
    const session = (data?.[0] ?? null) as {
      id: string;
      goal: string;
      summary: string | null;
      artifactFileId: string | null;
      artifactName: string | null;
      status: string;
    } | null;

    if (!session) {
      return {
        summary: args.sessionId
          ? 'No work session with that id in this workspace.'
          : 'No completed work sessions yet.',
        display: 'error',
      };
    }
    if (session.status !== 'completed') {
      return {
        summary: `That session is still ${session.status} — no report yet. Its goal: ${session.goal}`,
        display: 'error',
      };
    }

    // Prefer the full artifact; fall back to the stored summary if the file
    // never landed (artifact save is best-effort in the engine).
    let markdown = '';
    if (session.artifactFileId) {
      const { data: file } = await supabase
        .from('File')
        .select('storageKey')
        .eq('id', session.artifactFileId)
        .eq('spaceId', ctx.space.id)
        .maybeSingle();
      const key = (file as { storageKey: string } | null)?.storageKey;
      if (key) {
        try {
          markdown = await getObjectText(key);
        } catch {
          markdown = '';
        }
      }
    }
    if (!markdown) markdown = session.summary ?? '';
    if (!markdown) {
      return { summary: 'That session finished but its report is unavailable.', display: 'error' };
    }

    const clipped =
      markdown.length > REPORT_CHAR_CAP
        ? `${markdown.slice(0, REPORT_CHAR_CAP)}\n\n…(report truncated)`
        : markdown;

    return {
      summary: `Work session report (goal: ${session.goal}):\n\n${clipped}`,
      data: {
        sessionId: session.id,
        goal: session.goal,
        reportName: session.artifactName,
        markdown: clipped,
      },
    };
  },
});
