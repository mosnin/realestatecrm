import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

export const commitmentSchema = z.object({
  id: z.string().uuid(), contactId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(1).max(4000),
  kind: z.enum(['commitment', 'handoff']),
  dueAt: z.string().datetime({ offset: true }),
  channel: z.enum(['email', 'sms']).nullable().default(null),
}).strict().refine(v => v.kind !== 'handoff' || v.channel === null, 'Handoffs require a person, not an automatic message');
export type CommitmentInput = z.infer<typeof commitmentSchema>;
import type { Commitment } from './model';
export { commitmentState } from './model';
export type { Commitment } from './model';
export async function createCommitment(spaceId: string, input: CommitmentInput): Promise<string> {
  const parsed = commitmentSchema.parse(input);
  const { data, error } = await supabase.rpc('create_client_commitment', {
    p_id: parsed.id, p_space_id: spaceId, p_contact_id: parsed.contactId,
    p_title: parsed.title, p_instruction: parsed.instruction, p_kind: parsed.kind,
    p_due_at: parsed.dueAt, p_channel: parsed.channel,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function listCommitments(spaceId: string): Promise<Commitment[]> {
  const [open, closed] = await Promise.all([
    tenantTable(supabase, 'ClientCommitment', { spaceId }).select('*').in('status', ['open', 'accepted']).order('dueAt', { ascending: true }).limit(100),
    tenantTable(supabase, 'ClientCommitment', { spaceId }).select('*').in('status', ['completed', 'canceled']).order('updatedAt', { ascending: false }).limit(20),
  ]);
  if (open.error || closed.error) throw new Error('Client commitments could not be loaded.');
  const rows = [...(open.data ?? []), ...(closed.data ?? [])] as Commitment[];
  const ids = rows.flatMap(r => r.scheduledMessageId ? [r.scheduledMessageId] : []);
  if (!ids.length) return rows;
  const result = await tenantTable(supabase, 'ScheduledMessage', { spaceId })
    .select('id, status, detail').in('id', ids);
  if (result.error) throw new Error('Delivery receipts could not be loaded.');
  const receipts = new Map((result.data ?? []).map((r: { id: string; status: string; detail: Record<string, unknown> | null }) => [r.id, r]));
  return rows.map(r => ({ ...r, delivery: r.scheduledMessageId ? (receipts.get(r.scheduledMessageId) ?? null) as Commitment['delivery'] : null }));
}
