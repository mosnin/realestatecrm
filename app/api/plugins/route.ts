import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { assertPublicHttpTarget } from '@/lib/net/ssrf-guard';
import { tenantTable } from '@/lib/tenant-db';

export const runtime = 'nodejs';

const MAX_PLUGINS = 20;
const NAME_RE = /^[a-z0-9][a-z0-9-_]{1,39}$/;

/**
 * GET  /api/plugins?slug= — the caller's custom plugins. The auth header VALUE
 *      is never returned (write-only secret); only whether one is set.
 * POST /api/plugins       — create: { slug, name, description, url, method?,
 *      authHeaderName?, authHeaderValue? }.
 *
 * A custom plugin is a user-defined HTTP tool Chippi can call: the description
 * tells the model when to reach for it; execution runs through the SSRF guard
 * and is approval-gated in chat (see lib/ai-tools/tools/use-plugin.ts).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const { data } = await tenantTable(supabase, 'CustomPlugin', { spaceId: auth.space.id })
    .select('id, name, description, url, method, authHeader, enabled, createdAt')
    .order('createdAt', { ascending: false })
    .limit(MAX_PLUGINS);

  return NextResponse.json({
    plugins: ((data ?? []) as Array<{
      id: string;
      name: string;
      description: string;
      url: string;
      method: string;
      authHeader: { name?: string } | null;
      enabled: boolean;
      createdAt: string;
    }>).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.url,
      method: p.method,
      // Never echo the secret back — only that one exists.
      hasAuth: Boolean((p.authHeader as { name?: string } | null)?.name),
      enabled: p.enabled,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as {
    slug?: string; name?: string; description?: string; url?: string;
    method?: string; authHeaderName?: string; authHeaderValue?: string;
  };
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(body.slug);
  if (auth instanceof NextResponse) return auth;

  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: 'Name must be 2–40 chars: lowercase letters, numbers, hyphens (e.g. "mls-lookup").' },
      { status: 400 },
    );
  }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) : '';
  if (description.length < 10) {
    return NextResponse.json(
      { error: 'Describe what the plugin does and when Chippi should use it (at least 10 characters).' },
      { status: 400 },
    );
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  // Same gate the call path enforces — reject unreachable/unsafe targets at
  // the door so the realtor learns immediately, not at first agent call.
  const check = await assertPublicHttpTarget(url);
  if (!check.ok) {
    return NextResponse.json({ error: `That URL can't be used: ${check.reason}` }, { status: 400 });
  }

  const method = body.method === 'GET' ? 'GET' : 'POST';
  const headerName = typeof body.authHeaderName === 'string' ? body.authHeaderName.trim().slice(0, 60) : '';
  const headerValue = typeof body.authHeaderValue === 'string' ? body.authHeaderValue.trim().slice(0, 500) : '';
  // Header names ride into fetch() — keep them token-shaped so a crafted name
  // can't smuggle CR/LF or pretend to be a structural header.
  if (headerName && !/^[A-Za-z0-9-]+$/.test(headerName)) {
    return NextResponse.json({ error: 'Auth header name may only contain letters, numbers, and hyphens.' }, { status: 400 });
  }
  if ((headerName && !headerValue) || (!headerName && headerValue)) {
    return NextResponse.json({ error: 'Provide both the auth header name and value, or neither.' }, { status: 400 });
  }

  const { count } = await tenantTable(supabase, 'CustomPlugin', { spaceId: auth.space.id })
    .select('*', { count: 'exact', head: true });
  if ((count ?? 0) >= MAX_PLUGINS) {
    return NextResponse.json({ error: `You've reached the limit of ${MAX_PLUGINS} plugins.` }, { status: 409 });
  }

  const { data, error } = await tenantTable(supabase, 'CustomPlugin', { spaceId: auth.space.id })
    .insert({
      id: crypto.randomUUID(),
      spaceId: auth.space.id,
      name,
      description,
      url,
      method,
      authHeader: headerName ? { name: headerName, value: headerValue } : null,
    })
    .select('id, name, description, url, method, enabled, createdAt')
    .single();
  if (error || !data) {
    const isDup = (error as { code?: string } | null)?.code === '23505';
    return NextResponse.json(
      { error: isDup ? 'You already have a plugin with that name.' : 'Failed to create the plugin.' },
      { status: isDup ? 409 : 500 },
    );
  }
  return NextResponse.json({ plugin: { ...data, hasAuth: Boolean(headerName) } }, { status: 201 });
}
