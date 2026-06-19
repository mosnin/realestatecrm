/**
 * Saved Views — named, persisted filter sets for the contact + deal lists.
 *
 *   GET    /api/saved-views?slug=<space>&entity=<contact|deal>
 *            → SavedView[] for that space + entity, newest first.
 *   POST   /api/saved-views   { slug, entity, name, filters }
 *            → the created SavedView (201).
 *   DELETE /api/saved-views?slug=<space>&id=<viewId>
 *            → { success: true }. The delete is scoped to the space, so a
 *              viewId from another workspace silently affects zero rows and
 *              returns 404 — never a cross-space delete.
 *
 * Every verb resolves + authorizes the workspace with requireSpaceOwner(slug)
 * (owner OR managing broker), and every query is scoped to that space's id, so
 * a caller can only ever read/write/delete their own space's views. Mirrors the
 * auth + response conventions of app/api/contacts/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import type { SavedView, SavedViewEntity } from '@/lib/types';

const VALID_ENTITIES: readonly SavedViewEntity[] = ['contact', 'deal'];
const MAX_NAME_LEN = 80;
// A single workspace accumulating thousands of saved views is almost certainly
// a bug or abuse, not a workflow. Cap creation so the list query and the chip
// strip stay bounded.
const MAX_VIEWS_PER_BUCKET = 100;

function isValidEntity(v: unknown): v is SavedViewEntity {
  return typeof v === 'string' && (VALID_ENTITIES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const entity = req.nextUrl.searchParams.get('entity');
  if (!isValidEntity(entity)) {
    return NextResponse.json({ error: 'entity must be contact or deal' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('SavedView')
    .select('*')
    .eq('spaceId', space.id)
    .eq('entity', entity)
    .order('createdAt', { ascending: false });
  if (error) {
    console.error('[saved-views/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch saved views' }, { status: 500 });
  }

  return NextResponse.json((data ?? []) as SavedView[]);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { slug, entity, name, filters } = (body ?? {}) as {
    slug?: string;
    entity?: unknown;
    name?: unknown;
    filters?: unknown;
  };

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  if (!isValidEntity(entity)) {
    return NextResponse.json({ error: 'entity must be contact or deal' }, { status: 400 });
  }
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (trimmedName.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `name must be ${MAX_NAME_LEN} characters or fewer` },
      { status: 400 },
    );
  }
  // `filters` is opaque to the server but must be a plain JSON object — reject
  // arrays / primitives so a malformed payload can't poison the row.
  if (
    filters !== undefined &&
    (typeof filters !== 'object' || filters === null || Array.isArray(filters))
  ) {
    return NextResponse.json({ error: 'filters must be an object' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Enforce the per-(space, entity) cap before inserting.
  const { count } = await supabase
    .from('SavedView')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('entity', entity);
  if ((count ?? 0) >= MAX_VIEWS_PER_BUCKET) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_VIEWS_PER_BUCKET} views. Delete one first.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('SavedView')
    .insert({
      spaceId: space.id,
      userId,
      entity,
      name: trimmedName,
      filters: (filters as Record<string, unknown>) ?? {},
    })
    .select()
    .single();
  if (error) {
    console.error('[saved-views/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to save view' }, { status: 500 });
  }

  return NextResponse.json(data as SavedView, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const id = req.nextUrl.searchParams.get('id');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Scope the delete to the space. A viewId belonging to another workspace
  // matches zero rows here (returned via `select`), so we answer 404 rather
  // than leaking its existence or deleting it.
  const { data: deleted, error } = await supabase
    .from('SavedView')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id)
    .select('id');
  if (error) {
    console.error('[saved-views/DELETE] delete error:', error);
    return NextResponse.json({ error: 'Failed to delete saved view' }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
