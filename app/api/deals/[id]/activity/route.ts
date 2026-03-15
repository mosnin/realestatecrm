import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('spaceId')
    .eq('id', id)
    .limit(1);
  if (dealError) throw dealError;
  if (!dealRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || dealRows[0].spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('DealActivity')
    .select('*')
    .eq('dealId', id)
    .order('createdAt', { ascending: false });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('spaceId')
    .eq('id', id)
    .limit(1);
  if (dealError) throw dealError;
  if (!dealRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || dealRows[0].spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { type, content, metadata } = body;

  const VALID_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up', 'stage_change', 'status_change'];
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('DealActivity')
    .insert({
      id: crypto.randomUUID(),
      dealId: id,
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
