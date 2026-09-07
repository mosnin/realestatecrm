import { requireBroker } from '@/lib/permissions';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';

/** Selected brokerage membership is rechecked on every record request. */
export async function brokerRecordScope() {
  const { brokerage } = await requireBroker();
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true, strict: true });
  const spaceIds = members.flatMap(m => m.Space?.id ? [m.Space.id] : []);
  if (!spaceIds.length) {
    const { data, error } = await supabase.from('Space').select('id').eq('ownerId', brokerage.ownerId);
    if (error) throw error;
    spaceIds.push(...(data ?? []).map(row => row.id));
  }
  return { brokerage, spaceIds };
}
export async function getBrokerRecord(kind: 'people' | 'deals' | 'properties', id: string) {
  const scope = await brokerRecordScope();
  const table = kind === 'people' ? 'Contact' : kind === 'deals' ? 'Deal' : 'Property';
  let query = unscoped(supabase.from(table), 'broker record: current membership scope enforced before return').select('*').eq('id', id);
  if (kind === 'properties') query = query.eq('brokerageId', scope.brokerage.id);
  else {
    if (!scope.spaceIds.length) return null;
    query = query.in('spaceId', scope.spaceIds);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
