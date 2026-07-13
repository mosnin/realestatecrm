/**
 * Merge duplicate contacts into a survivor.
 *
 *   POST /api/contacts/merge
 *     { slug, survivorId, duplicateIds: string[], commit?: boolean }
 *
 *   commit=false (DEFAULT) → PREVIEW. Computes the merged field values, tag
 *     union, and a per-reference-table count of what WOULD be re-pointed.
 *     Mutates NOTHING. The UI shows this before the realtor confirms.
 *
 *   commit=true → executes the merge via the merge_contacts() RPC, which runs
 *     the entire re-point + field-merge + delete inside ONE transaction
 *     (all-or-nothing; if any re-point fails the duplicates are never deleted).
 *
 * Safety:
 *   - Space-scoped: every id (survivor + duplicates) is verified to belong to
 *     the caller's space BEFORE any work. A cross-space id → 400, no write. The
 *     RPC re-checks this server-side as defense-in-depth.
 *   - Idempotent: a duplicate id that was already merged away is skipped; a
 *     re-run after success is a no-op (alreadyMerged:true).
 *   - Capped: at most MAX_MERGE_GROUP duplicates per call.
 *   - Audited: the RPC writes an AuditLog row; we also audit() the action.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { syncContact } from '@/lib/vectorize';
import type { Contact } from '@/lib/types';
import { MAX_CONTACT_MERGE_GROUP as MAX_MERGE_GROUP } from '@/lib/api-limits';

/** Reference tables re-pointed by merge_contacts(), for the preview count. */
const REFERENCE_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'DealContact', column: 'contactId' },
  { table: 'ContactActivity', column: 'contactId' },
  { table: 'Tour', column: 'contactId' },
  { table: 'AgentDraft', column: 'contactId' },
  { table: 'AgentGoal', column: 'contactId' },
  { table: 'AgentQuestion', column: 'contactId' },
  { table: 'AgentActivityLog', column: 'relatedContactId' },
  { table: 'ContactDocument', column: 'contactId' },
  { table: 'ApplicationMessage', column: 'contactId' },
  { table: 'ApplicationStatusUpdate', column: 'contactId' },
  { table: 'ClientMessage', column: 'contactId' },
  { table: 'ClientInfoRequest', column: 'contactId' },
  { table: 'ClientDocument', column: 'contactId' },
  { table: 'CallLog', column: 'contactId' },
  { table: 'SignatureRequest', column: 'contactId' },
];

const TEXT_FILL_FIELDS = [
  'email',
  'phone',
  'address',
  'notes',
  'preferences',
  'sourceLabel',
  'sourceDetail',
  'scoreLabel',
  'scoreSummary',
] as const;
const VALUE_FILL_FIELDS = [
  'budget',
  'followUpAt',
  'lastContactedAt',
  'source',
  'leadScore',
  'scoreDetails',
  'applicationData',
] as const;

function blank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

/** Compute the merged survivor preview (survivor wins; blanks filled oldest-first; tags unioned). */
function computeMerged(survivor: Record<string, unknown>, dupesOldestFirst: Record<string, unknown>[]) {
  const merged: Record<string, unknown> = { ...survivor };
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const dup of dupesOldestFirst) {
    for (const f of TEXT_FILL_FIELDS) {
      if (blank(merged[f]) && !blank(dup[f])) merged[f] = (dup[f] as string);
    }
    for (const f of VALUE_FILL_FIELDS) {
      if (merged[f] == null && dup[f] != null) merged[f] = dup[f];
    }
  }

  // Tag + property union.
  const tagUnion = new Set<string>();
  const propUnion = new Set<string>();
  for (const c of [survivor, ...dupesOldestFirst]) {
    for (const t of (Array.isArray(c.tags) ? c.tags : []) as string[]) tagUnion.add(t);
    for (const p of (Array.isArray(c.properties) ? c.properties : []) as string[]) propUnion.add(p);
  }
  merged.tags = Array.from(tagUnion);
  merged.properties = Array.from(propUnion);

  for (const f of [...TEXT_FILL_FIELDS, ...VALUE_FILL_FIELDS] as const) {
    if (merged[f] !== survivor[f]) changes[f] = { from: survivor[f] ?? null, to: merged[f] ?? null };
  }
  if ((merged.tags as string[]).length !== (Array.isArray(survivor.tags) ? survivor.tags.length : 0)) {
    changes.tags = { from: survivor.tags ?? [], to: merged.tags };
  }

  return { merged, changes };
}

/** Count how many rows in each reference table point at the duplicate ids. */
async function countReferences(spaceId: string, dupIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    REFERENCE_TABLES.map(async ({ table, column }) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .in(column, dupIds);
        if (!error && count && count > 0) counts[`${table}.${column}`] = count;
      } catch {
        // A table may not exist on every deployment (feature migrations land
        // independently) — a missing table just contributes nothing to the
        // preview. The RPC guards the same tables with to_regclass.
      }
    }),
  );
  return counts;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { slug, survivorId, duplicateIds: rawDupIds, commit } = (body ?? {}) as {
    slug?: string;
    survivorId?: unknown;
    duplicateIds?: unknown;
    commit?: unknown;
  };

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (typeof survivorId !== 'string' || !survivorId) {
    return NextResponse.json({ error: 'survivorId required' }, { status: 400 });
  }
  if (!Array.isArray(rawDupIds)) {
    return NextResponse.json({ error: 'duplicateIds must be an array' }, { status: 400 });
  }

  // De-dupe, drop blanks + the survivor (can't merge a contact into itself).
  const duplicateIds = Array.from(
    new Set(
      rawDupIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x !== survivorId),
    ),
  );
  if (duplicateIds.length === 0) {
    return NextResponse.json({ error: 'duplicateIds must contain at least one other contact' }, { status: 400 });
  }
  if (duplicateIds.length > MAX_MERGE_GROUP) {
    return NextResponse.json(
      { error: `Too many duplicates — max ${MAX_MERGE_GROUP} per merge.` },
      { status: 400 },
    );
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // ── Space-scoping: load survivor + all duplicates, scoped to this space ───
  // Anything in the requested set that is NOT returned is a cross-space or
  // deleted id. We REFUSE the whole merge if any requested duplicate exists in
  // another space — but a duplicate that simply doesn't exist (already merged)
  // is fine and is skipped (idempotency).
  const allIds = [survivorId, ...duplicateIds];
  const { data: rows, error: loadErr } = await supabase
    .from('Contact')
    .select('*')
    .eq('spaceId', space.id)
    .in('id', allIds);
  if (loadErr) {
    console.error('[contacts/merge] load error:', loadErr);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r as Record<string, unknown>]));
  const survivor = byId.get(survivorId);
  if (!survivor) {
    // Survivor missing from this space → either cross-space or gone. Refuse.
    return NextResponse.json(
      { error: 'Survivor contact not found in this space' },
      { status: 404 },
    );
  }

  // Detect cross-space duplicate ids: requested but absent from this space.
  // We can't tell "deleted" from "other space" via this query alone, so do a
  // second unscoped existence check ONLY for the missing ones — if any missing
  // id exists at all (in another space), that's a hard cross-space refusal.
  const presentDupIds = duplicateIds.filter((id) => byId.has(id));
  const missingDupIds = duplicateIds.filter((id) => !byId.has(id));
  if (missingDupIds.length > 0) {
    const { data: foreign } = await supabase
      .from('Contact')
      .select('id')
      .in('id', missingDupIds);
    if (foreign && foreign.length > 0) {
      return NextResponse.json(
        { error: 'Refusing merge: one or more contacts belong to a different workspace.' },
        { status: 400 },
      );
    }
    // else: missing ids simply don't exist anywhere → treat as already-merged.
  }

  if (presentDupIds.length === 0) {
    // Everything was already merged/deleted — idempotent success.
    return NextResponse.json({
      ok: true,
      committed: false,
      alreadyMerged: true,
      survivorId,
      merged: [],
    });
  }

  // Duplicates ordered oldest-first so the earliest non-null fills a blank
  // (mirrors the RPC's ORDER BY createdAt ASC).
  const dupesOldestFirst = presentDupIds
    .map((id) => byId.get(id)!)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      return ta - tb;
    });

  const { merged, changes } = computeMerged(survivor, dupesOldestFirst);

  // ── PREVIEW (default) ─────────────────────────────────────────────────────
  if (commit !== true) {
    const references = await countReferences(space.id, presentDupIds);
    return NextResponse.json({
      ok: true,
      committed: false,
      preview: true,
      survivorId,
      duplicateIds: presentDupIds,
      survivor: {
        id: survivor.id,
        name: survivor.name,
        email: survivor.email,
        phone: survivor.phone,
        tags: survivor.tags,
      },
      duplicates: dupesOldestFirst.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        tags: d.tags,
      })),
      merged: {
        tags: merged.tags,
        email: merged.email,
        phone: merged.phone,
      },
      changes,
      references,
    });
  }

  // ── COMMIT — transactional RPC ────────────────────────────────────────────
  const { data: rpcData, error: rpcError } = await supabase.rpc('merge_contacts', {
    p_survivor_id: survivorId,
    p_duplicate_ids: presentDupIds,
    p_space_id: space.id,
    p_actor_clerk_id: userId,
  });
  if (rpcError) {
    console.error('[contacts/merge] rpc error:', rpcError);
    return NextResponse.json(
      { error: 'Merge failed — no changes were made.', detail: rpcError.message },
      { status: 500 },
    );
  }

  const result = (rpcData ?? {}) as {
    survivorId?: string;
    merged?: string[];
    repointed?: Record<string, number>;
    alreadyMerged?: boolean;
  };

  // Refresh the survivor's vector index off the merged record (best-effort).
  try {
    const { data: fresh } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', survivorId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (fresh) syncContact(fresh as Contact).catch(() => {});
  } catch {
    /* non-fatal */
  }

  // Audit (the RPC also writes one; this mirrors the rest of the API surface).
  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'Contact',
    resourceId: survivorId,
    spaceId: space.id,
    req,
    metadata: {
      op: 'merge',
      survivorId,
      mergedIds: result.merged ?? [],
      repointed: result.repointed ?? {},
    },
  });

  return NextResponse.json({
    ok: true,
    committed: true,
    survivorId,
    merged: result.merged ?? [],
    repointed: result.repointed ?? {},
    alreadyMerged: result.alreadyMerged ?? false,
  });
}
