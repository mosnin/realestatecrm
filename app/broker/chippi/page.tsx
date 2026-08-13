import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerMemberContext } from '@/lib/permissions';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import type { ChatConversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

/** Canonical brokerage Chippi chat. The brokerage default lives at Today. */
export const dynamic = 'force-dynamic';

export default async function BrokerChippiPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; prompt?: string; prefill?: string }>;
}) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');
  if (ctx.membership.role === 'realtor_member') redirect('/broker/brief');

  const {
    conversationId: urlConversationId,
    prompt: urlPrompt,
    prefill: urlPrefill,
  } = await searchParams;
  const initialPrefill =
    typeof urlPrompt === 'string' && urlPrompt.trim().length > 0
      ? urlPrompt
      : typeof urlPrefill === 'string' && urlPrefill.trim().length > 0
        ? urlPrefill
        : undefined;

  const { data: convData } = await supabase
    .from('BrokerConversation')
    .select('*')
    .eq('brokerageId', ctx.brokerage.id)
    .order('updatedAt', { ascending: false })
    .limit(50);
  const conversations = (convData ?? []) as ChatConversation[];

  let initialMessages: {
    role: 'user' | 'assistant';
    content: string;
    blocks?: MessageBlock[] | null;
  }[] = [];
  let initialConversationId: string | null = null;

  if (urlConversationId) {
    const { data: convRow } = await supabase
      .from('BrokerConversation')
      .select('id, brokerageId')
      .eq('id', urlConversationId)
      .eq('brokerageId', ctx.brokerage.id)
      .maybeSingle();
    const isThisBrokerageConversation =
      convRow != null &&
      (convRow as { brokerageId: string }).brokerageId === ctx.brokerage.id;

    if (isThisBrokerageConversation) {
      initialConversationId = urlConversationId;
      const { data: msgData } = await supabase
        .from('BrokerMessage')
        .select('role, content, blocks')
        .eq('brokerageId', ctx.brokerage.id)
        .eq('conversationId', urlConversationId)
        .order('createdAt', { ascending: true })
        .limit(50);
      initialMessages = ((msgData ?? []) as {
        role: string;
        content: string;
        blocks: MessageBlock[] | null;
      }[]).map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
        blocks: message.blocks,
      }));
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <ChippiWorkspace
        slug=""
        variant="broker"
        initialMessages={initialMessages}
        initialConversations={conversations}
        initialConversationId={initialConversationId}
        initialPrefill={initialPrefill}
        researchEnabled={false}
        workspaceRunsEnabled={false}
      />
    </div>
  );
}
