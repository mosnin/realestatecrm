/**
 * Claim a pending AgentDraft before any irreversible client send.
 *
 * Approve used to read status='pending', deliver, then write 'sent'. Two
 * concurrent Approves (double-click, auto-send + tap, two tabs) both passed
 * the read and both delivered. Scheduled dispatch already claims first
 * (`pending` → `sending`); drafts cannot add that status without a migration
 * (CHECK allows only pending/approved/dismissed/sent), so the claim writes
 * `approved` — the same terminal used today when delivery fails. A lost claim
 * returns null and the caller must not send.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

export async function claimPendingAgentDraft(
  spaceId: string,
  draftId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await tenantTable(supabase, 'AgentDraft', { spaceId })
    .update({
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markClaimedDraftSent(
  spaceId: string,
  draftId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await tenantTable(supabase, 'AgentDraft', { spaceId })
    .update({
      status: 'sent',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', draftId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}
