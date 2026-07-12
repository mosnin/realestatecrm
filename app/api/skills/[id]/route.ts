import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/skills/[id]?slug= — update { title?, description?, prompt?, enabled? }.
 * DELETE /api/skills/[id]?slug= — remove the skill.
 * Both scoped: the row must belong to the caller's space.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as { title?: string; description?: string; prompt?: string; enabled?: boolean };

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 60);
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 160);
  if (typeof body.prompt === 'string' && body.prompt.trim().length >= 10) patch.prompt = body.prompt.trim().slice(0, 4000);
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;

  const { data, error } = await supabase
    .from('UserSkill')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', auth.space.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Update failed.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { error } = await supabase
    .from('UserSkill')
    .delete()
    .eq('id', id)
    .eq('spaceId', auth.space.id);
  if (error) return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
