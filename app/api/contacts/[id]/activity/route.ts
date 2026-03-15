import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';

async function resolveContactSpace(contactId: string, userId: string) {
  const { data: rows, error } = await supabase
    .from('Contact')
    .select('spaceId')
    .eq('id', contactId)
    .limit(1);
  if (error) throw error;
  if (!rows?.length) return null;

  const space = await getSpaceForUser(userId);
  if (!space || rows[0].spaceId !== space.id) return null;
  return space;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const space = await resolveContactSpace(id, userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('ContactActivity')
    .select('*')
    .eq('contactId', id)
    .order('createdAt', { ascending: false });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const space = await resolveContactSpace(id, userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { type, content, metadata } = body;

  const VALID_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up'];
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ContactActivity')
    .insert({
      id: crypto.randomUUID(),
      contactId: id,
      spaceId: space.id,
      type,
      content: content ?? null,
      metadata: metadata ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
