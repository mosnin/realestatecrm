/**
 * Bulk actions for the contact list.
 *
 *   POST /api/contacts/bulk
 *     { slug, ids: string[], action: BulkAction, ...actionArgs }
 *
 * Actions (all applied to the selected ids in ONE pass, within the caller's
 * space):
 *   - tag-add        { tag }            add a tag to each contact (deduped)
 *   - tag-remove     { tag }            remove a tag from each contact
 *   - set-stage      { stage }          move each contact to a pipeline stage
 *                                       (Contact.type: QUALIFICATION|TOUR|APPLICATION)
 *   - archive                            hide from the People view (snoozedUntil)
 *   - unarchive                          clear the snooze
 *   - reassign       { realtorUserId }   BROKER-ONLY — clone each lead into a
 *                                        realtor's space (assignLeadToRealtor)
 *
 * Guarantees:
 *   - Space-scoped: every contact is re-read with `.eq('spaceId', space.id)`,
 *     so an id from another workspace yields a per-id `not_found` result and is
 *     NEVER mutated — no cross-space write.
 *   - Capped: at most MAX_BULK ids per request (else 400). Ids are de-duped.
 *   - Per-id results: returns { ok, applied, results: [{ id, ok, error? }] } so
 *     the UI can show partial success.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { getBrokerContext, canManageLeads } from '@/lib/permissions';
import { assignLeadToRealtor } from '@/lib/broker-assign-lead';
import { audit } from '@/lib/audit';
import { syncContact } from '@/lib/vectorize';
import type { Contact } from '@/lib/types';

/** Upper bound on a single bulk request. Keeps the per-id loop bounded. */
export const MAX_BULK = 200;

const TAG_MAX_LEN = 100;
const VALID_STAGES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
type ContactStage = (typeof VALID_STAGES)[number];

/**
 * "Archive" for a contact is a far-future snooze — Contact has no status
 * column, and snoozedUntil already drives the "hide from People" behaviour the
 * PATCH route exposes. A fixed sentinel year keeps archived rows out of the
 * default list until explicitly un-archived.
 */
const ARCHIVE_UNTIL = '2999-12-31T00:00:00.000Z';

type BulkAction =
  | 'tag-add'
  | 'tag-remove'
  | 'set-stage'
  | 'archive'
  | 'unarchive'
  | 'reassign';

type PerIdResult = { id: string; ok: boolean; error?: string };

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const {
    slug,
    ids: rawIds,
    action,
    tag,
    stage,
    realtorUserId,
  } = (body ?? {}) as {
    slug?: string;
    ids?: unknown;
    action?: unknown;
    tag?: unknown;
    stage?: unknown;
    realtorUserId?: unknown;
  };

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 });
  }
  // De-dupe + drop non-strings before the cap check so a padded/duplicated
  // payload can't slip past or trip the limit spuriously.
  const ids = Array.from(
    new Set(rawIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)),
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must not be empty' }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json(
      { error: `Too many ids — max ${MAX_BULK} per request.` },
      { status: 400 },
    );
  }

  const validActions: readonly BulkAction[] = [
    'tag-add',
    'tag-remove',
    'set-stage',
    'archive',
    'unarchive',
    'reassign',
  ];
  if (typeof action !== 'string' || !(validActions as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const act = action as BulkAction;

  // ── Per-action argument validation (before any auth/DB work) ──────────────
  let tagVal: string | null = null;
  if (act === 'tag-add' || act === 'tag-remove') {
    tagVal = typeof tag === 'string' ? tag.trim().slice(0, TAG_MAX_LEN) : '';
    if (!tagVal) return NextResponse.json({ error: 'tag is required' }, { status: 400 });
  }
  let stageVal: ContactStage | null = null;
  if (act === 'set-stage') {
    if (typeof stage !== 'string' || !(VALID_STAGES as readonly string[]).includes(stage)) {
      return NextResponse.json(
        { error: 'stage must be QUALIFICATION, TOUR or APPLICATION' },
        { status: 400 },
      );
    }
    stageVal = stage as ContactStage;
  }
  if (act === 'reassign') {
    if (typeof realtorUserId !== 'string' || !realtorUserId) {
      return NextResponse.json({ error: 'realtorUserId is required' }, { status: 400 });
    }
  }

  // ── Auth: caller must own (or broker-manage) the workspace ────────────────
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // ── Reassign is a broker-only clone, handled by its own path ─────────────
  if (act === 'reassign') {
    return handleReassign({
      ids,
      realtorUserId: realtorUserId as string,
      callerClerkId: userId,
      spaceId: space.id,
      req,
    });
  }

  // ── Load only the rows that are actually in this space ────────────────────
  // Anything missing from this set is a cross-space / deleted id → not_found.
  const { data: rows, error: loadErr } = await supabase
    .from('Contact')
    .select('id, type, tags')
    .eq('spaceId', space.id)
    .in('id', ids);
  if (loadErr) {
    console.error('[contacts/bulk] load error:', loadErr);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
  const byId = new Map(
    (rows ?? []).map((r) => [r.id as string, r as { id: string; type: string; tags: string[] | null }]),
  );

  const results: PerIdResult[] = [];
  const nowIso = new Date().toISOString();

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, ok: false, error: 'not_found' });
      continue;
    }

    // Build this row's update from the action.
    const updates: Record<string, unknown> = { updatedAt: nowIso };
    if (act === 'tag-add') {
      const existing = Array.isArray(row.tags) ? row.tags : [];
      if (existing.includes(tagVal!)) {
        // Already present — treat as a successful no-op so the count is honest.
        results.push({ id, ok: true });
        continue;
      }
      updates.tags = [...existing, tagVal!];
    } else if (act === 'tag-remove') {
      const existing = Array.isArray(row.tags) ? row.tags : [];
      if (!existing.includes(tagVal!)) {
        results.push({ id, ok: true });
        continue;
      }
      updates.tags = existing.filter((t) => t !== tagVal);
    } else if (act === 'set-stage') {
      updates.type = stageVal;
      if (row.type !== stageVal) updates.stageChangedAt = nowIso;
    } else if (act === 'archive') {
      updates.snoozedUntil = ARCHIVE_UNTIL;
    } else if (act === 'unarchive') {
      updates.snoozedUntil = null;
    }

    const { data: updated, error: updErr } = await supabase
      .from('Contact')
      .update(updates)
      // CAS on space ownership — TOCTOU-safe even though we re-read above.
      .eq('id', id)
      .eq('spaceId', space.id)
      .select()
      .maybeSingle();
    if (updErr || !updated) {
      results.push({ id, ok: false, error: 'update_failed' });
      continue;
    }
    // Keep the vector index fresh; never let it fail the bulk op.
    syncContact(updated as Contact).catch(() => {});
    results.push({ id, ok: true });
  }

  const applied = results.filter((r) => r.ok).length;
  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'Contact',
    spaceId: space.id,
    req,
    metadata: { bulk: true, action: act, requested: ids.length, applied },
  });

  return NextResponse.json({ ok: true, applied, results });
}

/**
 * Bulk reassign — broker_owner/broker_admin only. Each id is cloned into the
 * target realtor's space via the shared assignLeadToRealtor() (the same path
 * /api/broker/assign-lead uses), which itself re-verifies the contact belongs
 * to the brokerage. We additionally confirm the broker manages THIS space.
 */
async function handleReassign(params: {
  ids: string[];
  realtorUserId: string;
  callerClerkId: string;
  spaceId: string;
  req: NextRequest;
}): Promise<NextResponse> {
  const { ids, realtorUserId, callerClerkId, spaceId, req } = params;

  const ctx = await getBrokerContext();
  if (!ctx || !canManageLeads(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only a broker owner or admin can reassign leads' },
      { status: 403 },
    );
  }

  const results: PerIdResult[] = [];
  for (const id of ids) {
    try {
      const r = await assignLeadToRealtor({
        brokerage: ctx.brokerage,
        assignedByUserId: ctx.dbUserId,
        contactId: id,
        realtorUserId,
      });
      if (r.ok) results.push({ id, ok: true });
      else results.push({ id, ok: false, error: r.error });
    } catch (e) {
      console.error('[contacts/bulk] reassign failed for', id, e);
      results.push({ id, ok: false, error: 'reassign_failed' });
    }
  }

  const applied = results.filter((r) => r.ok).length;
  void audit({
    actorClerkId: callerClerkId,
    action: 'UPDATE',
    resource: 'Contact',
    spaceId,
    req,
    metadata: { bulk: true, action: 'reassign', realtorUserId, requested: ids.length, applied },
  });

  return NextResponse.json({ ok: true, applied, results });
}
