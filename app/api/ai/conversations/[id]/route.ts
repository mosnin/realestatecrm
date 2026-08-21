import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAuthorizedRealtorConversation } from '@/lib/chat/realtor-conversation-auth';
import { parseWorkExecutionMode } from '@/lib/chat/work-execution-mode';

const rateLimited = () =>
  NextResponse.json(
    { error: 'too many requests. try again shortly.' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );

async function getConversationAndVerifyOwner(conversationId: string, userId: string) {
  const authorized = await getAuthorizedRealtorConversation({
    clerkUserId: userId,
    conversationId,
  });
  return authorized?.conversation ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkRateLimit(`ai:conversations:${userId}`, 20, 60);
    if (!allowed) return rateLimited();

    const { id } = await params;
    const conv = await getConversationAndVerifyOwner(id, userId);
    if (!conv) return NextResponse.json({ error: 'Not found or Forbidden' }, { status: 404 });

    const body = await req.json();
    const hasTitle = typeof body?.title === 'string' && body.title.trim().length > 0;
    const hasExecutionMode = body?.executionMode === 'review' || body?.executionMode === 'autonomous';
    if (hasTitle === hasExecutionMode) {
      return NextResponse.json(
        { error: 'provide exactly one of title or executionMode' },
        { status: 400 },
      );
    }

    const patch = hasTitle
      ? { title: body.title.trim(), updatedAt: new Date().toISOString() }
      : {
          executionMode: parseWorkExecutionMode(body.executionMode),
          updatedAt: new Date().toISOString(),
        };

    const { data, error } = await tenantTable(supabase, 'Conversation', { spaceId: conv.spaceId })
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('[conversations/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkRateLimit(`ai:conversations:${userId}`, 20, 60);
    if (!allowed) return rateLimited();

    const { id } = await params;
    const conv = await getConversationAndVerifyOwner(id, userId);
    if (!conv) return NextResponse.json({ error: 'Not found or Forbidden' }, { status: 404 });

    const { error } = await tenantTable(supabase, 'Conversation', { spaceId: conv.spaceId })
      .delete()
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[conversations/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
