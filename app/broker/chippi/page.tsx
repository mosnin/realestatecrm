import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerMemberContext } from '@/lib/permissions';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

/**
 * /broker/chippi — the broker chief-of-staff chat surface.
 *
 * Defense layer 1 of three (per Chippi-for-Brokers Phase 1 spec):
 *
 *   1. ROUTE GUARD   — THIS FILE. Resolves the calling user via
 *                      `getBrokerMemberContext()` and redirects out when
 *                      the user has no brokerage membership OR has the
 *                      `realtor_member` role (realtor_members get their
 *                      own Chippi at /s/<slug>/chippi).
 *   2. API GATE      — `/api/ai/broker-task` re-runs `resolveBrokerContext()`
 *                      before forwarding the turn to Modal.
 *   3. TOOL-RUNTIME  — `agent/tools/broker/_guards.py:require_broker_role`
 *                      refuses tool execution unless AgentContext carries
 *                      a broker role.
 *
 * Phase 1 renders the existing ChippiWorkspace with `variant: 'broker'`.
 * Same logo, same chat shape — the variant is a quiet signal, not a
 * re-skin. Broker tools land in Phase 2/3 via `agent/tools/broker.BROKER_TOOLS`.
 */

// Conversations are server-rendered so the empty state vs. loaded state
// matches the realtor page on first paint.
export const dynamic = 'force-dynamic';

const CONV_TITLE_PREFIX = '[BROKER_CHIPPI]';

export default async function BrokerChippiPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; prompt?: string }>;
}) {
  const { conversationId: urlConversationId, prompt: urlPrompt } = await searchParams;
  // `?prompt=` pre-fills the composer (broker reads it, edits if they want, then
  // hits send). Same plumbing the realtor surface uses via `?prefill=`; named
  // `prompt` here because the broker entry points (realtor-row affordances,
  // stuck-deal "Audit this") read more naturally as "ask Chippi this prompt".
  const initialPrefill =
    typeof urlPrompt === 'string' && urlPrompt.trim().length > 0 ? urlPrompt : undefined;

  // Route guard. `getBrokerMemberContext` returns null for: not signed in,
  // not a brokerage member, offboarded. We additionally reject
  // realtor_member — they reach Chippi via their realtor workspace.
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');
  if (ctx.membership.role === 'realtor_member') redirect('/');

  // Conversations + Messages anchor on the broker_owner's personal Space.
  // Phase 1 returns null gracefully for broker_only owners with no
  // personal space; Phase 2 will resolve them through a canonical anchor.
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ctx.brokerage.ownerId)
    .maybeSingle();

  // Load broker-Chippi conversations for the sidebar drawer + hydrate
  // initialMessages if the URL names a specific conversation.
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
    <div className="flex h-full flex-col">
      <ChippiWorkspace
        // No realtor slug in broker variant — the API gate resolves
        // brokerage scope from the Clerk session. Pass empty to satisfy
        // the prop without leaking a realtor space identifier.
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
