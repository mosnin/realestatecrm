import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAuthorizedRealtorConversation } from '@/lib/chat/realtor-conversation-auth';

const MESSAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkRateLimit(`ai:messages:${userId}`, 20, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: 'too many requests. try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const conversationId = req.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    let authorized;
    try {
      authorized = await getAuthorizedRealtorConversation({ clerkUserId: userId, conversationId });
    } catch (err) {
      console.error('[messages] Conversation authorization failed:', err);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!authorized) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data, error } = await tenantTable(supabase, 'Message', {
      spaceId: authorized.space.id,
    })
      .select('id, role, content, blocks, createdAt')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true })
      .limit(MESSAGE_LIMIT);
    if (error) {
      console.error('[messages] Message lookup failed:', error);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('[messages] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
