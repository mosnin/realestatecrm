/**
 * Brief-dashboard data — the server-side roll-up that powers the bento
 * grid on /chippi/brief.
 *
 * One function, one fan-out: every number the dashboard renders is gathered
 * here in parallel, server-side, against the realtor's own Supabase tables.
 * The page passes the result straight to the (client) bento component so
 * there is NO client fetch waterfall — the grid paints with real numbers on
 * first byte.
 *
 * Every field below is a real read. Nothing is hardcoded or estimated. When
 * a section has no data the count is 0 (or the array empty) and the bento
 * cell renders its own calm empty state — it never invents a number.
 *
 * Composition:
 *   - cards / tip / momentum / tomorrow  ← composeBrief (the ranked 7am brief)
 *   - pipeline (active / closing / atRisk / value)  ← Deal table
 *   - overnight (what Chippi did, last 12h)         ← AgentActivityLog
 *   - newLeads / followUpsDue / pendingDrafts       ← Contact + Deal + AgentDraft
 *   - hotLeads (named list)                         ← Contact (scored hot)
 *   - tours (today, named list)                     ← Tour table
 */

import { supabase } from '@/lib/supabase';
import { composeBrief } from './compose';
import {
  composePipelineSummary,
  composeOvernight,
  type OvernightSummary,
} from './sections';
import type { Brief } from './types';

/** Pipeline snapshot — active deal counts plus total open value. The
 *  three counts mirror the existing PIPELINE section; `openValue` is the
 *  summed `Deal.value` of active deals (null values count as 0). */
export interface PipelineStat {
  active: number;
  closingThisWeek: number;
  atRisk: number;
  /** Sum of `value` across active deals. 0 when none carry a value. */
  openValue: number;
}

/** A hot lead the realtor should reach — scored 'hot' by the lead-scoring
 *  engine. `lastContactedAt` lets the cell show "5d since touch". */
export interface HotLead {
  id: string;
  name: string;
  leadScore: number | null;
  lastContactedAt: string | null;
}

/** A tour scheduled for today, drawn from Chippi's internal Tour table. */
export interface TourToday {
  id: string;
  startsAt: string;
  guestName: string | null;
  propertyAddress: string | null;
  /** Deep-link target — the contact when linked, else the calendar. */
  href: string;
}

/** Counts for the "what needs you" cells. Each links to its own page. */
export interface NeedsYou {
  /** Untouched new leads (tagged `new-lead`, not brokerage-routed). */
  newLeads: number;
  /** Contacts + deals whose follow-up is due today or overdue. */
  followUpsDue: number;
  /** AgentDraft rows awaiting the realtor's approve/edit. */
  pendingDrafts: number;
  /** Inbox threads with at least one unread inbound message — clients whose
   *  last word is still sitting unanswered on the realtor's desk. */
  clientsWaiting: number;
}

/**
 * Post-close reputation snapshot — how many review requests went out recently
 * and how many the client clicked. Both are real counts over the same trailing
 * window; the Brief cell renders nothing when none were requested.
 */
export interface ReputationStat {
  /** Review requests sent in the trailing window (status past 'drafted'). */
  requested: number;
  /** Of those, how many the client clicked the tracked link on. */
  clicked: number;
}

export interface BriefDashboard {
  /** The realtor's first name for the greeting, or null. */
  ownerName: string | null;
  /** The full composed 7am brief — cards (ON DECK), tip, momentum, tomorrow. */
  brief: Brief;
  needsYou: NeedsYou;
  pipeline: PipelineStat | null;
  overnight: OvernightSummary | null;
  hotLeads: HotLead[];
  tours: TourToday[];
  reputation: ReputationStat | null;
}

const HOT_LEADS_SHOWN = 4;
const TOURS_SHOWN = 4;

/**
 * Count contacts + deals whose follow-up is due (today or overdue).
 * Mirrors the /follow-ups page's source tables. Contacts exclude
 * brokerage-routed rows (those live on the brokerage's desk, not this
 * realtor's), matching every other realtor-facing follow-up surface.
 */
async function countFollowUpsDue(spaceId: string): Promise<number> {
  // End-of-today boundary so a follow-up dated "today" counts as due.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const cutoff = endOfToday.toISOString();

  const [contactsRes, dealsRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lte('followUpAt', cutoff),
    supabase
      .from('Deal')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .eq('status', 'active')
      .not('followUpAt', 'is', null)
      .lte('followUpAt', cutoff),
  ]);

  return (contactsRes.count ?? 0) + (dealsRes.count ?? 0);
}

/** Untouched new leads — tagged `new-lead`, not brokerage-routed. Same
 *  predicate the /leads page uses to surface "N new since you last checked". */
async function countNewLeads(spaceId: string): Promise<number> {
  const { count } = await supabase
    .from('Contact')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .contains('tags', ['new-lead']);
  return count ?? 0;
}

/** Pending AgentDraft rows — the same count the Inbox surface shows. */
async function countPendingDrafts(spaceId: string): Promise<number> {
  const { count } = await supabase
    .from('AgentDraft')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .eq('status', 'pending');
  return count ?? 0;
}

/**
 * Threaded-inbox rows carrying unread inbound — one per contact still waiting
 * on a reply. Powers the Brief's "N clients waiting on you" signal and the
 * unread badge on the unified inbox. Scoped by spaceId (the security boundary)
 * and by unreadCount > 0. Exported so its behavior is unit-testable in
 * isolation without standing up the whole dashboard compose.
 */
export async function countClientsWaiting(spaceId: string): Promise<number> {
  const { count } = await supabase
    .from('InboxThread')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .gt('unreadCount', 0);
  return count ?? 0;
}

/**
 * Active deal counts + total open value. Reuses composePipelineSummary for
 * the three counts (so the at-risk logic stays single-sourced through
 * dealHealth) and adds one read for the value sum. Returns null when the
 * realtor has no active deals — the bento omits the pipeline cell.
 */
async function composePipelineStat(spaceId: string): Promise<PipelineStat | null> {
  const [summary, valueRes] = await Promise.all([
    composePipelineSummary(spaceId),
    supabase
      .from('Deal')
      .select('value')
      .eq('spaceId', spaceId)
      .eq('status', 'active'),
  ]);

  if (!summary) return null;

  let openValue = 0;
  for (const row of (valueRes.data ?? []) as { value: number | null }[]) {
    if (typeof row.value === 'number' && !isNaN(row.value)) openValue += row.value;
  }

  return {
    active: summary.active,
    closingThisWeek: summary.closingThisWeek,
    atRisk: summary.atRisk,
    openValue,
  };
}

/**
 * Hot leads, named. Scored 'hot' by the lead-scoring engine and not
 * brokerage-routed. Ordered by leadScore desc so the warmest sit at the
 * top; capped to a short list for the bento cell.
 */
async function fetchHotLeads(spaceId: string): Promise<HotLead[]> {
  const { data } = await supabase
    .from('Contact')
    .select('id, name, leadScore, lastContactedAt, scoreLabel, scoringStatus')
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .eq('scoringStatus', 'scored')
    .eq('scoreLabel', 'hot')
    .order('leadScore', { ascending: false })
    .limit(HOT_LEADS_SHOWN);

  return ((data ?? []) as HotLead[]).map((c) => ({
    id: c.id,
    name: c.name,
    leadScore: c.leadScore,
    lastContactedAt: c.lastContactedAt,
  }));
}

/**
 * Today's tours from Chippi's internal Tour table — the same window the
 * calendar signal source reads (now → end of local day, excluding
 * cancelled). Named + time-stamped for the bento's "today's tours" cell.
 */
async function fetchToursToday(spaceId: string): Promise<TourToday[]> {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const { data } = await supabase
    .from('Tour')
    .select('id, startsAt, guestName, propertyAddress, contactId, status')
    .eq('spaceId', spaceId)
    .gte('startsAt', now.toISOString())
    .lte('startsAt', endOfDay.toISOString())
    .neq('status', 'cancelled')
    .order('startsAt', { ascending: true })
    .limit(TOURS_SHOWN);

  type Row = {
    id: string;
    startsAt: string;
    guestName: string | null;
    propertyAddress: string | null;
    contactId: string | null;
  };

  return ((data ?? []) as Row[]).map((t) => ({
    id: t.id,
    startsAt: t.startsAt,
    guestName: t.guestName,
    propertyAddress: t.propertyAddress,
    href: t.contactId ? `/contacts/${t.contactId}` : '/calendar',
  }));
}

/**
 * Post-close review campaigns over the trailing 90 days: how many asks went
 * out (any status past 'drafted') and how many the client clicked. Returns
 * null when the realtor has requested no reviews in the window — the Brief
 * omits the reputation cell rather than showing a hollow "0 of 0".
 */
const REPUTATION_WINDOW_DAYS = 90;

async function composeReputationStat(spaceId: string): Promise<ReputationStat | null> {
  const since = new Date(Date.now() - REPUTATION_WINDOW_DAYS * 86_400_000).toISOString();
  const [requestedRes, clickedRes] = await Promise.all([
    supabase
      .from('ReviewCampaign')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .in('status', ['sent', 'clicked', 'completed'])
      .gte('createdAt', since),
    supabase
      .from('ReviewCampaign')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .not('clickedAt', 'is', null)
      .gte('createdAt', since),
  ]);

  const requested = requestedRes.count ?? 0;
  if (requested === 0) return null;
  return { requested, clicked: clickedRes.count ?? 0 };
}

/** The realtor's first name for the greeting. */
async function fetchOwnerName(ownerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('User')
    .select('name')
    .eq('id', ownerId)
    .maybeSingle();
  const full = (data?.name as string | null) ?? null;
  if (!full) return null;
  return full.trim().split(/\s+/)[0] || null;
}

/**
 * Gather every number the bento renders, in parallel. Each sub-query is
 * independently fault-tolerant — a failed read yields its empty value
 * (0 / null / []) so a single slow table never blanks the whole dashboard.
 *
 * The greeting's momentum + tomorrow lines come straight off the composed
 * brief (composeBrief computes them internally and is itself fault-tolerant
 * per gatherer), so we don't re-query them here — one source of truth, no
 * duplicate reads.
 */
export async function composeBriefDashboard(
  spaceId: string,
  ownerId: string,
): Promise<BriefDashboard> {
  const [
    composed,
    newLeads,
    followUpsDue,
    pendingDrafts,
    clientsWaiting,
    pipeline,
    overnight,
    hotLeads,
    tours,
    reputation,
    ownerName,
  ] = await Promise.all([
    composeBrief(spaceId).catch(() => null),
    countNewLeads(spaceId).catch(() => 0),
    countFollowUpsDue(spaceId).catch(() => 0),
    countPendingDrafts(spaceId).catch(() => 0),
    countClientsWaiting(spaceId).catch(() => 0),
    composePipelineStat(spaceId).catch(() => null),
    composeOvernight(spaceId).catch(() => null),
    fetchHotLeads(spaceId).catch(() => []),
    fetchToursToday(spaceId).catch(() => []),
    composeReputationStat(spaceId).catch(() => null),
    fetchOwnerName(ownerId).catch(() => null),
  ]);

  // When the full compose failed (rare — every gatherer inside it is already
  // wrapped), fall back to an empty brief so the bento's other real cells
  // (pipeline, hot leads, tours, counts) still render.
  const brief: Brief = composed?.brief ?? {
    headline: '',
    subheadline: null,
    cards: [],
    tip: null,
    momentum: null,
    tomorrow: null,
    emptyState: null,
    sourcesUsed: [],
  };

  return {
    ownerName,
    brief,
    needsYou: { newLeads, followUpsDue, pendingDrafts, clientsWaiting },
    pipeline,
    overnight,
    hotLeads,
    tours,
    reputation,
  };
}
