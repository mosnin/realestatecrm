import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantTable } from '@/lib/tenant-db';

/** Settle only the exact unclaimed request. A concurrent running claim wins. */
export async function rejectPendingTurn(client: SupabaseClient, input: {
  spaceId: string;
  conversationId?: string | null;
  turnId?: string;
  clientRequestId?: string;
  message: string;
  error: string;
}) {
  if (!input.conversationId || !input.turnId || !input.clientRequestId) return;
  const { error } = await tenantTable(client, 'ConversationTurn', { spaceId: input.spaceId })
    .update({ status: 'failed', terminalReason: 'preflight_rejected', lastError: input.error,
      finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .eq('id', input.turnId)
    .eq('conversationId', input.conversationId)
    .eq('clientRequestId', input.clientRequestId)
    .eq('message', input.message)
    .eq('status', 'pending');
  if (error) throw new Error('Could not settle rejected work');
}
