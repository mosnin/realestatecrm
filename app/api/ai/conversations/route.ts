import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const { data: owner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('Conversation')
    .select('*')
    .eq('spaceId', space.id)
    .order('updatedAt', { ascending: false });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const { data: owner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('Conversation')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      title: 'New conversation',
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
