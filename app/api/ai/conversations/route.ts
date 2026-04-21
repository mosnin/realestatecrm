import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';

export async function GET(req: NextRequest) {
  try {
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
      .not('title', 'like', '[BROKERAGE_CHAT]%')
      .order('updatedAt', { ascending: false });
    if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[conversations] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('Conversation')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        title: 'New conversation',
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[conversations] POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
