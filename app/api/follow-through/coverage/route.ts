import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { coverageOptions, coverageId, coverageDefinition } from '@/lib/follow-through/coverage';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Workspace required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await tenantTable(supabase, 'Workflow', { spaceId: auth.space.id })
    .select('id, enabled, lastRunAt, lastRunStatus').in('id', coverageOptions.map(o => coverageId(auth.space.id, o.key)));
  if (error) return NextResponse.json({ error: 'Coverage could not be loaded' }, { status: 503 });
  return NextResponse.json({ coverage: coverageOptions.map(o => ({ ...o, ...data?.find((r: { id: string }) => r.id === coverageId(auth.space.id, o.key)), enabled: data?.find((r: { id: string }) => r.id === coverageId(auth.space.id, o.key))?.enabled ?? false })) });
}
export async function POST(req: NextRequest) {
  const parsed = z.object({ slug: z.string().min(1), key: z.enum(['reply', 'post_tour']), enabled: z.boolean() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coverage setting' }, { status: 400 });
  const auth = await requireSpaceOwner(parsed.data.slug);
  if (auth instanceof NextResponse) return auth;
  const option = coverageOptions.find(o => o.key === parsed.data.key)!;
  const id = coverageId(auth.space.id, option.key);
  // Enabling explicitly authorizes this named routine. Existing unrelated
  // workflows and customer sending policies are never bulk-modified.
  const definition = coverageDefinition(option.key);
  if (parsed.data.enabled) {
    const { data: conflicts, error: conflictError } = await tenantTable(supabase, 'Workflow', { spaceId: auth.space.id })
      .select('id').eq('enabled', true).eq('trigger->>type', definition.trigger.type).neq('id', id).limit(1);
    if (conflictError) return NextResponse.json({ error: 'Could not check existing coverage' }, { status: 503 });
    if (conflicts?.length) return NextResponse.json({ error: 'An existing automation already handles this event. Review it in Automations before turning on overlapping coverage.' }, { status: 409 });
  }
  const { error } = await tenantTable(supabase, 'Workflow', { spaceId: auth.space.id }).upsert({
    id, spaceId: auth.space.id, name: option.title, description: option.description,
    enabled: parsed.data.enabled, notifyOnError: true, ...definition, updatedAt: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: 'Could not save coverage' }, { status: 503 });
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
