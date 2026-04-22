import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncContact } from '@/lib/vectorize';
import { notifyNewContact } from '@/lib/notify';
import type { Contact } from '@/lib/types';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const search = req.nextUrl.searchParams.get('search') ?? '';
  const type = req.nextUrl.searchParams.get('type');
  // Snooze hygiene: by default hide currently-snoozed contacts from the main
  // People view. Callers that need them (e.g. a "Snoozed" tab, or the
  // command palette fuzzy search) can pass ?includeSnoozed=1.
  const includeSnoozed = req.nextUrl.searchParams.get('includeSnoozed') === '1';
  const onlySnoozed = req.nextUrl.searchParams.get('onlySnoozed') === '1';

  let query = supabase
    .from('Contact')
    .select('*')
    .eq('spaceId', space.id)
    .is('brokerageId', null); // Exclude brokerage leads — those show on /broker/leads

  if (!includeSnoozed && !onlySnoozed) {
    query = query.or(`snoozedUntil.is.null,snoozedUntil.lte.${new Date().toISOString()}`);
  } else if (onlySnoozed) {
    query = query.gt('snoozedUntil', new Date().toISOString());
  }

  if (search) {
    // Cap length to prevent expensive full-table-scan patterns
    const limitedSearch = search.slice(0, 100);
    // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
    const escaped = limitedSearch.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    // Strip PostgREST filter-breaking characters (commas, parens)
    const sanitized = escaped.replace(/[,()]/g, '');
    const pattern = `%${sanitized}%`;
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},preferences.ilike.${pattern}`);
  }

  if (type && type !== 'ALL') {
    query = query.eq('type', type);
  }

  // Pagination: default 500, max 1000
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '500', 10);
  const offsetParam = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(1, limitParam || 500), 1000);
  const offset = Math.max(0, offsetParam || 0);

  const { data: contacts, error } = await query
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[contacts/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }

  return NextResponse.json(contacts as Contact[]);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, name, email, phone, budget, preferences, properties, address, notes, type, tags } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const id = crypto.randomUUID();
  const budgetVal = budget != null && budget !== '' ? parseFloat(budget) : null;
  const propsVal = properties || [];
  const tagsVal = tags || [];

  const VALID_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
  const contactType = VALID_TYPES.includes(type) ? type : 'QUALIFICATION';

  const { data: contact, error } = await supabase.from('Contact').insert({
    id,
    spaceId: space.id,
    name,
    email: email || null,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    type: contactType,
    budget: budgetVal,
    preferences: preferences || null,
    properties: propsVal,
    tags: tagsVal,
  }).select().single();
  if (error) {
    console.error('[contacts/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }

  // Async vectorization — don't block the response
  syncContact(contact as Contact).catch(console.error);

  // SMS notification for new leads
  try {
    await notifyNewContact({
      spaceId: space.id,
      contactName: name,
      contactPhone: phone || null,
      contactEmail: email || null,
      tags: tagsVal,
    });
  } catch (e) { console.error('[contacts] notification failed:', e); }

  return NextResponse.json(contact, { status: 201 });
}
