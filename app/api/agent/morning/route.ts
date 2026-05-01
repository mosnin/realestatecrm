/**
 * GET /api/agent/morning
 *
 * The composed morning story for the /chippi home. Returns the counts that
 * matter for the realtor's "what's pressing today" sentence — the inputs the
 * client picks the loudest fact from.
 *
 * Different from /api/agent/today (which lists items for the dispatch
 * console) and /api/agent/priority (which returns curated PRIORITY_LIST
 * picks). This one is a tight summary feed used by the home greeting only:
 * one fetch, one shape, one sentence.
 *
 * Realtor space only — brokerage-routed contacts (brokerageId !== null) are
 * excluded so the realtor's morning briefing reflects what's on _their_
 * desk, not what's been routed past them.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { dealHealth } from '@/lib/deals/health';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';

export interface MorningSummary {
  /** Contacts tagged 'new-lead' (haven't been viewed yet). */
  newPeopleCount: number;
  /** Contacts whose leadScore >= HOT_LEAD_THRESHOLD. */
  hotPeopleCount: number;
  /** Contact follow-ups that are past their date. */
  overdueFollowUpsCount: number;
  /** Active deals classified as 'stuck' by dealHealth. */
  stuckDealsCount: number;
  /** Active deals with a closeDate inside the next 7 days. */
  closingThisWeekCount: number;
  /** Pending agent drafts. */
  draftsCount: number;
  /** Pending agent questions. */
  questionsCount: number;
  /** Name of the top-priority contact, if any — drives "Start with X." */
  topPersonName: string | null;
  /** Their id so the narration can deep-link to the person's page. */
  topPersonId: string | null;
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const nowIso = new Date().toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);

  const [
    newPeopleRes,
    hotPeopleRes,
    overdueFollowUpsRes,
    activeDealsRes,
    draftsRes,
    questionsRes,
    priorityRes,
  ] = await Promise.all([
    // New-lead tagged contacts (haven't been opened)
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .contains('tags', ['new-lead']),
    // Hot contacts
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .gte('leadScore', HOT_LEAD_THRESHOLD),
    // Contact follow-ups overdue
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lt('followUpAt', nowIso),
    // Active deals — pulled in full so we can classify health client-side
    // here; cheaper than another round trip and the count is bounded.
    supabase
      .from('Deal')
      .select('id, status, updatedAt, closeDate, followUpAt, nextAction, nextActionDueAt')
      .eq('spaceId', space.id)
      .eq('status', 'active')
      .limit(500),
    // Pending agent drafts
    supabase
      .from('AgentDraft')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'pending'),
    // Pending agent questions
    supabase
      .from('AgentQuestion')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'pending'),
    // Latest PRIORITY_LIST memory entry — the agent's last-known top pick.
    // Source of truth for "Start with X." Falls back to a hot contact if
    // no priority list has been written yet.
    supabase
      .from('AgentMemory')
      .select('content, createdAt')
      .eq('spaceId', space.id)
      .eq('kind', 'PRIORITY_LIST')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Classify deal health — only count those flagged 'stuck' for the headline.
  const activeDeals = (activeDealsRes.data ?? []) as Array<{
    id: string;
    status: string;
    updatedAt: string | null;
    closeDate: string | null;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  }>;
  let stuckDealsCount = 0;
  let closingThisWeekCount = 0;
  const nowDate = new Date();
  for (const d of activeDeals) {
    // dealHealth expects a Deal-shaped object; the DB query returns date-as-
    // string. Cast through unknown to satisfy the Pick<Deal, ...> contract;
    // updatedAt is non-null in the schema so we fall back to "now" only as a
    // belt-and-suspenders guard against a corrupt row.
    const health = dealHealth({
      status: 'active',
      updatedAt: (d.updatedAt ? new Date(d.updatedAt) : nowDate) as unknown as Date,
      closeDate: d.closeDate as unknown as Date | null,
      followUpAt: d.followUpAt as unknown as Date | null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt as unknown as Date | null,
    });
    if (health.state === 'stuck') stuckDealsCount += 1;
    if (d.closeDate) {
      const close = new Date(d.closeDate);
      if (!isNaN(close.getTime()) && close >= today && close <= weekOut) {
        closingThisWeekCount += 1;
      }
    }
  }

  // Resolve the top-priority person from the latest PRIORITY_LIST memory.
  // Schema: content is { items: [{ contactId, name, reason, leadScore, ... }] }
  let topPersonName: string | null = null;
  let topPersonId: string | null = null;
  const priorityMemo = priorityRes.data as { content?: unknown } | null;
  if (priorityMemo?.content && typeof priorityMemo.content === 'object') {
    const items = (priorityMemo.content as { items?: unknown }).items;
    if (Array.isArray(items) && items.length > 0) {
      const top = items[0] as { name?: unknown; contactId?: unknown };
      if (typeof top?.name === 'string') topPersonName = top.name;
      if (typeof top?.contactId === 'string') topPersonId = top.contactId;
    }
  }

  // Fallback when no priority list exists yet: pick the hottest contact by
  // score. Single read, light query — only fires when the agent hasn't
  // produced a priority list yet (new spaces, pre-first-run, etc.).
  if (!topPersonName) {
    const { data } = await supabase
      .from('Contact')
      .select('id, name')
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .gte('leadScore', HOT_LEAD_THRESHOLD)
      .order('leadScore', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      topPersonName = (data as { name?: string }).name ?? null;
      topPersonId = (data as { id?: string }).id ?? null;
    }
  }

  const summary: MorningSummary = {
    newPeopleCount: newPeopleRes.count ?? 0,
    hotPeopleCount: hotPeopleRes.count ?? 0,
    overdueFollowUpsCount: overdueFollowUpsRes.count ?? 0,
    stuckDealsCount,
    closingThisWeekCount,
    draftsCount: draftsRes.count ?? 0,
    questionsCount: questionsRes.count ?? 0,
    topPersonName,
    topPersonId,
  };

  return NextResponse.json(summary);
}
