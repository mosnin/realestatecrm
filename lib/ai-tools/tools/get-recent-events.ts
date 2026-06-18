/**
 * `get_recent_events` — the recent connected-app activity Chippi already
 * captured from the realtor's integrations (Gmail, Calendar, Slack, HubSpot,
 * and the rest), so the agent can answer or act WITHOUT re-fetching from the
 * live app.
 *
 * Every Composio trigger delivery is persisted as an IntegrationEvent the
 * moment it arrives (see lib/integrations/events.ts). This tool surfaces the
 * newest of those, space-scoped, in a compact shape — app name, what kind of
 * event, a one-line title, who it was from, a short snippet, when, and the
 * dispatch status. The agent can lean on this instead of spinning up a fresh
 * email/calendar lookup, and reach for the connected-app tools only when it
 * needs to go deeper than the captured snippet.
 *
 * Read-only. Always scoped to `ctx.space.id`; any spaceId in args is ignored.
 */

import { z } from 'zod';
import { listEvents } from '@/lib/integrations/events';
import { findIntegration } from '@/lib/integrations/catalog';
import { defineTool } from '../types';

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
const SNIPPET_MAX = 160;

const parameters = z
  .object({
    toolkit: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe(
        "Optional Composio toolkit slug to filter by (e.g. 'gmail', 'googlecalendar', 'slack'). Omit for activity across all connected apps.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .default(DEFAULT_LIMIT)
      .describe(`Max events to return, newest first. Default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}.`),
  })
  .describe(
    'List recent connected-app activity Chippi already captured (email replies, calendar RSVPs, new contacts, etc.). Optionally filter by app.',
  );

/** Compact, model-facing projection of one captured event. */
interface RecentEvent {
  /** Display name of the connected app (falls back to the raw slug). */
  app: string;
  /** Toolkit slug — kept so the model can pass it back as the `toolkit` filter. */
  toolkit: string;
  /** Trigger slug, e.g. GMAIL_NEW_GMAIL_MESSAGE. */
  eventType: string;
  title: string | null;
  /** from / sender / organiser, when the payload carried one. */
  actor: string | null;
  snippet: string | null;
  /** ISO timestamp the event occurred. */
  occurredAt: string;
  /** Human-friendly age, e.g. "2h ago". */
  occurredAgo: string;
  /** Dispatch lifecycle: captured / dispatched / skipped / failed. */
  status: string;
}

interface GetRecentEventsResult {
  count: number;
  events: RecentEvent[];
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  const v = s.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  return v.length <= max ? v : v.slice(0, max - 1) + '…';
}

/** Coarse relative age — enough for the model to reason about recency. */
function relativeAge(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export const getRecentEventsTool = defineTool<typeof parameters, GetRecentEventsResult>({
  name: 'get_recent_events',
  riskLevel: 'safe',
  description:
    "Recent activity Chippi already captured from the realtor's connected apps (Gmail, calendar, Slack, etc.). Use this to answer or act WITHOUT re-fetching from the live app; go deeper with the connected-app tools only if the snippet isn't enough.",
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const rows = await listEvents({
      spaceId: ctx.space.id,
      limit,
      toolkit: args.toolkit,
    });

    if (rows.length === 0) {
      const scope = args.toolkit
        ? `${findIntegration(args.toolkit)?.name ?? args.toolkit}`
        : 'connected apps';
      return {
        summary: `No recent activity captured from ${scope}.`,
        data: { count: 0, events: [] },
        display: 'plain',
      };
    }

    const now = Date.now();
    const events: RecentEvent[] = rows.map((e) => ({
      app: findIntegration(e.toolkit)?.name ?? e.toolkit,
      toolkit: e.toolkit,
      eventType: e.eventType,
      title: truncate(e.title, SNIPPET_MAX),
      actor: truncate(e.actor, 80),
      snippet: truncate(e.snippet, SNIPPET_MAX),
      occurredAt: e.occurredAt,
      occurredAgo: relativeAge(e.occurredAt, now),
      status: e.status,
    }));

    const newest = events[0];
    const summary = `${events.length} recent event${events.length === 1 ? '' : 's'}${
      args.toolkit ? ` from ${newest.app}` : ''
    } (latest: ${newest.app} ${newest.occurredAgo}).`;

    return {
      summary,
      data: { count: events.length, events },
      display: 'plain',
    };
  },
});
