import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MESSAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    // Verify conversation belongs to a space the user owns
    const { data: conv } = await supabase
      .from('Conversation')
      .select('id, spaceId, Space(ownerId)')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: user } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', (conv as any).Space.ownerId)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabase
      .from('Message')
      .select('id, role, content, blocks, createdAt')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[messages] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
