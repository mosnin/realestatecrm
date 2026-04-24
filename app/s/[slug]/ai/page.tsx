import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChatInterface } from '@/components/ai/chat-interface';
import { AssistantTabs } from '@/components/assistant/assistant-tabs';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

export default async function AIPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const initialInput = typeof q === 'string' && q.trim() ? q.trim() : undefined;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Load conversations for this space
  let conversations: Conversation[] = [];
  let initialMessages: { role: 'user' | 'assistant'; content: string; blocks?: MessageBlock[] | null }[] = [];
  let initialConversationId: string | null = null;

  try {
    const { data: convData } = await supabase
      .from('Conversation')
      .select('*')
      .eq('spaceId', space.id)
      .not('title', 'like', '[BROKERAGE_CHAT]%')
      .order('updatedAt', { ascending: false })
      .limit(50);
    conversations = (convData ?? []) as Conversation[];

    // Load messages from the most recent conversation
    if (conversations.length > 0) {
      const latestConv = conversations[0];
      initialConversationId = latestConv.id;
      const { data: msgData } = await supabase
        .from('Message')
        .select('role, content, blocks')
        .eq('conversationId', latestConv.id)
        .order('createdAt', { ascending: true })
        .limit(50);
      initialMessages = ((msgData ?? []) as { role: string; content: string; blocks: MessageBlock[] | null }[]).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        blocks: m.blocks,
      }));
    }
  } catch {
    // fall back to empty state
  }

  const { count: pendingDrafts } = await supabase
    .from('AgentDraft')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('status', 'pending');

  return (
    <div className="flex h-full flex-col">
      <div className="px-1 pt-1">
        <AssistantTabs slug={slug} pendingDrafts={pendingDrafts ?? 0} />
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface
          slug={slug}
          initialMessages={initialMessages}
          initialConversations={conversations}
          initialConversationId={initialConversationId}
          initialInput={initialInput}
        />
      </div>
    </div>
  );
}
