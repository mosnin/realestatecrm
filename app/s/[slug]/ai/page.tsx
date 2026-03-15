import { notFound } from 'next/navigation';
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
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Load conversations for this space
  let conversations: Conversation[] = [];
  let initialMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  let initialConversationId: string | null = null;

  try {
    const { data: convData } = await supabase
      .from('Conversation')
      .select('*')
      .eq('spaceId', space.id)
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
    <div className="flex flex-col h-full gap-4">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">AI Assistant</h2>
        <p className="text-muted-foreground text-sm">
          Ask about your leads, clients, or pipeline — get instant answers from your leasing data
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatInterface
          slug={slug}
          initialMessages={initialMessages}
          initialConversations={conversations}
          initialConversationId={initialConversationId}
        />
      </div>
    </div>
  );
}
