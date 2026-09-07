import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { commitmentSchema, createCommitment, listCommitments } from '@/lib/follow-through/service';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Workspace required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  try {
    const search = (req.nextUrl.searchParams.get('search') ?? '').slice(0, 100).replace(/[%_\\]/g, '\\$&');
    const [items, contacts] = await Promise.all([
      listCommitments(auth.space.id),
      tenantTable(supabase, 'Contact', { spaceId: auth.space.id })
        .select('id, name, email, phone').is('brokerageId', null)
        .ilike('name', `%${search}%`).order('name').limit(100),
    ]);
    if (contacts.error) throw new Error('People could not be loaded.');
    return NextResponse.json({ items, contacts: contacts.data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Follow-through unavailable' }, { status: 503 });
  }
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ slug: z.string().min(1), commitment: commitmentSchema }).strict().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Choose a person, a due date and the work to complete.' }, { status: 400 });
  const auth = await requireSpaceOwner(parsed.data.slug);
  if (auth instanceof NextResponse) return auth;
  try {
    const id = await createCommitment(auth.space.id, parsed.data.commitment);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save commitment' }, { status: 409 });
  }
}
export async function PATCH(req: NextRequest) {
  const parsed = z.object({ slug: z.string().min(1), id: z.string().uuid(),
    action: z.enum(['accept', 'complete', 'cancel']), note: z.string().trim().max(2000).optional(),
  }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
  const auth = await requireSpaceOwner(parsed.data.slug);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabase.rpc('change_client_commitment', {
    p_space_id: auth.space.id, p_id: parsed.data.id, p_action: parsed.data.action, p_note: parsed.data.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  if (!data) return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
