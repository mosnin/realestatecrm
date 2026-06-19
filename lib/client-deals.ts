/**
 * Client-portal DEAL visibility — read-only, client-scoped resolution of the
 * deals a signed-in portal user is a party to, plus a clean, client-safe
 * progress TIMELINE for each.
 *
 * ── Security model (READ THIS BEFORE TOUCHING) ──────────────────────────────
 * The portal authorizes by the client's VERIFIED EMAIL (see lib/client-auth.ts
 * + lib/client-portal-data.ts). That email is the ONLY authorization boundary.
 *
 * A client may see a deal IFF:
 *   verified email  →  Contact row(s) with that email  →  DealContact link  →  Deal
 *
 * Every function here:
 *   1. Resolves the set of Contact ids the email owns (case-insensitive, with
 *      LIKE metacharacters escaped — the same wildcard-injection guard the rest
 *      of the portal uses).
 *   2. Resolves Deal ids ONLY through DealContact rows for those contacts.
 *   3. NEVER trusts a caller-supplied dealId for scoping: a dealId is only ever
 *      used to FILTER an already-scoped set. An unlinked deal id yields null /
 *      an empty list — it can never be read. FAIL CLOSED.
 *
 * ── What we expose (and, just as importantly, what we DON'T) ─────────────────
 * Deals carry a lot of internal, agent-only intelligence. A client must see a
 * calm progress view and the dates that affect THEM — nothing else. Exposed:
 *   - title, address (the client already knows the property they're buying)
 *   - a status ('active' | 'won' | 'lost' | 'on_hold') mapped to client-safe
 *     language; the raw enum is mapped, never leaked verbatim where it reads
 *     internal
 *   - the current STAGE name + an ordered timeline of stages (done/current/
 *     upcoming) derived from DealStage.position
 *   - closeDate
 *   - the closing CHECKLIST as client-appropriate milestones (label + dueAt +
 *     completed) — these are the inspection/appraisal/closing dates a buyer
 *     genuinely needs. NO internal note text.
 *
 * NEVER exposed (internal-only — explicitly omitted from every select):
 *   - Deal.value, commissionRate, probability, priority, position
 *   - wonLostReason / wonLostNote / closeReason / closeReasonDetail
 *   - nextAction / nextActionDueAt  (realtor's private "what's next")
 *   - description  (free-form agent notes)
 *   - DealActivity  (call/email/meeting/note log — agent-internal; not read)
 *   - any other party's Contact PII, lead scores, etc.
 */
import 'server-only';
import { supabase } from '@/lib/supabase';
import type { DealStageKind } from '@/lib/types';

/* ─── Public, client-safe shapes ────────────────────────────────────────────
 * These are the ONLY shapes that cross the wire to a client. If a field isn't
 * on one of these types, it isn't exposed. Keep them tight.
 */

/** One step in the visual progress timeline. */
export interface ClientDealTimelineStep {
  id: string;
  name: string;
  kind: DealStageKind | null;
  /** 'done' = a stage before the current one; 'current' = where the deal is
   *  now; 'upcoming' = still ahead. For won deals every step reads 'done'. */
  state: 'done' | 'current' | 'upcoming';
}

/** A client-appropriate milestone (sourced from the closing checklist). */
export interface ClientDealMilestone {
  id: string;
  label: string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
}

/** Coarse, client-facing progress label derived from status + stage kind. */
export type ClientDealProgress =
  | 'in_progress'
  | 'under_contract'
  | 'closing'
  | 'closed'
  | 'on_hold'
  | 'fell_through';

/** Summary row for the dashboard list. */
export interface ClientDealSummary {
  id: string;
  title: string;
  address: string | null;
  progress: ClientDealProgress;
  /** Current stage name (client-safe — the realtor's own stage label). */
  stageName: string | null;
  closeDate: string | null;
  /** The client's own role on this deal (buyer/seller/other) — useful framing,
   *  never another party's role. */
  role: string | null;
  updatedAt: string;
}

/** Full detail for the deal page: summary + timeline + milestones. */
export interface ClientDealDetail extends ClientDealSummary {
  timeline: ClientDealTimelineStep[];
  milestones: ClientDealMilestone[];
}

/* ─── Internal helpers ──────────────────────────────────────────────────────*/

/** Escape LIKE/ILIKE metacharacters so a full email matches literally (still
 *  case-insensitively). `%` and `_` are legal in email local parts; without
 *  this a client registered as `%@gmail.com` would match every gmail Contact.
 *  Mirrors the guard in lib/client-portal-data.ts. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Canonical pipeline order. Used only as a tiebreaker when stages share a
 *  position (shouldn't happen) and to map a stage kind → client progress. The
 *  PRIMARY ordering of the timeline is always DealStage.position. */
const KIND_ORDER: Record<DealStageKind, number> = {
  lead: 0,
  qualified: 1,
  active: 2,
  under_contract: 3,
  closing: 4,
  closed: 5,
};

/** Map the (internal) deal status + current stage kind to a coarse, friendly
 *  progress value. We never surface the raw status/stage to a client where it
 *  could read as internal jargon — this is the sanctioned, mapped view. */
function deriveProgress(
  status: string,
  currentKind: DealStageKind | null,
): ClientDealProgress {
  if (status === 'won') return 'closed';
  if (status === 'lost') return 'fell_through';
  if (status === 'on_hold') return 'on_hold';
  // active deal — refine by where it is in the pipeline.
  switch (currentKind) {
    case 'closed':
      return 'closed';
    case 'closing':
      return 'closing';
    case 'under_contract':
      return 'under_contract';
    default:
      return 'in_progress';
  }
}

/**
 * Resolve the Contact ids a verified email owns. The returned ids are the ONLY
 * contacts whose deals the caller may ever see.
 *
 * `email` MUST be the verified session email. Never pass a caller-supplied or
 * unverified address.
 */
async function ownedContactIds(email: string): Promise<string[]> {
  const lower = email.trim().toLowerCase();
  if (!lower) return [];
  const { data } = await supabase
    .from('Contact')
    .select('id')
    .ilike('email', escapeLike(lower));
  return (data ?? []).map((c) => c.id as string);
}

/** Build the ordered timeline for a deal from its space's stages. */
function buildTimeline(
  stages: { id: string; name: string; position: number; kind: string | null }[],
  currentStageId: string,
  status: string,
): { timeline: ClientDealTimelineStep[]; currentKind: DealStageKind | null } {
  const kindRank = (kind: string | null): number =>
    kind && kind in KIND_ORDER ? KIND_ORDER[kind as DealStageKind] : 99;
  const ordered = [...stages].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return kindRank(a.kind) - kindRank(b.kind);
  });

  const currentIdx = ordered.findIndex((s) => s.id === currentStageId);
  const current = currentIdx >= 0 ? ordered[currentIdx] : null;
  const currentKind = (current?.kind as DealStageKind | null) ?? null;
  // A won deal has, in effect, completed the whole pipeline.
  const won = status === 'won';

  const timeline: ClientDealTimelineStep[] = ordered.map((s, i) => {
    let state: ClientDealTimelineStep['state'];
    if (won) state = 'done';
    else if (currentIdx < 0) state = 'upcoming';
    else if (i < currentIdx) state = 'done';
    else if (i === currentIdx) state = 'current';
    else state = 'upcoming';
    return {
      id: s.id,
      name: s.name,
      kind: (s.kind as DealStageKind | null) ?? null,
      state,
    };
  });

  return { timeline, currentKind };
}

/* ─── Public API ────────────────────────────────────────────────────────────*/

/**
 * Every deal the signed-in client is a party to, as client-safe summaries.
 * Returns [] when the email owns no linked deals (the common case). Read-only.
 */
export async function getClientDeals(email: string): Promise<ClientDealSummary[]> {
  const contactIds = await ownedContactIds(email);
  if (contactIds.length === 0) return [];

  // The ONLY bridge from "this client" to "these deals". Carries the client's
  // own role; we deliberately do not read any other DealContact rows.
  const { data: links } = await supabase
    .from('DealContact')
    .select('dealId, role')
    .in('contactId', contactIds);

  const roleByDeal = new Map<string, string | null>();
  for (const l of links ?? []) {
    // If the client is linked to a deal under multiple contacts/roles, keep the
    // first non-null role we see (buyer/seller is more meaningful than null).
    const dealId = l.dealId as string;
    const role = (l.role as string | null) ?? null;
    if (!roleByDeal.has(dealId) || (role && !roleByDeal.get(dealId))) {
      roleByDeal.set(dealId, role);
    }
  }
  const dealIds = Array.from(roleByDeal.keys());
  if (dealIds.length === 0) return [];

  // Safe-fields-only select. value/commission/probability/priority/nextAction/
  // wonLost*/closeReason*/description are NOT selected — they never load.
  const { data: deals } = await supabase
    .from('Deal')
    .select('id, title, address, status, stageId, closeDate, updatedAt')
    .in('id', dealIds)
    .order('updatedAt', { ascending: false });

  if (!deals || deals.length === 0) return [];

  // Resolve the current stage (name + kind) for each deal. One batched read.
  const stageIds = Array.from(new Set(deals.map((d) => d.stageId as string)));
  const { data: stages } = await supabase
    .from('DealStage')
    .select('id, name, kind')
    .in('id', stageIds);
  const stageById = new Map(
    (stages ?? []).map((s) => [s.id as string, s as { id: string; name: string; kind: string | null }]),
  );

  return deals.map((d) => {
    const stage = stageById.get(d.stageId as string) ?? null;
    const currentKind = (stage?.kind as DealStageKind | null) ?? null;
    return {
      id: d.id as string,
      title: (d.title as string) ?? 'Your deal',
      address: (d.address as string | null) ?? null,
      progress: deriveProgress((d.status as string) ?? 'active', currentKind),
      stageName: stage?.name ?? null,
      closeDate: (d.closeDate as string | null) ?? null,
      role: roleByDeal.get(d.id as string) ?? null,
      updatedAt: (d.updatedAt as string) ?? new Date().toISOString(),
    };
  });
}

/**
 * One deal, scoped to the signed-in client. Returns null if the client is NOT
 * linked to `dealId` (so callers 404 — never distinguishing "doesn't exist"
 * from "not yours", and never leaking a foreign deal). FAIL CLOSED.
 *
 * `dealId` is caller-supplied and is used ONLY to filter the client's already-
 * resolved deal set — it is never the basis for the scope.
 */
export async function getClientDeal(
  email: string,
  dealId: string,
): Promise<ClientDealDetail | null> {
  if (!dealId) return null;
  const contactIds = await ownedContactIds(email);
  if (contactIds.length === 0) return null;

  // Authorization gate: is THIS deal linked to one of the client's contacts?
  // Scoped by contactId (which we resolved from the verified email) AND the
  // requested dealId. No row → not the client's deal → null.
  const { data: link } = await supabase
    .from('DealContact')
    .select('dealId, role')
    .eq('dealId', dealId)
    .in('contactId', contactIds)
    .limit(1)
    .maybeSingle();
  if (!link) return null;

  // Safe-fields-only select, additionally scoped by id (defense in depth; the
  // link already proved ownership).
  const { data: deal } = await supabase
    .from('Deal')
    .select('id, spaceId, title, address, status, stageId, closeDate, updatedAt')
    .eq('id', dealId)
    .maybeSingle();
  if (!deal) return null;

  const spaceId = deal.spaceId as string;

  // Stages for the timeline + checklist for milestones, both scoped to the
  // deal's own space / deal id. Checklist text is the inspection/closing
  // schedule a buyer needs; we expose label + dates + completion ONLY.
  const [{ data: stages }, { data: checklist }] = await Promise.all([
    supabase
      .from('DealStage')
      .select('id, name, position, kind')
      .eq('spaceId', spaceId)
      .order('position', { ascending: true }),
    supabase
      .from('DealChecklistItem')
      .select('id, label, dueAt, completedAt, position')
      .eq('dealId', dealId)
      .order('position', { ascending: true }),
  ]);

  const { timeline, currentKind } = buildTimeline(
    (stages ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      position: (s.position as number) ?? 0,
      kind: (s.kind as string | null) ?? null,
    })),
    deal.stageId as string,
    (deal.status as string) ?? 'active',
  );

  const currentStage = (stages ?? []).find((s) => s.id === deal.stageId) ?? null;

  const milestones: ClientDealMilestone[] = (checklist ?? []).map((c) => ({
    id: c.id as string,
    label: c.label as string,
    dueAt: (c.dueAt as string | null) ?? null,
    completed: Boolean(c.completedAt),
    completedAt: (c.completedAt as string | null) ?? null,
  }));

  return {
    id: deal.id as string,
    title: (deal.title as string) ?? 'Your deal',
    address: (deal.address as string | null) ?? null,
    progress: deriveProgress((deal.status as string) ?? 'active', currentKind),
    stageName: (currentStage?.name as string | null) ?? null,
    closeDate: (deal.closeDate as string | null) ?? null,
    role: (link.role as string | null) ?? null,
    updatedAt: (deal.updatedAt as string) ?? new Date().toISOString(),
    timeline,
    milestones,
  };
}
