import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChatInterface } from '@/components/ai/chat-interface';
import type { Conversation } from '@/lib/types';

export default async function AIPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
  let initialMessages: { role: 'user' | 'assistant'; content: string }[] = [];
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
        .select('role, content')
        .eq('conversationId', latestConv.id)
        .order('createdAt', { ascending: true })
        .limit(50);
      initialMessages = ((msgData ?? []) as { role: string; content: string }[]).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    }
  } catch {
    // fall back to empty state
  }

  return (
    <div className="h-full">
      <ChatInterface
        slug={slug}
        initialMessages={initialMessages}
        initialConversations={conversations}
        initialConversationId={initialConversationId}
      />
    </div>
  );
}
