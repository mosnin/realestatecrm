import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { tenantTable } from '@/lib/tenant-db';
import { decrypt } from '@/lib/crypto';
import { writePersonNote } from '@/lib/integrations/follow-up-boss';

interface Outbox { id: string; spaceId: string; connectionId: string; externalId: string; body: string }
export async function dispatchCrmWritebacks() {
  const counts = { sent: 0, unconfirmed: 0, blocked: 0, unavailable: false };
  // A crashed sender may have reached the provider. Surface it; never resend blindly.
  const stale = await unscoped(supabase.from('CrmWriteback'), 'cron: recover abandoned claims without re-delivering')
    .update({ status: 'unconfirmed', error: 'Delivery was interrupted. Check Follow Up Boss before retrying.', updatedAt: new Date().toISOString() })
    .eq('status', 'sending').lt('updatedAt', new Date(Date.now() - 15 * 60_000).toISOString());
  if (stale.error) counts.unavailable = true;
  const { data, error } = await unscoped(supabase.from('CrmWriteback'), 'cron: discover pending work then scope each claimed row')
    .select('id, spaceId, connectionId, externalId, body').eq('status', 'pending').order('createdAt').limit(5);
  if (error) return { ...counts, unavailable: true };
  for (const row of (data ?? []) as Outbox[]) {
    const { data: claim, error: claimError } = await tenantTable(supabase, 'CrmWriteback', { spaceId: row.spaceId })
      .update({ status: 'sending', updatedAt: new Date().toISOString() }).eq('id', row.id).eq('status', 'pending').select('id').maybeSingle();
    if (claimError || !claim) continue;
    let status: 'sent' | 'unconfirmed' | 'blocked' = 'unconfirmed';
    let externalNoteId: string | null = null;
    let message: string | null = null;
    try {
      const [connection, link] = await Promise.all([
        tenantTable(supabase, 'IntegrationConnection', { spaceId: row.spaceId }).select('secretCiphertext').eq('id', row.connectionId).eq('toolkit', 'follow_up_boss').eq('status', 'active').maybeSingle(),
        tenantTable(supabase, 'CrmContactLink', { spaceId: row.spaceId }).select('id').eq('connectionId', row.connectionId).eq('externalId', row.externalId).eq('writeBack', true).maybeSingle(),
      ]);
      if (connection.error || link.error) throw new Error('Connection permission could not be checked; no write attempted');
      if (!connection.data?.secretCiphertext || !link.data) { status = 'blocked'; message = 'Connection disconnected or write-back disabled'; }
      else { externalNoteId = await writePersonNote(decrypt(connection.data.secretCiphertext), row.externalId, row.body); status = 'sent'; }
    } catch (err) { message = err instanceof Error ? err.message : 'CRM outcome delivery unconfirmed'; }
    const receipt = await tenantTable(supabase, 'CrmWriteback', { spaceId: row.spaceId })
      .update({ status, externalNoteId, error: message, updatedAt: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'sending').select('id').maybeSingle();
    if (receipt.error || !receipt.data) { counts.unavailable = true; counts.unconfirmed++; }
    else counts[status]++;
  }
  return counts;
}
