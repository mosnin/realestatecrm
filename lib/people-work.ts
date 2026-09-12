import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { commitmentState, type Commitment } from '@/lib/follow-through/model';
export type PersonWork = { title: string; label: string; dueAt: string; requiresAttention: boolean };
/** Existing commitments and delivery receipts; never infer completion from a draft. */
export async function peopleWork(spaceId: string, ids: string[]): Promise<Map<string, PersonWork>> {
  const rows: Commitment[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await tenantTable(supabase, 'ClientCommitment', { spaceId }).select('*').in('contactId', ids.slice(start, start + 100)).in('status', ['open', 'accepted']).order('dueAt').order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const receiptIds = [...new Set(rows.flatMap(row => row.scheduledMessageId ? [row.scheduledMessageId] : []))];
  const receipts = new Map<string, Commitment['delivery']>();
  for (let start = 0; start < receiptIds.length; start += 100) {
    const { data, error } = await tenantTable(supabase, 'ScheduledMessage', { spaceId }).select('id, status, detail').in('id', receiptIds.slice(start, start + 100));
    if (error) throw error;
    for (const receipt of data ?? []) receipts.set(receipt.id, receipt);
  }
  const result = new Map<string, PersonWork>();
  for (const row of rows.sort((a,b)=>new Date(a.dueAt).getTime()-new Date(b.dueAt).getTime())) {
    const label = commitmentState({...row, delivery: row.scheduledMessageId ? receipts.get(row.scheduledMessageId) ?? null : null});
    if (label === 'Sent' || label === 'Canceled' || label === 'Completed') continue;
    const requiresAttention = ['Needs attention','Overdue','Needs you','Delivery unavailable','Awaiting delivery'].includes(label);
    const previous = result.get(row.contactId);
    if (!previous || (requiresAttention && !previous.requiresAttention)) result.set(row.contactId, {title:row.title,label,dueAt:row.dueAt,requiresAttention});
  }
  return result;
}
export async function attachPeopleWork<T extends {id:string;spaceId:string}>(contacts:T[]) {
  const groups = [...new Set(contacts.map(row=>row.spaceId))];
  const work = new Map<string, PersonWork>();
  const unavailable = new Set<string>();
  for (const spaceId of groups) {
    try { for (const [id,value] of await peopleWork(spaceId,contacts.filter(row=>row.spaceId===spaceId).map(row=>row.id))) work.set(id,value); }
    catch { unavailable.add(spaceId); }
  }
  return contacts.map(row=>({...row,work:work.get(row.id)??null,workUnavailable:unavailable.has(row.spaceId)}));
}
