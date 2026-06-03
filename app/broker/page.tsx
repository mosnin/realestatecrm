import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerMemberContext } from '@/lib/permissions';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import { MemberDashboard } from './member-dashboard';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

/**
 * /broker — the brokerage home.
 *
 * Mirrors the realtor home (`/s/[slug]/chippi`): the home IS the Chippi chat.
 * Owners and admins land on the brokerage chief-of-staff chat
 * (`ChippiWorkspace variant="broker"`, backed by /api/ai/broker-task), scoped
 * to the whole brokerage. The team-overview dashboard moved to `/broker/brief`.
 *
 * `realtor_member`s are unchanged — they get their own work surface
 * (`MemberDashboard`), never the brokerage chat.
 */

export const dynamic = 'force-dynamic';

const CONV_TITLE_PREFIX = '[BROKER_CHIPPI]';

export default async function BrokerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; prompt?: string }>;
}) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  // realtor_member sees their own work surface, not the brokerage chat.
  if (ctx.membership.role === 'realtor_member') {
    return <MemberDashboard ctx={ctx} />;
  }

  const { conversationId: urlConversationId, prompt: urlPrompt } = await searchParams;
  const initialPrefill =
    typeof urlPrompt === 'string' && urlPrompt.trim().length > 0 ? urlPrompt : undefined;

  // Conversations + Messages anchor on the broker_owner's personal Space.
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ctx.brokerage.ownerId)
    .maybeSingle();

  let conversations: Conversation[] = [];
  let initialMessages: { role: 'user' | 'assistant'; content: string; blocks?: MessageBlock[] | null }[] = [];
  let initialConversationId: string | null = null;

  if (spaceRow) {
    const titlePrefix = `${CONV_TITLE_PREFIX} ${ctx.brokerage.id}`;
    const { data: convData } = await supabase
      .from('Conversation')
      .select('*')
      .eq('spaceId', spaceRow.id)
      .ilike('title', `${titlePrefix}%`)
      .order('updatedAt', { ascending: false })
      .limit(50);
    conversations = (convData ?? []) as Conversation[];

    if (urlConversationId) {
      initialConversationId = urlConversationId;
      const { data: msgData } = await supabase
        .from('Message')
        .select('role, content, blocks')
        .eq('conversationId', urlConversationId)
        .order('createdAt', { ascending: true })
        .limit(50);
      initialMessages = ((msgData ?? []) as {
        role: string;
        content: string;
        blocks: MessageBlock[] | null;
      }[]).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        blocks: m.blocks,
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
      />
    </div>
  );
}
