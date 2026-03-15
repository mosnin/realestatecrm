import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireContactAccess(id);
  if (auth instanceof NextResponse) return auth;

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
  const { id } = await params;
  const auth = await requireContactAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const body = await req.json();
  const { type, content, metadata } = body;

  const VALID_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up'];
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const safeContent = typeof content === 'string' ? content.slice(0, 5000) : null;

  const { data, error } = await supabase
    .from('ContactActivity')
    .insert({
      id: crypto.randomUUID(),
      contactId: id,
      spaceId: space.id,
      type,
      content: safeContent,
      metadata: metadata ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
