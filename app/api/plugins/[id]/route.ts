import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { assertPublicHttpTarget } from '@/lib/net/ssrf-guard';
import { tenantTable } from '@/lib/tenant-db';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/plugins/[id]?slug= — update { description?, url?, method?,
 *        enabled?, authHeaderName?/authHeaderValue? (pass empty strings to
 *        clear) }. Name is immutable — the agent addresses plugins by name.
 * DELETE /api/plugins/[id]?slug= — remove the plugin.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as {
    description?: string; url?: string; method?: string; enabled?: boolean;
    authHeaderName?: string; authHeaderValue?: string;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.description === 'string' && body.description.trim().length >= 10) {
    patch.description = body.description.trim().slice(0, 300);
  }
  if (typeof body.url === 'string' && body.url.trim()) {
    const check = await assertPublicHttpTarget(body.url.trim());
    if (!check.ok) {
      return NextResponse.json({ error: `That URL can't be used: ${check.reason}` }, { status: 400 });
    }
    patch.url = body.url.trim();
  }
  if (body.method === 'GET' || body.method === 'POST') patch.method = body.method;
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.authHeaderName === 'string' || typeof body.authHeaderValue === 'string') {
    const name = (body.authHeaderName ?? '').trim().slice(0, 60);
    const value = (body.authHeaderValue ?? '').trim().slice(0, 500);
    if (name && !/^[A-Za-z0-9-]+$/.test(name)) {
      return NextResponse.json({ error: 'Auth header name may only contain letters, numbers, and hyphens.' }, { status: 400 });
    }
    if ((name && !value) || (!name && value)) {
      return NextResponse.json({ error: 'Provide both the auth header name and value, or neither (empty clears).' }, { status: 400 });
    }
    patch.authHeader = name ? { name, value } : null;
  }

  const { data, error } = await tenantTable(supabase, 'CustomPlugin', { spaceId: auth.space.id })
    .update(patch)
    .eq('id', id)
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

  const { data, error } = await tenantTable(supabase, 'CustomPlugin', { spaceId: auth.space.id })
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
