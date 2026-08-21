/**
 * Move (or open) a deal because something real happened — first-touch sent,
 * tour booked, offer accepted. Kanban drag remains the realtor override:
 * this helper never pulls a deal backward.
 *
 * Stage targeting uses DealStage.kind when present, then name heuristics
 * (same ideas as POST /api/stages). Missing pipelines are a no-op, not a
 * fabricated board.
 *
 * Tenant scoping: every Deal / DealStage / DealActivity write is
 * `.eq('spaceId', spaceId)`. DealContact has no spaceId column — we look
 * up links by contactId, then re-assert tenancy on Deal.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { DealStageKind } from '@/lib/types';
import {
  ensureDefaultPipelines,
  type DefaultPipelineType,
} from '@/lib/deals/default-pipelines';

export type PipelineEvent = 'first_touch_sent' | 'tour_booked' | 'offer_accepted';

export interface AdvanceFromEventInput {
  spaceId: string;
  event: PipelineEvent;
  contactId?: string | null;
  dealId?: string | null;
  sourceTourId?: string | null;
  title?: string | null;
  address?: string | null;
  /** When set, new deals land on this board. Otherwise inferred from the contact. */
  pipelineType?: DefaultPipelineType | null;
}

export type AdvanceFromEventResult =
  | { ok: true; dealId: string; created: boolean; moved: boolean; reason?: 'already_ahead' | 'terminal' | 'same_stage' }
  | { ok: false; reason: 'no_stage' | 'no_deal' | 'lookup_failed' };

const EVENT_KIND: Record<PipelineEvent, DealStageKind> = {
  first_touch_sent: 'lead',
  tour_booked: 'active',
  offer_accepted: 'under_contract',
};

const KIND_RANK: Record<DealStageKind, number> = {
  lead: 0,
  qualified: 1,
  active: 2,
  under_contract: 3,
  closing: 4,
  closed: 5,
};

const NAME_HINTS: Record<DealStageKind, RegExp> = {
  lead: /\b(lead|new|prospect|inquiry|intake)\b/i,
  qualified: /\b(qualif|pre-?approv)\b/i,
  active: /\b(showing|tour|active|screening|market|listing)\b/i,
  under_contract: /\b(under.?contract|pending|accepted)\b/i,
  closing: /\b(closing|escrow)\b/i,
  closed: /\b(closed|won|complete|done|funded)\b/i,
};

const EVENT_LABEL: Record<PipelineEvent, string> = {
  first_touch_sent: 'first touch sent',
  tour_booked: 'tour booked',
  offer_accepted: 'offer accepted',
};

interface StageRow {
  id: string;
  name: string;
  kind: DealStageKind | null;
  position: number;
  pipelineId: string | null;
  pipelineType: string | null;
}

interface DealRow {
  id: string;
  stageId: string;
  title: string;
  status: string;
  sourceTourId: string | null;
  contractAcceptedAt?: string | null;
}

function inferKind(name: string): DealStageKind | null {
  const n = name.toLowerCase();
  if (NAME_HINTS.closed.test(n)) return 'closed';
  if (NAME_HINTS.closing.test(n)) return 'closing';
  if (NAME_HINTS.under_contract.test(n)) return 'under_contract';
  if (NAME_HINTS.active.test(n)) return 'active';
  if (NAME_HINTS.qualified.test(n)) return 'qualified';
  if (NAME_HINTS.lead.test(n)) return 'lead';
  return null;
}

function kindOf(stage: StageRow): DealStageKind | null {
  return stage.kind && stage.kind in KIND_RANK ? stage.kind : inferKind(stage.name);
}

function pickTarget(stages: StageRow[], event: PipelineEvent): StageRow | null {
  const want = EVENT_KIND[event];
  const byKind = stages.find((s) => s.kind === want);
  if (byKind) return byKind;
  const byName = stages.find((s) => NAME_HINTS[want].test(s.name));
  if (byName) return byName;
  if (want === 'lead') return stages[0] ?? null;
  return null;
}

function isAheadOrEqual(current: StageRow, target: StageRow): boolean {
  const currentKind = kindOf(current);
  const targetKind = kindOf(target) ?? EVENT_KIND.tour_booked;
  if (currentKind && currentKind in KIND_RANK) {
    return KIND_RANK[currentKind] >= KIND_RANK[targetKind];
  }
  if (current.pipelineId && target.pipelineId && current.pipelineId === target.pipelineId) {
    return current.position >= target.position;
  }
  return false;
}

async function loadStages(spaceId: string): Promise<StageRow[] | null> {
  const { data, error } = await supabase
    .from('DealStage')
    .select('id, name, kind, position, pipelineId, pipelineType')
    .eq('spaceId', spaceId)
    .order('position', { ascending: true });
  if (error) {
    logger.warn('[deals.advance] stage lookup failed', { spaceId, err: error.message });
    return null;
  }
  return (data ?? []) as StageRow[];
}

function stagesForDeal(all: StageRow[], current: StageRow | undefined): StageRow[] {
  if (!current) return preferPipeline(all, 'buyer');
  if (current.pipelineId) {
    const same = all.filter((s) => s.pipelineId === current.pipelineId);
    if (same.length) return same;
  }
  if (current.pipelineType) {
    const same = all.filter((s) => s.pipelineType === current.pipelineType);
    if (same.length) return same;
  }
  return all;
}

function preferPipeline(all: StageRow[], type: DefaultPipelineType | null): StageRow[] {
  if (!type) return preferPipeline(all, 'buyer');
  const match = all.filter((s) => s.pipelineType === type);
  return match.length ? match : all;
}

async function loadContactLeadType(
  spaceId: string,
  contactId: string | null | undefined,
): Promise<DefaultPipelineType | null> {
  if (!contactId) return null;
  const { data, error } = await supabase
    .from('Contact')
    .select('leadType')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error) {
    logger.warn('[deals.advance] contact leadType lookup failed', { spaceId, err: error.message });
    return null;
  }
  const t = (data as { leadType?: string } | null)?.leadType;
  if (t === 'seller' || t === 'buyer' || t === 'rental') return t;
  return null;
}

async function stampContractAcceptedAt(spaceId: string, deal: DealRow): Promise<void> {
  if (deal.contractAcceptedAt) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('Deal')
    .update({ contractAcceptedAt: now, updatedAt: now })
    .eq('id', deal.id)
    .eq('spaceId', spaceId)
    .is('contractAcceptedAt', null);
  if (error) {
    logger.warn('[deals.advance] contractAcceptedAt stamp failed', {
      spaceId,
      dealId: deal.id,
      err: error.message,
    });
  }
}

async function findDeal(input: AdvanceFromEventInput): Promise<DealRow | null> {
  if (input.dealId) {
    const { data, error } = await supabase
      .from('Deal')
      .select('id, stageId, title, status, sourceTourId, contractAcceptedAt')
      .eq('id', input.dealId)
      .eq('spaceId', input.spaceId)
      .maybeSingle();
    if (error) {
      logger.warn('[deals.advance] deal lookup failed', { spaceId: input.spaceId, err: error.message });
      return null;
    }
    return (data as DealRow | null) ?? null;
  }

  if (input.sourceTourId) {
    const { data, error } = await supabase
      .from('Deal')
      .select('id, stageId, title, status, sourceTourId, contractAcceptedAt')
      .eq('spaceId', input.spaceId)
      .eq('sourceTourId', input.sourceTourId)
      .maybeSingle();
    if (error) {
      logger.warn('[deals.advance] sourceTour lookup failed', { spaceId: input.spaceId, err: error.message });
    } else if (data) {
      return data as DealRow;
    }
  }

  if (!input.contactId) return null;

  const { data: links, error: linkErr } = await supabase
    .from('DealContact')
    .select('dealId')
    .eq('contactId', input.contactId)
    .limit(20);
  if (linkErr) {
    logger.warn('[deals.advance] DealContact lookup failed', {
      spaceId: input.spaceId,
      err: linkErr.message,
    });
    return null;
  }
  const ids = ((links ?? []) as Array<{ dealId: string }>).map((r) => r.dealId);
  if (ids.length === 0) return null;

  const { data: deals, error: dealErr } = await supabase
    .from('Deal')
    .select('id, stageId, title, status, sourceTourId, contractAcceptedAt')
    .in('id', ids)
    .eq('spaceId', input.spaceId);
  if (dealErr) {
    logger.warn('[deals.advance] deals-for-contact lookup failed', {
      spaceId: input.spaceId,
      err: dealErr.message,
    });
    return null;
  }
  const rows = (deals ?? []) as DealRow[];
  return rows.find((d) => d.status === 'active') ?? rows[0] ?? null;
}

async function createDeal(
  input: AdvanceFromEventInput,
  stage: StageRow,
): Promise<string | null> {
  const title = (input.title ?? '').trim().slice(0, 255) || EVENT_LABEL[input.event];
  const now = new Date().toISOString();

  const { data: last } = await supabase
    .from('Deal')
    .select('position')
    .eq('stageId', stage.id)
    .eq('spaceId', input.spaceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position?: number } | null)?.position ?? -1) + 1;

  const dealId = crypto.randomUUID();
  const { error } = await supabase.from('Deal').insert({
    id: dealId,
    spaceId: input.spaceId,
    title,
    address: input.address?.trim() || null,
    description: `Opened because ${EVENT_LABEL[input.event]}.`,
    stageId: stage.id,
    status: 'active',
    priority: 'MEDIUM',
    position,
    milestones: [],
    sourceTourId: input.sourceTourId ?? null,
    stageChangedAt: now,
    updatedAt: now,
  });
  if (error) {
    logger.warn('[deals.advance] deal insert failed', { spaceId: input.spaceId, err: error.message });
    return null;
  }

  if (input.contactId) {
    const { error: linkErr } = await supabase.from('DealContact').insert({
      dealId,
      contactId: input.contactId,
    });
    if (linkErr) {
      logger.warn('[deals.advance] DealContact insert failed', {
        spaceId: input.spaceId,
        dealId,
        err: linkErr.message,
      });
    }
  }

  const { error: actErr } = await supabase.from('DealActivity').insert({
    id: crypto.randomUUID(),
    dealId,
    spaceId: input.spaceId,
    type: 'stage_change',
    content: `On the board — ${EVENT_LABEL[input.event]}`,
    metadata: { via: 'event', event: input.event, toStageId: stage.id },
  });
  if (actErr) {
    logger.warn('[deals.advance] activity insert failed', { spaceId: input.spaceId, dealId, err: actErr.message });
  }

  return dealId;
}

async function moveDeal(
  input: AdvanceFromEventInput,
  deal: DealRow,
  from: StageRow,
  to: StageRow,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('Deal')
    .update({
      stageId: to.id,
      stageChangedAt: now,
      updatedAt: now,
      ...(input.sourceTourId && !deal.sourceTourId ? { sourceTourId: input.sourceTourId } : {}),
      ...(input.event === 'offer_accepted' && !deal.contractAcceptedAt
        ? { contractAcceptedAt: now }
        : {}),
    })
    .eq('id', deal.id)
    .eq('spaceId', input.spaceId);
  if (error) {
    logger.warn('[deals.advance] deal update failed', { spaceId: input.spaceId, dealId: deal.id, err: error.message });
    return false;
  }

  const { error: actErr } = await supabase.from('DealActivity').insert({
    id: crypto.randomUUID(),
    dealId: deal.id,
    spaceId: input.spaceId,
    type: 'stage_change',
    content: `Moved from "${from.name}" to "${to.name}" — ${EVENT_LABEL[input.event]}`,
    metadata: {
      via: 'event',
      event: input.event,
      fromStageId: from.id,
      toStageId: to.id,
    },
  });
  if (actErr) {
    logger.warn('[deals.advance] activity insert failed', {
      spaceId: input.spaceId,
      dealId: deal.id,
      err: actErr.message,
    });
  }
  return true;
}

/**
 * Advance (or open) the contact's deal for a real-world event.
 * Never throws — callers treat this as best-effort board hygiene.
 */
export async function advanceDealFromEvent(
  input: AdvanceFromEventInput,
): Promise<AdvanceFromEventResult> {
  const preferred =
    input.pipelineType ??
    (await loadContactLeadType(input.spaceId, input.contactId)) ??
    (input.event === 'tour_booked' ? 'buyer' : 'buyer');

  let stages = await loadStages(input.spaceId);
  if (stages === null) return { ok: false, reason: 'lookup_failed' };
  if (stages.length === 0 || !stages.some((s) => s.pipelineType === preferred)) {
    await ensureDefaultPipelines(input.spaceId);
    stages = await loadStages(input.spaceId);
    if (stages === null) return { ok: false, reason: 'lookup_failed' };
  }
  if (stages.length === 0) return { ok: false, reason: 'no_stage' };

  const existing = await findDeal(input);

  if (existing) {
    if (existing.status === 'won' || existing.status === 'lost') {
      return { ok: true, dealId: existing.id, created: false, moved: false, reason: 'terminal' };
    }
    const current = stages.find((s) => s.id === existing.stageId);
    const pool = stagesForDeal(stages, current);
    const target = pickTarget(pool, input.event);
    if (!target) return { ok: false, reason: 'no_stage' };
    if (existing.stageId === target.id) {
      if (input.event === 'offer_accepted') {
        await stampContractAcceptedAt(input.spaceId, existing);
      }
      return { ok: true, dealId: existing.id, created: false, moved: false, reason: 'same_stage' };
    }
    if (current && isAheadOrEqual(current, target)) {
      if (input.event === 'offer_accepted') {
        await stampContractAcceptedAt(input.spaceId, existing);
      }
      return { ok: true, dealId: existing.id, created: false, moved: false, reason: 'already_ahead' };
    }
    const from = current ?? { ...target, name: 'Unknown' };
    const moved = await moveDeal(input, existing, from, target);
    if (!moved) return { ok: false, reason: 'lookup_failed' };
    return { ok: true, dealId: existing.id, created: false, moved: true };
  }

  // Offer-accepted only moves a deal that already exists — an orphan offer
  // is not enough to invent a transaction.
  if (input.event === 'offer_accepted') {
    return { ok: false, reason: 'no_deal' };
  }

  const target = pickTarget(preferPipeline(stages, preferred), input.event);
  if (!target) return { ok: false, reason: 'no_stage' };
  const createdId = await createDeal(input, target);
  if (!createdId) return { ok: false, reason: 'lookup_failed' };
  return { ok: true, dealId: createdId, created: true, moved: false };
}
