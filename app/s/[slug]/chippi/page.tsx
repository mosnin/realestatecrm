import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

export default async function ChippiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; tab?: string; prefill?: string }>;
}) {
  const { slug } = await params;
  const { q, tab, prefill } = await searchParams;
  const initialInput = typeof q === 'string' && q.trim() ? q.trim() : undefined;
  // `prefill` populates the composer but does NOT auto-send — the realtor
  // finishes the sentence themselves. Used by "or just tell Chippi →" shortcuts
  // on /contacts and /deals (and by morning-actions). Distinct from `q`.
  const initialPrefill = typeof prefill === 'string' && prefill.length > 0 ? prefill : undefined;
  const view = tab === 'settings' ? 'settings' : 'workspace';

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

  return (
    <div className="flex h-full flex-col">
      <ChippiWorkspace
        slug={slug}
        view={view}
        initialMessages={initialMessages}
        initialConversations={conversations}
        initialConversationId={initialConversationId}
        initialInput={initialInput}
        initialPrefill={initialPrefill}
      />
    </div>
  );
}
