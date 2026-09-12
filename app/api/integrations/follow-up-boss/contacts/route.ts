import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSpaceOwner } from '@/lib/api-auth';
import { findActive } from '@/lib/integrations/connections';
import { getPerson } from '@/lib/integrations/follow-up-boss';
import { decrypt } from '@/lib/crypto';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

export async function POST(req: NextRequest) {
  const parsed = z.object({ slug: z.string().min(1), externalId: z.string().regex(/^[1-9]\d*$/).max(16), writeBack: z.boolean() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a Follow Up Boss contact' }, { status: 400 });
  const auth = await requireSpaceOwner(parsed.data.slug);
  if (auth instanceof NextResponse) return auth;
  const connection = await findActive({ spaceId: auth.space.id, userId: auth.userId, toolkit: 'follow_up_boss' });
  if (!connection?.secretCiphertext) return NextResponse.json({ error: 'Connect Follow Up Boss first' }, { status: 409 });
  try {
    const person = await getPerson(decrypt(connection.secretCiphertext), parsed.data.externalId);
    const { data, error } = await supabase.rpc('import_fub_person', {
      p_space_id: auth.space.id, p_connection_id: connection.id, p_external_id: person.id,
      p_name: person.name, p_email: person.email ?? '', p_phone: person.phone ?? '', p_write_back: parsed.data.writeBack,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ contactId: data, writeBack: parsed.data.writeBack });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 409 }); }
}
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Workspace required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const connection = await findActive({ spaceId: auth.space.id, userId: auth.userId, toolkit: 'follow_up_boss' });
  if (!connection) return NextResponse.json({ links: [], receipts: [] });
  const [links, receipts] = await Promise.all([
    tenantTable(supabase, 'CrmContactLink', { spaceId: auth.space.id }).select('id, contactId, externalId, writeBack').eq('connectionId', connection.id).limit(500),
    tenantTable(supabase, 'CrmWriteback', { spaceId: auth.space.id }).select('id, externalId, status, error, updatedAt').eq('connectionId', connection.id).order('createdAt', { ascending: false }).limit(50),
  ]);
  if (links.error || receipts.error) return NextResponse.json({ error: 'CRM follow-through status unavailable' }, { status: 503 });
  return NextResponse.json({ links: links.data, receipts: receipts.data });
}
export async function PATCH(req: NextRequest) {
  const parsed = z.object({ slug: z.string().min(1), linkId: z.string().uuid(), writeBack: z.literal(false) }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid link update' }, { status: 400 });
  const auth = await requireSpaceOwner(parsed.data.slug);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await tenantTable(supabase, 'CrmContactLink', { spaceId: auth.space.id })
    .update({ writeBack: false }).eq('id', parsed.data.linkId).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not stop activity sync' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
