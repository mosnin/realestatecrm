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

  // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
  const escaped = q.slice(0, 100).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const term = `%${escaped}%`;

  try {
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

    if (contactsResult.error) {
      console.error('[search] contacts query error:', contactsResult.error);
      return NextResponse.json({ contacts: [], deals: [], error: 'Contact search failed' }, { status: 500 });
    }
    if (dealsResult.error) {
      console.error('[search] deals query error:', dealsResult.error);
      return NextResponse.json({ contacts: [], deals: [], error: 'Deal search failed' }, { status: 500 });
    }

    const contacts = (contactsResult.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      type: c.type,
      leadScore: c.leadScore ?? null,
      scoreLabel: c.scoreLabel ?? null,
    }));

    const deals = (dealsResult.data ?? []).map((d: any) => {
      const rawStage = d.DealStage;
      const stage = Array.isArray(rawStage) ? rawStage[0] ?? null : rawStage ?? null;
      return {
        id: d.id,
        title: d.title,
        address: d.address ?? null,
        value: d.value ?? null,
        status: d.status ?? 'active',
        stage: stage ? { name: stage.name, color: stage.color } : null,
      };
    });

    return NextResponse.json({ contacts, deals });
  } catch (err) {
    console.error('[search] unexpected error:', err);
    return NextResponse.json({ contacts: [], deals: [], error: 'Search failed' }, { status: 500 });
  }
}
