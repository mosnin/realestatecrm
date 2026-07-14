/**
 * Speed-to-lead — tenant-scoped data fetch. Server-only (service-role
 * supabase client: the .eq()/.in() spaceId filters ARE the security
 * boundary, per CLAUDE.md). The pure math/formatting lives in
 * lib/analytics/speed-to-lead.ts so client components can import it.
 *
 * Query shape (bounded, no N+1):
 *   1. ONE query for the window's leads: contacts CREATED in the window,
 *      excluding bulk imports (source='import' — Instant First Touch never
 *      fires for imports, and an imported book is not "leads arriving").
 *      There is no dedicated is-lead marker beyond the lead-source taxonomy
 *      (lib/lead-source.ts), so contacts with a NULL source (legacy rows,
 *      pre-taxonomy creates) are still counted as leads. Capped at
 *      MAX_LEADS newest-window rows.
 *   2. Outbound InboxMessage rows and sent AgentDraft rows for those
 *      contacts, fetched in parallel, chunked by CONTACT_ID_CHUNK ids per
 *      request (bounded URL length) — a fixed, small number of round trips,
 *      never per-contact queries.
 */

import { supabase } from '@/lib/supabase';
import { FIRST_TOUCH_REASONING } from '@/lib/leads/first-touch';
import {
  computeSpeedToLead,
  EMPTY_SPEED_TO_LEAD,
  type SpeedToLeadLeadRow,
  type SpeedToLeadResult,
  type SpeedToLeadWindow,
} from '@/lib/analytics/speed-to-lead';

/** Cap on leads considered per window — bounds payloads and the .in() fan-out. */
const MAX_LEADS = 1000;
/** Contact ids per event query (keeps the PostgREST URL bounded). */
const CONTACT_ID_CHUNK = 200;
/** Cap on event rows per chunk query. */
const MAX_EVENTS_PER_CHUNK = 2000;

interface ContactRow {
  id: string;
  createdAt: string;
}

interface MessageRow {
  contactId: string;
  createdAt: string;
  agentDraftId: string | null;
}

interface DraftRow {
  id: string;
  contactId: string;
  updatedAt: string;
  reasoning: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Median/p90 speed-to-lead + Chippi first-touch share across one or more
 * spaces (one for the realtor overview, all member spaces for the broker
 * view). Throws on a hard DB error — callers on page paths degrade to null
 * and hide the stat rather than render a fabricated one.
 */
export async function fetchSpeedToLead(
  spaceIds: string[],
  window: SpeedToLeadWindow,
): Promise<SpeedToLeadResult> {
  if (spaceIds.length === 0) return { ...EMPTY_SPEED_TO_LEAD };

  const fromIso = window.from.toISOString();
  const toIso = window.to.toISOString();

  // 1. Leads: contacts created in the window, minus bulk imports.
  const { data: contactData, error: contactError } = await supabase
    .from('Contact')
    .select('id, createdAt')
    .in('spaceId', spaceIds)
    .gte('createdAt', fromIso)
    .lt('createdAt', toIso)
    .or('source.is.null,source.neq.import')
    .order('createdAt', { ascending: true })
    .limit(MAX_LEADS);
  if (contactError) throw contactError;

  const leads = (contactData ?? []) as ContactRow[];
  if (leads.length === 0) return { ...EMPTY_SPEED_TO_LEAD };

  const idChunks = chunk(leads.map((l) => l.id), CONTACT_ID_CHUNK);

  // 2. Candidate first-touch events, in parallel across bounded chunks.
  //    Both queries are lower-bounded by the window start (a first touch
  //    cannot precede the lead's creation, and every lead was created at or
  //    after window.from) but NOT upper-bounded by window.to — a lead
  //    created late in the window may be touched after it closes.
  const [messageResults, draftResults] = await Promise.all([
    Promise.all(
      idChunks.map((ids) =>
        supabase
          .from('InboxMessage')
          .select('contactId, createdAt, agentDraftId')
          .in('spaceId', spaceIds)
          .in('contactId', ids)
          .eq('direction', 'outbound')
          // Internal notes are not touches; email/sms/portal reach the lead.
          .in('channel', ['email', 'sms', 'portal'])
          .gte('createdAt', fromIso)
          .order('createdAt', { ascending: true })
          .limit(MAX_EVENTS_PER_CHUNK),
      ),
    ),
    Promise.all(
      idChunks.map((ids) =>
        supabase
          .from('AgentDraft')
          .select('id, contactId, updatedAt, reasoning')
          .in('spaceId', spaceIds)
          .in('contactId', ids)
          .eq('status', 'sent')
          .gte('updatedAt', fromIso)
          .order('updatedAt', { ascending: true })
          .limit(MAX_EVENTS_PER_CHUNK),
      ),
    ),
  ]);

  const messageRows: MessageRow[] = [];
  for (const res of messageResults) {
    if (res.error) throw res.error;
    messageRows.push(...((res.data ?? []) as MessageRow[]));
  }
  const draftRows: DraftRow[] = [];
  for (const res of draftResults) {
    if (res.error) throw res.error;
    draftRows.push(...((res.data ?? []) as DraftRow[]));
  }

  // Instant First Touch attribution: sent drafts carrying the reasoning
  // marker, and transcript messages that reference one of those drafts.
  const firstTouchDraftIds = new Set(
    draftRows.filter((d) => d.reasoning === FIRST_TOUCH_REASONING).map((d) => d.id),
  );

  return computeSpeedToLead(
    leads as SpeedToLeadLeadRow[],
    messageRows.map((m) => ({
      contactId: m.contactId,
      createdAt: m.createdAt,
      firstTouch: m.agentDraftId != null && firstTouchDraftIds.has(m.agentDraftId),
    })),
    draftRows.map((d) => ({
      contactId: d.contactId,
      sentAt: d.updatedAt,
      firstTouch: d.reasoning === FIRST_TOUCH_REASONING,
    })),
  );
}

/** Single-space convenience wrapper for the realtor analytics overview. */
export async function getSpaceSpeedToLead(
  spaceId: string,
  window: SpeedToLeadWindow,
): Promise<SpeedToLeadResult> {
  return fetchSpeedToLead([spaceId], window);
}
