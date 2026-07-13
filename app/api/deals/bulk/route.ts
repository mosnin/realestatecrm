/**
 * Bulk actions for the deal list.
 *
 *   POST /api/deals/bulk
 *     { slug, ids: string[], action: BulkAction, ...actionArgs }
 *
 * Actions (applied to the selected ids in ONE pass, within the caller's space):
 *   - set-status    { status }    active | lost | on_hold   (see note on 'won')
 *   - archive                      shorthand for status = 'on_hold'
 *   - set-priority  { priority }   LOW | MEDIUM | HIGH
 *
 * 'won' is intentionally NOT a bulk status: closing a deal runs a per-deal
 * e-sign gate (Brokerage.requireSignedDocsBeforeClose, enforced in
 * app/api/deals/[id]/route.ts). Closing in bulk would silently bypass that
 * compliance check, so winning a deal stays a single, deliberate action.
 *
 * Guarantees:
 *   - Space-scoped: every deal is re-read with `.eq('spaceId', space.id)`, so an
 *     id from another workspace yields a per-id `not_found` and is NEVER
 *     mutated — no cross-space write.
 *   - Capped: at most MAX_BULK ids per request (else 400). Ids are de-duped.
 *   - Per-id results: { ok, applied, results: [{ id, ok, error? }] }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { syncDeal } from '@/lib/vectorize';
import type { Deal } from '@/lib/types';
import { MAX_DEAL_BULK as MAX_BULK } from '@/lib/api-limits';

// 'won' deliberately excluded — see file header.
const VALID_BULK_STATUSES = ['active', 'lost', 'on_hold'] as const;
type BulkStatus = (typeof VALID_BULK_STATUSES)[number];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

type BulkAction = 'set-status' | 'archive' | 'set-priority';
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
    status,
    priority,
  } = (body ?? {}) as {
    slug?: string;
    ids?: unknown;
    action?: unknown;
    status?: unknown;
    priority?: unknown;
  };

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 });
  }
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

  const validActions: readonly BulkAction[] = ['set-status', 'archive', 'set-priority'];
  if (typeof action !== 'string' || !(validActions as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const act = action as BulkAction;

  let statusVal: BulkStatus | null = null;
  if (act === 'set-status') {
    if (typeof status !== 'string' || !(VALID_BULK_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: "status must be 'active', 'lost' or 'on_hold'" },
        { status: 400 },
      );
    }
    statusVal = status as BulkStatus;
  } else if (act === 'archive') {
    statusVal = 'on_hold';
  }
  let priorityVal: Priority | null = null;
  if (act === 'set-priority') {
    if (typeof priority !== 'string' || !(VALID_PRIORITIES as readonly string[]).includes(priority)) {
      return NextResponse.json({ error: 'priority must be LOW, MEDIUM or HIGH' }, { status: 400 });
    }
    priorityVal = priority as Priority;
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Load only the rows actually in this space. Missing ids → not_found.
  const { data: rows, error: loadErr } = await supabase
    .from('Deal')
    .select('id, status')
    .eq('spaceId', space.id)
    .in('id', ids);
  if (loadErr) {
    console.error('[deals/bulk] load error:', loadErr);
    return NextResponse.json({ error: 'Failed to load deals' }, { status: 500 });
  }
  const byId = new Map(
    (rows ?? []).map((r) => [r.id as string, r as { id: string; status: string }]),
  );

  const results: PerIdResult[] = [];
  const nowIso = new Date().toISOString();

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, ok: false, error: 'not_found' });
      continue;
    }

    const updates: Record<string, unknown> = { updatedAt: nowIso };
    if (act === 'set-status' || act === 'archive') {
      updates.status = statusVal;
      // Mirror the [id] PATCH: stamp closedAt when transitioning into 'lost'
      // (the only closing status reachable here). Re-applying the same status
      // is a no-op for closedAt.
      if (statusVal === 'lost' && row.status !== 'lost') {
        updates.closedAt = nowIso;
      }
    } else if (act === 'set-priority') {
      updates.priority = priorityVal;
    }

    const { data: updated, error: updErr } = await supabase
      .from('Deal')
      .update(updates)
      .eq('id', id)
      .eq('spaceId', space.id)
      .select()
      .maybeSingle();
    if (updErr || !updated) {
      results.push({ id, ok: false, error: 'update_failed' });
      continue;
    }
    syncDeal(updated as Deal).catch(() => {});
    results.push({ id, ok: true });
  }

  const applied = results.filter((r) => r.ok).length;
  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'Deal',
    spaceId: space.id,
    req,
    metadata: { bulk: true, action: act, requested: ids.length, applied },
  });

  return NextResponse.json({ ok: true, applied, results });
}
