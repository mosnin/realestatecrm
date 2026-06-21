import { supabase } from '@/lib/supabase';
import { resolveBrokerContext, type BrokerAgentContext } from '@/lib/agent/broker-context';

export interface AuthorizedBrokerConversation {
  brokerCtx: BrokerAgentContext;
  conversation: {
    id: string;
    brokerageId: string;
    title?: string | null;
  };
}

/**
 * Authorize access to a broker Chippi conversation.
 *
 * Broker conversations are structurally isolated in "BrokerConversation",
 * keyed by brokerageId. A caller may only access a row that belongs to the
 * brokerage resolved from their current Clerk session and broker membership.
 */
export async function getAuthorizedBrokerConversation(
  conversationId: string,
  existingBrokerCtx?: BrokerAgentContext,
): Promise<AuthorizedBrokerConversation | null> {
  const brokerCtx = existingBrokerCtx ?? await resolveBrokerContext();
  if (!brokerCtx) return null;

  const { data: conversation, error } = await supabase
    .from('BrokerConversation')
    .select('id, brokerageId, title')
    .eq('id', conversationId)
    .eq('brokerageId', brokerCtx.brokerage.id)
    .maybeSingle();
  if (error) throw error;
  if (!conversation || conversation.brokerageId !== brokerCtx.brokerage.id) return null;

  return { brokerCtx, conversation };
}
