import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import { deleteObjectsBestEffort } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { dealHasOpenSignatureRequests } from '@/lib/esign';
import { normalizeCloseReason } from '@/lib/close-reason';
import { fireReviewAsk } from '@/lib/reputation/review-engine';
import type { Deal, DealStage } from '@/lib/types';
import { tenantTable } from '@/lib/tenant-db';


async function resolveDealAndSpace(userId: string, dealId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: rows, error } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('*')
    .eq('id', dealId);
  if (error) throw error;
  if (!rows?.length) return null;
  return { deal: rows[0], space };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolveDealAndSpace(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { deal } = ctx;

  const [stageResult, dcResult, activityResult] = await Promise.all([
    tenantTable(supabase, 'DealStage', { spaceId: ctx.space.id }).select('*').eq('id', deal.stageId).maybeSingle(),
    supabase.from('DealContact').select('dealId, contactId, role, Contact(id, name, type)').eq('dealId', id),
    tenantTable(supabase, 'DealActivity', { spaceId: ctx.space.id }).select('*').eq('dealId', id).order('createdAt', { ascending: false }).limit(50),
  ]);

  if (stageResult.error && stageResult.error.code !== 'PGRST116') throw stageResult.error;
  if (dcResult.error) throw dcResult.error;

  const dealContacts = (dcResult.data ?? []).map((row: any) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    role: row.role ?? null,
    contact: row.Contact ? { id: row.Contact.id, name: row.Contact.name, type: row.Contact.type } : null,
  }));

  return NextResponse.json({
    ...deal,
    stage: stageResult.data ?? null,
    dealContacts,
    activities: activityResult.data ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // Rate limit: 120 deal edits per minute per user. Deal triage involves
    // rapid inline edits (value, priority, next-action), so the ceiling is
    // generous — high enough to never bite normal use, low enough to stop a
    // runaway client or scripted abuse from hammering the table.
    const { allowed } = await checkRateLimit(`deals-patch:${userId}`, 120, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many deal edits. Try again in a moment.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const { id } = await params;

    const space = await getSpaceForUser(userId);
    if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: existingRows, error: existingError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
      .select('*')
      .eq('id', id);
    if (existingError) {
      console.error('[deals/PATCH] fetch error:', existingError);
      return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 });
    }
    if (!existingRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = existingRows[0];

    const body = await req.json();

    const VALID_STATUSES = ['active', 'won', 'lost', 'on_hold'];
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // ── Close-reason taxonomy (Feature B) ───────────────────────────────────
    // Optional, non-blocking structured reason for a won/lost outcome. We only
    // persist it on the won/lost transition, and only if the supplied key is
    // valid for that outcome (normalizeCloseReason mismatches → null, never
    // throws). A missing/unknown reason simply leaves the column null — the
    // affordance is never forced. The free-form `closeReasonDetail` is capped.
    const closingOutcome: 'won' | 'lost' | null =
      body.status === 'won' ? 'won' : body.status === 'lost' ? 'lost' : null;
    const closeReasonVal: import('@/lib/close-reason').CloseReason | null =
      closingOutcome ? normalizeCloseReason(body.closeReason, closingOutcome) : null;
    const closeReasonDetailVal: string | null =
      body.closeReasonDetail != null && String(body.closeReasonDetail).trim() !== ''
        ? String(body.closeReasonDetail).trim().slice(0, 2000)
        : null;

    // Validate milestones
    let milestonesVal: import('@/lib/types').DealMilestone[] | undefined = undefined;
    if (body.milestones !== undefined) {
      if (!Array.isArray(body.milestones)) {
        return NextResponse.json({ error: 'milestones must be an array' }, { status: 400 });
      }
      const truncated = (body.milestones as unknown[]).slice(0, 20);
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

    const valueVal = body.value != null && body.value !== '' ? parseFloat(body.value) : null;
    if (valueVal !== null && isNaN(valueVal)) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }
    const commissionRateVal =
      body.commissionRate != null && body.commissionRate !== ''
        ? parseFloat(body.commissionRate)
        : body.commissionRate === null
          ? null
          : undefined;
    if (commissionRateVal !== null && commissionRateVal !== undefined && (isNaN(commissionRateVal) || commissionRateVal < 0 || commissionRateVal > 100)) {
      return NextResponse.json({ error: 'Invalid commissionRate (must be 0–100)' }, { status: 400 });
    }
    const probabilityVal =
      body.probability != null && body.probability !== ''
        ? parseInt(String(body.probability), 10)
        : body.probability === null
          ? null
          : undefined;
    if (probabilityVal !== null && probabilityVal !== undefined && (isNaN(probabilityVal) || probabilityVal < 0 || probabilityVal > 100)) {
      return NextResponse.json({ error: 'Invalid probability (must be 0–100)' }, { status: 400 });
    }

    let closeDateVal: string | null = null;
    if (body.closeDate) {
      const d = new Date(body.closeDate);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
      closeDateVal = d.toISOString();
    }

    const parseDay = (raw: unknown, field: string): string | null | undefined => {
      if (raw === undefined) return undefined;
      if (raw === null || raw === '') return null;
      const d = new Date(String(raw));
      if (isNaN(d.getTime())) return `__invalid__:${field}`;
      return String(raw).slice(0, 10);
    };
    const contractAcceptedAtVal = parseDay(body.contractAcceptedAt, 'contractAcceptedAt');
    const inspectionDeadlineVal = parseDay(body.inspectionDeadline, 'inspectionDeadline');
    const earnestDueAtVal = parseDay(body.earnestDueAt, 'earnestDueAt');
    if (typeof contractAcceptedAtVal === 'string' && contractAcceptedAtVal.startsWith('__invalid__')) {
      return NextResponse.json({ error: 'Invalid contractAcceptedAt' }, { status: 400 });
    }
    if (typeof inspectionDeadlineVal === 'string' && inspectionDeadlineVal.startsWith('__invalid__')) {
      return NextResponse.json({ error: 'Invalid inspectionDeadline' }, { status: 400 });
    }
    if (typeof earnestDueAtVal === 'string' && earnestDueAtVal.startsWith('__invalid__')) {
      return NextResponse.json({ error: 'Invalid earnestDueAt' }, { status: 400 });
    }

    let followUpAtVal: string | null | undefined = undefined;
    if (body.followUpAt !== undefined) {
      if (!body.followUpAt) {
        followUpAtVal = null;
      } else {
        const d = new Date(body.followUpAt);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid followUpAt' }, { status: 400 });
        followUpAtVal = d.toISOString();
      }
    }

    // next-action: free-form string + optional due timestamp.
    let nextActionVal: string | null | undefined = undefined;
    if (body.nextAction !== undefined) {
      if (body.nextAction === null || body.nextAction === '') {
        nextActionVal = null;
      } else {
        nextActionVal = String(body.nextAction).trim().slice(0, 280);
      }
    }
    let nextActionDueAtVal: string | null | undefined = undefined;
    if (body.nextActionDueAt !== undefined) {
      if (!body.nextActionDueAt) {
        nextActionDueAtVal = null;
      } else {
        const d = new Date(body.nextActionDueAt);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid nextActionDueAt' }, { status: 400 });
        nextActionDueAtVal = d.toISOString();
      }
    }

    const stageChanged = body.stageId && body.stageId !== existing.stageId;
    const statusChanged = body.status && body.status !== existing.status;

    // ── E-sign close gate (configurable, default OFF) ───────────────────────
    //
    // Only relevant on the transition INTO 'won'. We resolve the deal's
    // brokerage via its Space.brokerageId and read the per-brokerage toggle
    // `requireSignedDocsBeforeClose`. The toggle is OFF by default and most
    // spaces have no brokerage at all, so the common path does ZERO extra work
    // and behaves exactly as before.
    //
    // "Required documents signed" has no first-class definition (nothing marks a
    // DealDocument as required-for-close), so the strongest available signal is
    // reused: an in-progress SignatureRequest tied to the deal
    // (status created|sent|delivered) means "not signed yet". See
    // lib/esign.ts → dealHasOpenSignatureRequests.
    //
    //   * setting ON  + an open signature request → BLOCK with 409.
    //   * setting ON  + all terminal / no requests → allow.
    //   * setting OFF (or no brokerage)            → allow (unchanged).
    //
    // `closedWithUnsignedDocs` is computed for the SUCCESS-response advisory
    // (below) regardless of the toggle — but only when actually closing, and
    // only after we know the gate isn't going to block.
    const closingWon = statusChanged && body.status === 'won';
    let closedWithUnsignedDocs = false;
    if (closingWon) {
      // Read the deal's brokerage toggle (if the space belongs to a brokerage).
      let gateOn = false;
      if (space.brokerageId) {
        const { data: brokerageRow, error: brokerageError } = await supabase
          .from('Brokerage')
          .select('requireSignedDocsBeforeClose')
          .eq('id', space.brokerageId)
          .maybeSingle();
        if (brokerageError) {
          // Fail OPEN: a brokerage-lookup blip must not block a close. This is a
          // gating convenience, not a security control; the worst case is a deal
          // closing with unsigned docs (the pre-feature behavior).
          logger.warn('[deals/PATCH] brokerage gate lookup failed', {
            dealId: id,
            brokerageId: space.brokerageId,
            err: brokerageError.message,
          });
        }
        gateOn = Boolean(
          (brokerageRow as { requireSignedDocsBeforeClose?: boolean } | null)
            ?.requireSignedDocsBeforeClose,
        );
      }

      // Only probe signatures when the gate is on, OR — cheaply — to populate
      // the non-blocking advisory. We query once and reuse the result for both.
      const { hasOpen } = await dealHasOpenSignatureRequests(id, space.id);
      if (gateOn && hasOpen) {
        return NextResponse.json(
          {
            error:
              "Required documents aren't signed — complete e-sign or turn off 'require signed docs before close'.",
            code: 'unsigned_documents',
          },
          { status: 409 },
        );
      }
      // Advisory: deal is being closed while an open signature request exists
      // (gate was off, so we let it through). Surfaced in the success response
      // so the UI can flag "closed without signed docs".
      closedWithUnsignedDocs = hasOpen;
    }

    // Validate stageId belongs to this space BEFORE any mutations so an
    // invalid stageId cannot leave the row in a partially-updated state.
    if (body.stageId !== undefined) {
      const { data: stageCheck } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
        .select('id')
        .eq('id', body.stageId)
        .maybeSingle();
      if (!stageCheck) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
    }

    // Validate title/description lengths and priority enum
    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 255)) {
      return NextResponse.json({ error: 'Title must be under 255 chars' }, { status: 400 });
    }
    if (body.description !== undefined && typeof body.description === 'string' && body.description.length > 5000) {
      return NextResponse.json({ error: 'Description must be under 5000 chars' }, { status: 400 });
    }
    const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    // Validate position: it's the kanban ordering key. The safe write path is
    // the reorder RPC (/api/deals/reorder), which rebalances every card in the
    // column atomically — a raw PATCH can only ever corrupt that ordering. The
    // UI never sends position through PATCH (kanban drag hits the reorder
    // endpoint). So we reject any negative/float/garbage value outright; a
    // valid non-negative integer is tolerated but the field is NOT written here
    // (it's dropped from the update below — callers must use the reorder RPC).
    if (body.position !== undefined) {
      if (typeof body.position !== 'number' || !Number.isInteger(body.position) || body.position < 0) {
        return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
      }
    }

    // propertyId ownership scoping. Mirrors the POST route: when a non-null
    // propertyId is supplied, verify the Property belongs to THIS space before
    // accepting it. Relying on the FK alone lets a caller link their deal to
    // another space's Property (the FK only checks existence, not ownership).
    let propertyIdVal: string | null | undefined = undefined;
    if (body.propertyId !== undefined) {
      if (body.propertyId === null || body.propertyId === '') {
        propertyIdVal = null;
      } else {
        if (typeof body.propertyId !== 'string') {
          return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
        }
        const trimmed = body.propertyId.slice(0, 64);
        const { data: propRow, error: propErr } = await tenantTable(supabase, 'Property', { spaceId: space.id })
          .select('id')
          .eq('id', trimmed)
          .maybeSingle();
        if (propErr) {
          console.error('[deals/PATCH] property validation error:', propErr);
          return NextResponse.json({ error: 'Failed to validate property' }, { status: 500 });
        }
        if (!propRow) return NextResponse.json({ error: 'Invalid propertyId' }, { status: 404 });
        propertyIdVal = trimmed;
      }
    }

    // Handle dealContacts replacement — diff-based instead of delete-all-then-insert.
    // The old approach left the list empty between the DELETE and the INSERT, so
    // two concurrent PATCHes raced (both DELETE, then both INSERT — losing the
    // other side's edits). A failed INSERT after a successful DELETE left the
    // deal with NO contacts. Computing the add/remove diff keeps the list in a
    // valid intermediate state at every step.
    if (body.contactIds) {
      const { data: existingRows, error: exErr } = await supabase
        .from('DealContact')
        .select('contactId')
        .eq('dealId', id);
      if (exErr) {
        console.error('[deals/PATCH] dealContact fetch error:', exErr);
        return NextResponse.json({ error: 'Failed to read deal contacts' }, { status: 500 });
      }
      const existingIds = new Set<string>((existingRows ?? []).map((r: { contactId: string }) => r.contactId));

      const wantedRaw = body.contactIds as string[];
      let wantedIds: Set<string>;
      if (wantedRaw.length > 0) {
        const { data: validContacts, error: vcError } = await tenantTable(supabase, 'Contact', { spaceId: space.id })
          .select('id')
          .in('id', wantedRaw);
        if (vcError) {
          console.error('[deals/PATCH] contact validation error:', vcError);
          return NextResponse.json({ error: 'Failed to validate contacts' }, { status: 500 });
        }
        wantedIds = new Set(((validContacts ?? []) as { id: string }[]).map((c) => c.id));
      } else {
        wantedIds = new Set();
      }

      const toRemove = [...existingIds].filter((cId) => !wantedIds.has(cId));
      const toAdd = [...wantedIds].filter((cId) => !existingIds.has(cId));

      if (toRemove.length > 0) {
        const { error: delError } = await supabase
          .from('DealContact')
          .delete()
          .eq('dealId', id)
          .in('contactId', toRemove);
        if (delError) {
          console.error('[deals/PATCH] dealContact delete error:', delError);
          return NextResponse.json({ error: 'Failed to update deal contacts' }, { status: 500 });
        }
      }
      if (toAdd.length > 0) {
        const dcInserts = toAdd.map((cId) => ({ dealId: id, contactId: cId }));
        const { error: insertError } = await supabase.from('DealContact').upsert(dcInserts, { onConflict: 'dealId,contactId', ignoreDuplicates: true });
        if (insertError) {
          console.error('[deals/PATCH] dealContact insert error:', insertError);
          return NextResponse.json({ error: 'Failed to link contacts' }, { status: 500 });
        }
      }
    }

    const { data: dealRow, error: updateError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
      .update({
        ...(body.title !== undefined && { title: String(body.title).slice(0, 255) }),
        ...(body.description !== undefined && { description: body.description ? String(body.description).slice(0, 5000) : null }),
        ...(body.value !== undefined && { value: valueVal }),
        ...(commissionRateVal !== undefined && { commissionRate: commissionRateVal }),
        ...(probabilityVal !== undefined && { probability: probabilityVal }),
        ...(body.address !== undefined && { address: body.address ?? null }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.closeDate !== undefined && { closeDate: closeDateVal }),
        ...(body.contractAcceptedAt !== undefined && {
          contractAcceptedAt: contractAcceptedAtVal
            ? new Date(String(contractAcceptedAtVal) + 'T12:00:00.000Z').toISOString()
            : null,
        }),
        ...(body.inspectionDeadline !== undefined && { inspectionDeadline: inspectionDeadlineVal }),
        ...(body.earnestDueAt !== undefined && { earnestDueAt: earnestDueAtVal }),
        ...(body.stageId !== undefined && { stageId: body.stageId }),
        // position is NOT written here. It's the kanban ordering key and the
        // only safe write path is the reorder RPC (/api/deals/reorder), which
        // rebalances the whole column atomically. A raw PATCH can only corrupt
        // ordering, so we validate-and-ignore it above.
        ...(body.status !== undefined && { status: body.status }),
        // When stageId changes, stamp stageChangedAt so daysInStage actually
        // reflects "time in current stage" — not "time since any field edit".
        // Mirrors the Contact behaviour added in migration 20260316000004.
        ...(stageChanged && { stageChangedAt: new Date().toISOString() }),
        // When the deal transitions to a closed status (won|lost), stamp
        // closedAt so time-to-close and conversion metrics (lib/deal-metrics.ts)
        // have a real close timestamp. Gated on statusChanged so re-saving an
        // already-closed deal doesn't overwrite the original close time.
        ...(statusChanged && (body.status === 'won' || body.status === 'lost') && {
          closedAt: new Date().toISOString(),
        }),
        ...(followUpAtVal !== undefined && { followUpAt: followUpAtVal }),
        ...(milestonesVal !== undefined && { milestones: milestonesVal }),
        ...(nextActionVal !== undefined && { nextAction: nextActionVal }),
        ...(nextActionDueAtVal !== undefined && { nextActionDueAt: nextActionDueAtVal }),
        // propertyId: null unlinks; otherwise an id verified above to reference
        // a Property in THIS space (ownership-scoped, mirroring the POST route —
        // the FK alone only checks existence, not ownership).
        ...(propertyIdVal !== undefined && { propertyId: propertyIdVal }),
        // Won/lost post-mortem fields — captured from the kanban dialog.
        // When the deal transitions back to active we clear them so stale
        // reasons don't confuse a later close.
        ...(body.wonLostReason !== undefined && { wonLostReason: body.wonLostReason ? String(body.wonLostReason).slice(0, 120) : null }),
        ...(body.wonLostNote !== undefined && { wonLostNote: body.wonLostNote ? String(body.wonLostNote).slice(0, 2000) : null }),
        ...(body.status === 'active' && { wonLostReason: null, wonLostNote: null }),
        // Structured close-reason taxonomy (Feature B): persisted only on the
        // won/lost transition; cleared when the deal reopens to 'active' so a
        // stale reason can't confuse a later close. Mirrors wonLostReason above.
        ...(closingOutcome && body.closeReason !== undefined && { closeReason: closeReasonVal }),
        ...(closingOutcome && body.closeReasonDetail !== undefined && { closeReasonDetail: closeReasonDetailVal }),
        ...(body.status === 'active' && { closeReason: null, closeReasonDetail: null }),
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (updateError) {
      console.error('[deals/PATCH] update error:', updateError);
      return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 });
    }

    // Auto-log stage_change and status_change activities
    const activityInserts: Array<{ id: string; dealId: string; spaceId: string; type: string; content: string; metadata: Record<string, unknown> }> = [];
    if (stageChanged) {
      const { data: newStageRow } = await tenantTable(supabase, 'DealStage', { spaceId: space.id }).select('name').eq('id', body.stageId).maybeSingle();
      const { data: oldStageRow } = await tenantTable(supabase, 'DealStage', { spaceId: space.id }).select('name').eq('id', existing.stageId).maybeSingle();
      activityInserts.push({
        id: crypto.randomUUID(),
        dealId: id,
        spaceId: existing.spaceId,
        type: 'stage_change',
        content: `Moved from "${oldStageRow?.name ?? 'Unknown'}" to "${newStageRow?.name ?? 'Unknown'}"`,
        metadata: { fromStageId: existing.stageId, toStageId: body.stageId },
      });
    }
    if (statusChanged) {
      const labelMap: Record<string, string> = { active: 'Active', won: 'Won', lost: 'Lost', on_hold: 'On Hold' };
      const statusMetadata: Record<string, unknown> = { fromStatus: existing.status, toStatus: body.status };
      if ((body.status === 'won' || body.status === 'lost') && body.wonLostReason) {
        statusMetadata.reason = String(body.wonLostReason).slice(0, 100);
      }
      if ((body.status === 'won' || body.status === 'lost') && body.wonLostNote) {
        statusMetadata.note = String(body.wonLostNote).slice(0, 120);
      }
      // Stamp the structured close-reason key into the activity metadata too, so
      // the timeline carries the same taxonomy the analytics group on.
      if (closeReasonVal) {
        statusMetadata.closeReason = closeReasonVal;
      }
      activityInserts.push({
        id: crypto.randomUUID(),
        dealId: id,
        spaceId: existing.spaceId,
        type: 'status_change',
        content: `Marked as ${labelMap[body.status] ?? body.status}`,
        metadata: statusMetadata,
      });
    }

    // Log meaningful human field edits to the activity trail. The AI tools
    // (update_deal_value, etc.) write a 'note' row with { oldValue, newValue,
    // via } metadata whenever they change a field — but human PATCH edits to
    // the same fields previously logged NOTHING (only stage/status above).
    // Diff the updated row against the prior values and mirror the AI shape so
    // value/probability/commission/dates/next-action/priority edits show up in
    // the timeline. stage/status are intentionally excluded — they log above.
    const money = (n: number | null | undefined) =>
      n == null ? 'none' : `$${Math.round(Number(n)).toLocaleString('en-US')}`;
    const dateOnly = (d: unknown) => (d ? String(d).slice(0, 10) : null);
    type FieldDiff = { key: string; label: string; oldVal: unknown; newVal: unknown; format?: (v: unknown) => string };
    const diffs: FieldDiff[] = [
      { key: 'value', label: 'Value', oldVal: existing.value, newVal: dealRow.value, format: (v) => money(v as number | null) },
      { key: 'probability', label: 'Probability', oldVal: existing.probability, newVal: dealRow.probability, format: (v) => (v == null ? 'none' : `${v}%`) },
      { key: 'commissionRate', label: 'Commission rate', oldVal: existing.commissionRate, newVal: dealRow.commissionRate, format: (v) => (v == null ? 'none' : `${v}%`) },
      { key: 'closeDate', label: 'Close date', oldVal: dateOnly(existing.closeDate), newVal: dateOnly(dealRow.closeDate), format: (v) => (v ? String(v) : 'none') },
      { key: 'contractAcceptedAt', label: 'Contract accepted', oldVal: dateOnly(existing.contractAcceptedAt), newVal: dateOnly(dealRow.contractAcceptedAt), format: (v) => (v ? String(v) : 'none') },
      { key: 'inspectionDeadline', label: 'Inspection deadline', oldVal: dateOnly(existing.inspectionDeadline), newVal: dateOnly(dealRow.inspectionDeadline), format: (v) => (v ? String(v) : 'none') },
      { key: 'earnestDueAt', label: 'Earnest due', oldVal: dateOnly(existing.earnestDueAt), newVal: dateOnly(dealRow.earnestDueAt), format: (v) => (v ? String(v) : 'none') },
      { key: 'followUpAt', label: 'Follow-up', oldVal: existing.followUpAt ?? null, newVal: dealRow.followUpAt ?? null, format: (v) => (v ? String(v) : 'none') },
      { key: 'nextAction', label: 'Next action', oldVal: existing.nextAction ?? null, newVal: dealRow.nextAction ?? null, format: (v) => (v ? String(v) : 'none') },
      { key: 'priority', label: 'Priority', oldVal: existing.priority, newVal: dealRow.priority, format: (v) => (v == null ? 'none' : String(v)) },
    ];
    for (const d of diffs) {
      // Skip fields this PATCH didn't touch and unchanged values.
      if (d.newVal === d.oldVal) continue;
      const fmtFn = d.format ?? ((v: unknown) => String(v));
      activityInserts.push({
        id: crypto.randomUUID(),
        dealId: id,
        spaceId: existing.spaceId,
        type: 'note',
        content: `${d.label} updated to ${fmtFn(d.newVal)}`,
        metadata: { field: d.key, oldValue: d.oldVal, newValue: d.newVal, via: 'manual_edit' },
      });
    }

    if (activityInserts.length > 0) {
      // Non-fatal: a failed activity insert must never fail the edit. Mirrors
      // the AI tools, which log a warning and move on.
      try {
        const { error: activityErr } = await tenantTable(supabase, 'DealActivity', { spaceId: space.id }).insert(activityInserts);
        if (activityErr) {
          console.error('[deals/PATCH] activity insert failed:', activityErr);
        }
      } catch (e) {
        console.error('[deals/PATCH] activity insert threw:', e);
      }
    }

    // Get stage for the include
    const stageIdToFetch = body.stageId ?? existing.stageId;
    const { data: stageRow, error: stageError } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
      .select('*')
      .eq('id', stageIdToFetch)
      .single();
    if (stageError && stageError.code !== 'PGRST116') {
      console.error('[deals/PATCH] stage fetch error:', stageError);
    }

    const deal = {
      ...dealRow,
      stage: stageRow || null
    } as Deal & { stage: DealStage | null };

    syncDeal({ ...deal, stage: deal.stage ?? undefined }).catch(console.error);
    void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Deal', resourceId: id, spaceId: space.id, req });

    // Fire the agent trigger on stage transitions so Chippi reacts in real
    // time to a deal moving stages (e.g. drafts a "we're under contract" SMS
    // to the contact, or marks the win/loss). Never fails the response.
    if (stageChanged) {
      try {
        await fireAgentTrigger({ spaceId: space.id, event: 'deal_stage_changed', dealId: id });
      } catch (e) {
        console.error('[deals/PATCH] agent trigger failed:', e);
      }
      // Also dispatch the deal_stage_changed WORKFLOW trigger. Without this a
      // realtor's "when a deal moves to <stage>, do X" workflow never fired —
      // the executor was only reachable from the deals POST (deal_created) and a
      // handful of other routes, so stage-change automations were dead. Runs
      // post-response via after() so it never delays the PATCH, and carries the
      // new stage name so a workflow scoped to a specific toStage can gate on it.
      const toStageName = stageRow?.name ?? null;
      const dealForEvent = dealRow as Record<string, unknown>;
      after(async () => {
        try {
          await runWorkflowsForEvent({
            spaceId: space.id,
            triggerType: 'deal_stage_changed',
            context: {
              event: { type: 'deal_stage_changed', toStage: toStageName },
              deal: dealForEvent,
            },
            triggerEvent: { type: 'deal_stage_changed', dealId: id, toStage: toStageName },
          });
        } catch (e) {
          logger.error('[deals/PATCH] deal_stage_changed workflow dispatch failed', { dealId: id }, e);
        }
      });
    }

    // Post-Close Reputation Engine: on the transition INTO 'won', kick off the
    // review ask (draft a grounded review request + a tracked link, log a
    // ReviewCampaign). Fire-and-forget — fireReviewAsk registers its own
    // after() keep-alive, never throws, and dedupes per deal, so this adds zero
    // latency and can't fail the close. Only fires when the deal has a primary
    // contact to reach; the engine itself skips spaces with no reviewUrl set.
    if (closingWon && dealRow.contactId) {
      void fireReviewAsk({ spaceId: space.id, dealId: id, contactId: dealRow.contactId as string });
    }

    // Attach the non-blocking advisory ONLY when it's true, so the success
    // response shape is unchanged for every normal close (and every non-close
    // PATCH). The UI can read this to flag "closed without signed docs".
    return NextResponse.json(
      closedWithUnsignedDocs ? { ...deal, closedWithUnsignedDocs: true } : deal,
    );
  } catch (err) {
    console.error('[deals/PATCH] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Rate limit: 120 deletes per minute per user — same generous ceiling as
  // PATCH. High enough to never bite a normal user clearing out stale deals,
  // low enough to cap a runaway/scripted client.
  const { allowed } = await checkRateLimit(`deals-delete:${userId}`, 120, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many deletes. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: dealRows, error: dealError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('*')
    .eq('id', id);
  if (dealError) throw dealError;
  if (!dealRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  // Capture document storage keys BEFORE deleting the Deal — the FK
  // cascade removes DealDocument rows the moment the Deal is gone, but
  // Wasabi objects don't cascade. Offer letters, purchase agreements,
  // closing disclosures persist forever in cloud storage otherwise.
  const { data: docRows } = await tenantTable(supabase, 'DealDocument', { spaceId: space.id })
    .select('storagePath')
    .eq('dealId', id);
  const docKeys = ((docRows ?? []) as { storagePath: string | null }[])
    .map((r) => r.storagePath)
    .filter((k): k is string => Boolean(k));

  const { error: deleteError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .delete()
    .eq('id', id);
  if (deleteError) throw deleteError;

  // Fire-and-forget the Wasabi cleanup. The DB delete already committed;
  // a Wasabi failure here orphans the object, which the nightly storage
  // sweeper catches. Never block the response on the remote bucket.
  if (docKeys.length > 0) {
    void deleteObjectsBestEffort(docKeys).then((res) => {
      if (res.failed.length > 0) {
        logger.warn('[deals/DELETE] some doc objects failed to delete', {
          dealId: id,
          spaceId: space.id,
          okCount: res.ok,
          failedCount: res.failed.length,
        });
      }
    });
  }

  deleteDealVector(deal.spaceId, id).catch(console.error);
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    spaceId: space.id,
    req: _req,
    metadata: { title: deal.title, docCount: docKeys.length },
  });

  return NextResponse.json({ success: true });
}
