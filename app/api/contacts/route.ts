import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncContact } from '@/lib/vectorize';
import type { Contact } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const search = req.nextUrl.searchParams.get('search') ?? '';
  const type = req.nextUrl.searchParams.get('type');

  let query = supabase
    .from('Contact')
    .select('*')
    .eq('spaceId', space.id)
    .not('tags', 'cs', '["application-link"]');

  if (search) {
    // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
    const escaped = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escaped}%`;
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},preferences.ilike.${pattern}`);
  }

  if (type && type !== 'ALL') {
    query = query.eq('type', type);
  }

  const { data: contacts, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;

  return NextResponse.json(contacts as Contact[]);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { slug, name, email, phone, budget, preferences, properties, address, notes, type, tags } = body;

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const budgetVal = budget != null && budget !== '' ? parseFloat(budget) : null;
  const propsVal = properties || [];
  const tagsVal = tags || [];

  const { data: contact, error } = await supabase.from('Contact').insert({
    id,
    spaceId: space.id,
    name,
    email: email || null,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    type: type || 'QUALIFICATION',
    budget: budgetVal,
    preferences: preferences || null,
    properties: propsVal,
    tags: tagsVal,
  }).select().single();
  if (error) throw error;

  // Async vectorization — don't block the response
  syncContact(contact as Contact).catch(console.error);

  return NextResponse.json(contact, { status: 201 });
}
