import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!q || q.length < 2) return NextResponse.json({ contacts: [], deals: [] });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const term = `%${q}%`;

  const [contactsResult, dealsResult] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, email, phone, type, leadScore, scoreLabel')
      .eq('spaceId', space.id)
      .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .limit(8),
    supabase
      .from('Deal')
      .select('id, title, address, value, status, stageId, DealStage(name, color)')
      .eq('spaceId', space.id)
      .or(`title.ilike.${term},address.ilike.${term}`)
      .limit(8),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (dealsResult.error) throw dealsResult.error;

  const contacts = (contactsResult.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    type: c.type,
    leadScore: c.leadScore ?? null,
    scoreLabel: c.scoreLabel ?? null,
  }));

  const deals = (dealsResult.data ?? []).map((d: any) => ({
    id: d.id,
    title: d.title,
    address: d.address ?? null,
    value: d.value ?? null,
    status: d.status ?? 'active',
    stage: d.DealStage ? { name: d.DealStage.name, color: d.DealStage.color } : null,
  }));

  return NextResponse.json({ contacts, deals });
}
