import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncDeal } from '@/lib/vectorize';
import { notifyNewDeal } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { normalizeCloseReason } from '@/lib/close-reason';
import { checkRateLimit } from '@/lib/rate-limit';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import type { Deal, DealStage } from '@/lib/types';
import { tenantTable } from '@/lib/tenant-db';


export async function GET(req: NextRequest) {
  try {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Get deals with stage (paginated)
  const limit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '200') || 200), 500);
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0') || 0);

  const { data: dealRows, error: dealError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('*, DealStage(id, spaceId, name, color, position)')
    .order('position', { ascending: true })
    .range(offset, offset + limit - 1);
  if (dealError) throw dealError;

  const dealIds = dealRows.map((r: any) => r.id);

  // Get dealContacts with contact info
  let dealContactRows: any[] = [];
  if (dealIds.length > 0) {
    const { data, error: dcError } = await supabase
      .from('DealContact')
      .select('dealId, contactId, Contact(id, name)')
      .in('dealId', dealIds);
    if (dcError) throw dcError;
    dealContactRows = data || [];
  }

  // Group dealContacts by dealId
  const dcByDeal = new Map<string, any[]>();
  for (const dc of dealContactRows) {
    const arr = dcByDeal.get(dc.dealId) || [];
    arr.push({
      dealId: dc.dealId,
      contactId: dc.contactId,
      contact: dc.Contact ? { id: dc.Contact.id, name: dc.Contact.name } : null
    });
    dcByDeal.set(dc.dealId, arr);
  }

  const deals = dealRows.map((row: any) => ({
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    description: row.description,
    value: row.value,
    commissionRate: row.commissionRate ?? null,
    probability: row.probability ?? null,
    address: row.address,
    priority: row.priority,
    closeDate: row.closeDate,
    stageId: row.stageId,
    position: row.position,
    status: row.status,
    followUpAt: row.followUpAt,
    milestones: row.milestones ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stage: row.DealStage
      ? {
          id: row.DealStage.id,
          spaceId: row.DealStage.spaceId,
          name: row.DealStage.name,
          color: row.DealStage.color,
          position: row.DealStage.position
        }
      : null,
    dealContacts: dcByDeal.get(row.id) || []
  }));

  return NextResponse.json(deals);
  } catch (err) {
    logger.error('[deals/GET] failed', {}, err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { slug, title, description, value, commissionRate, probability, milestones, address, priority, closeDate, stageId, contactIds, propertyId, status, closeReason, closeReasonDetail } = body;

  if (typeof slug !== 'string' || !slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space, userId } = auth;

  // Rate limit: 60 deal creations per hour per user. Deal creation is a
  // deliberate, low-frequency action; 60/hr leaves ample headroom for bulk
  // entry while stopping runaway scripts and retry storms.
  const { allowed } = await checkRateLimit(`deals:create:${userId}`, 60, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Validate title length
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 255) {
    return NextResponse.json({ error: 'Title required (max 255 chars)' }, { status: 400 });
  }

  // Cap contactIds — a caller must not be able to pass thousands. Reject
  // anything over the limit outright (matches the explicit-rejection style of
  // the milestone/value validators rather than silently truncating links).
  const MAX_CONTACT_IDS = 50;
  if (contactIds !== undefined && contactIds !== null) {
    if (!Array.isArray(contactIds)) {
      return NextResponse.json({ error: 'contactIds must be an array' }, { status: 400 });
    }
    if (contactIds.length > MAX_CONTACT_IDS) {
      return NextResponse.json({ error: `Too many contacts (max ${MAX_CONTACT_IDS})` }, { status: 400 });
    }
  }

  // Validate status. A deal may be created directly in a terminal status
  // (e.g. logging an already-won deal), so accept the same enum the PATCH
  // route does and default to 'active'.
  const VALID_STATUSES = ['active', 'won', 'lost', 'on_hold'];
  if (status !== undefined && status !== null && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  const statusVal: string = status ?? 'active';

  try {
  // Close-reason taxonomy (Feature B): only meaningful when the deal is created
  // directly in a terminal status. normalizeCloseReason validates the key
  // against the outcome and never throws — anything unrecognized becomes null.
  const createOutcome: 'won' | 'lost' | null =
    statusVal === 'won' ? 'won' : statusVal === 'lost' ? 'lost' : null;
  const closeReasonVal = createOutcome ? normalizeCloseReason(closeReason, createOutcome) : null;
  const closeReasonDetailVal =
    createOutcome && closeReasonDetail != null && String(closeReasonDetail).trim() !== ''
      ? String(closeReasonDetail).trim().slice(0, 2000)
      : null;

  // Verify the target stage belongs to this space (prevents cross-space stage injection)
  const { data: stageCheck, error: stageCheckErr } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
    .select('id, pipelineType')
    .eq('id', stageId)
    .maybeSingle();
  if (stageCheckErr) throw stageCheckErr;
  if (!stageCheck) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

  // If contacts include a buyer or seller, auto-assign to the matching pipeline's first stage.
  // Buyer takes precedence over seller when both are present.
  let finalStageId = stageId;
  if (contactIds?.length) {
    const currentPipeline = stageCheck.pipelineType as string | null;
    if (currentPipeline !== 'buyer') {
      const { data: buyerContacts } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
        .select('id, leadType')
        .in('id', contactIds)
        .eq('leadType', 'buyer')
        .limit(1);
      if (buyerContacts && buyerContacts.length > 0) {
        const { data: buyerStage } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
          .select('id')
          .eq('pipelineType', 'buyer')
          .order('position', { ascending: true })
          .limit(1);
        if (buyerStage && buyerStage.length > 0) {
          finalStageId = buyerStage[0].id;
        }
      }
    }
    if (finalStageId === stageId && currentPipeline !== 'seller') {
      const { data: sellerContacts } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
        .select('id, leadType')
        .in('id', contactIds)
        .eq('leadType', 'seller')
        .limit(1);
      if (sellerContacts && sellerContacts.length > 0) {
        const { data: sellerStage } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
          .select('id')
          .eq('pipelineType', 'seller')
          .order('position', { ascending: true })
          .limit(1);
        if (sellerStage && sellerStage.length > 0) {
          finalStageId = sellerStage[0].id;
        }
      }
    }
  }

  const { data: lastDealRows, error: lastDealError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('position')
    .eq('stageId', finalStageId)
    .order('position', { ascending: false })
    .limit(1);
  if (lastDealError) throw lastDealError;
  const lastPosition = lastDealRows.length > 0 ? lastDealRows[0].position : -1;

  const dealId = crypto.randomUUID();
  const valueVal = value != null && value !== '' ? parseFloat(value) : null;
  if (valueVal !== null && isNaN(valueVal)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }
  const commissionRateVal = commissionRate != null && commissionRate !== '' ? parseFloat(commissionRate) : null;
  if (commissionRateVal !== null && (isNaN(commissionRateVal) || commissionRateVal < 0 || commissionRateVal > 100)) {
    return NextResponse.json({ error: 'Invalid commissionRate (must be 0–100)' }, { status: 400 });
  }
  const probabilityVal = probability != null && probability !== '' ? parseInt(String(probability), 10) : null;
  if (probabilityVal !== null && (isNaN(probabilityVal) || probabilityVal < 0 || probabilityVal > 100)) {
    return NextResponse.json({ error: 'Invalid probability (must be 0–100)' }, { status: 400 });
  }
  let closeDateVal: string | null = null;
  if (closeDate) {
    const d = new Date(closeDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
    closeDateVal = d.toISOString();
  }

  // propertyId: optional FK to an existing Property in this space. We verify
  // ownership rather than trusting the client — wizard step 3 picks from the
  // workspace's own list, but the request still has to be authoritative.
  let propertyIdVal: string | null = null;
  if (propertyId != null && propertyId !== '') {
    if (typeof propertyId !== 'string') {
      return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
    }
    const trimmed = propertyId.slice(0, 64);
    const { data: propRow, error: propErr } = await tenantTable(supabase, 'Property', { spaceId: space.id })
      .select('id')
      .eq('id', trimmed)
      .maybeSingle();
    if (propErr) throw propErr;
    if (!propRow) return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
    propertyIdVal = trimmed;
  }

  let milestonesVal: import('@/lib/types').DealMilestone[] = [];
  if (milestones !== undefined) {
    if (!Array.isArray(milestones)) {
      return NextResponse.json({ error: 'milestones must be an array' }, { status: 400 });
    }
    const truncated = (milestones as unknown[]).slice(0, 20);
    for (const item of truncated) {
      if (typeof item !== 'object' || item === null) {
        return NextResponse.json({ error: 'Each milestone must be an object' }, { status: 400 });
      }
      const m = item as Record<string, unknown>;
      if (typeof m.id !== 'string') {
        return NextResponse.json({ error: 'Milestone id must be a string' }, { status: 400 });
      }
      if (typeof m.label !== 'string' || (m.label as string).length > 120) {
        return NextResponse.json({ error: 'Milestone label must be a string (max 120 chars)' }, { status: 400 });
      }
      if (typeof m.completed !== 'boolean') {
        return NextResponse.json({ error: 'Milestone completed must be a boolean' }, { status: 400 });
      }
      if (m.dueDate !== null && m.dueDate !== undefined && typeof m.dueDate !== 'string') {
        return NextResponse.json({ error: 'Milestone dueDate must be a string or null' }, { status: 400 });
      }
      if (m.completedAt !== null && m.completedAt !== undefined && typeof m.completedAt !== 'string') {
        return NextResponse.json({ error: 'Milestone completedAt must be a string or null' }, { status: 400 });
      }
    }
    milestonesVal = truncated.map((item) => {
      const m = item as Record<string, unknown>;
      return {
        id: m.id as string,
        label: (m.label as string).slice(0, 120),
        dueDate: (m.dueDate as string | null | undefined) ?? null,
        completed: m.completed as boolean,
        completedAt: (m.completedAt as string | null | undefined) ?? null,
      };
    });
  }

  const nowIso = new Date().toISOString();

  // Idempotency guard: a double-submit or client retry must not create a
  // second deal. We reuse withIdempotency (the same in-process guard the
  // create_deal agent tool uses) keyed on the authenticated user + space + a
  // stable signature of the payload (title, resolved stage, value, and the
  // sorted contact set). A rapid duplicate within the TTL returns the
  // already-created row instead of inserting again.
  const normalizedContactIds = Array.isArray(contactIds)
    ? [...new Set((contactIds as unknown[]).filter((c): c is string => typeof c === 'string'))].sort().join(',')
    : '';
  const idemKey = makeIdempotencyKey(
    'http_create_deal',
    space.id,
    userId,
    title.trim(),
    finalStageId,
    String(valueVal ?? ''),
    normalizedContactIds,
  );
  const { data: dealRow, error: dealError } = await withIdempotency(idemKey, async () =>
    tenantTable(supabase, 'Deal', { spaceId: space.id }).insert({
      id: dealId,
      spaceId: space.id,
      title,
      description: description || null,
      value: valueVal,
      commissionRate: commissionRateVal,
      probability: probabilityVal,
      milestones: milestonesVal,
      address: address || null,
      propertyId: propertyIdVal,
      priority: priority || 'MEDIUM',
      closeDate: closeDateVal,
      stageId: finalStageId,
      status: statusVal,
      // The deal enters its initial stage right now. Without this, dealHealth
      // can't compute "days in stage" until the first stage move sets it.
      stageChangedAt: nowIso,
      // When a deal is CREATED directly in a closed status (won|lost), stamp
      // closedAt immediately — mirrors the PATCH transition logic. Without this,
      // a deal born 'won' never gets a close timestamp, so avgTimeToCloseDays
      // (lib/deal-metrics.ts) silently drops it from the average.
      ...((statusVal === 'won' || statusVal === 'lost') && { closedAt: nowIso }),
      // Structured close reason when born in a terminal status (mirrors PATCH).
      ...(closeReasonVal && { closeReason: closeReasonVal }),
      ...(closeReasonDetailVal && { closeReasonDetail: closeReasonDetailVal }),
      position: lastPosition + 1,
    }).select().single()
  );
  if (dealError) throw dealError;

  // Insert dealContacts — verify all contacts belong to this space
  if (contactIds?.length) {
    const { data: validContacts, error: vcError } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
      .select('id')
      .in('id', contactIds);
    if (vcError) throw vcError;
    const validIds = new Set((validContacts ?? []).map((c: { id: string }) => c.id));
    const dcInserts = (contactIds as string[]).filter((cId) => validIds.has(cId)).map((cId) => ({ dealId, contactId: cId }));
    if (dcInserts.length > 0) {
      const { error: dcError } = await supabase.from('DealContact').upsert(dcInserts, { onConflict: 'dealId,contactId', ignoreDuplicates: true });
      if (dcError) throw dcError;
    }
  }

  // Get stage for the include
  const { data: stageRow, error: stageError } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
    .select('*')
    .eq('id', finalStageId)
    .single();
  if (stageError && stageError.code !== 'PGRST116') throw stageError;

  const deal = {
    ...dealRow,
    stage: stageRow || null
  } as Deal & { stage: DealStage | null };

  syncDeal({ ...deal, stage: deal.stage ?? undefined }).catch(console.error);

  // Email + SMS notification for new deal
  try {
    await notifyNewDeal({
      spaceId: space.id,
      dealTitle: title,
      dealValue: valueVal,
      dealAddress: address || null,
      dealPriority: priority || null,
    });
  } catch (e) { console.error('[deals] notification failed:', e); }

  const createdDealSpaceId = space.id;
  const createdDealId = dealRow.id;
  after(async () => {
    try {
      await runWorkflowsForEvent({
        spaceId: createdDealSpaceId,
        triggerType: 'deal_created',
        context: { event: { type: 'deal_created' }, deal: dealRow },
        triggerEvent: { type: 'deal_created', dealId: createdDealId },
      });
    } catch (e) {
      logger.error('[deals/POST] deal_created workflow dispatch failed (non-fatal)', { dealId: createdDealId }, e);
    }
  });

  return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    logger.error('[deals] POST failed', {}, err);
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 });
  }
}
