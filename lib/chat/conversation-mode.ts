import type { SupabaseClient } from '@supabase/supabase-js';

export type ConversationMode = 'chat' | 'work';

export function parseConversationMode(value: unknown): ConversationMode | null {
  return value === 'chat' || value === 'work' ? value : null;
}

/**
 * Atomically chooses a conversation's type on its first user turn and returns
 * the database-authoritative value thereafter. The RPC owns the row lock so
 * two first-message requests cannot race Chat and Work into different modes.
 */
export async function claimConversationMode(
  client: Pick<SupabaseClient, 'rpc'>,
  input: {
    conversationId: string;
    spaceId: string;
    requestedMode: ConversationMode;
  },
): Promise<ConversationMode> {
  const { data, error } = await client.rpc('claim_conversation_mode', {
    p_conversation_id: input.conversationId,
    p_space_id: input.spaceId,
    p_mode: input.requestedMode,
  });
  if (error) throw error;
  const mode = parseConversationMode(data);
  if (!mode) throw new Error('Conversation mode claim returned an invalid value.');
  return mode;
}
