import { describe, it, expect, vi } from 'vitest';
import { commitmentState, type Commitment } from '@/lib/follow-through/model';
import { commitmentSchema, createCommitment } from '@/lib/follow-through/service';
import { coverageDefinition, coverageId } from '@/lib/follow-through/coverage';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const input = { id: '6f8d2c94-1f11-41f0-93d1-46ae287c7fca', contactId: 'person', title: 'Inspection update', instruction: 'Send the confirmed inspection time.', kind: 'commitment' as const, dueAt: '2026-09-07T13:00:00Z', channel: 'email' as const };
const item = (patch: Partial<Commitment> = {}): Commitment => ({ ...input, status: 'open', scheduledMessageId: null, acceptedAt: null, completedAt: null, completionNote: null, ...patch });
describe('Client follow-through', () => {
  it('does not equate a queued message, draft or failed send with completion', () => {
    expect(commitmentState(item({ scheduledMessageId: 'm', delivery: { status: 'pending', detail: null } }), 0)).toBe('Scheduled to send');
    expect(commitmentState(item({ scheduledMessageId: 'm', delivery: { status: 'drafted', detail: null } }))).toBe('Needs attention');
    expect(commitmentState(item({ scheduledMessageId: 'm', delivery: { status: 'failed', detail: null } }))).toBe('Needs attention');
    expect(commitmentState(item({ scheduledMessageId: 'm', delivery: null }))).toBe('Delivery unavailable');
  });
  it('keeps a human acceptance distinct from a completed commitment', () => {
    expect(commitmentState(item({ status: 'accepted' }), 0)).toBe('Accepted');
    expect(commitmentState(item({ status: 'completed', completionNote: 'Called the client' }))).toBe('Completed');
    expect(commitmentState(item({ scheduledMessageId: 'm', delivery: { status: 'sent', detail: {} } }))).toBe('Sent');
  });
  it('requires human handoffs to have no automatic channel', () => {
    expect(commitmentSchema.safeParse({ ...input, kind: 'handoff' }).success).toBe(false);
    expect(commitmentSchema.safeParse({ ...input, kind: 'handoff', channel: null }).success).toBe(true);
  });
  it('saves both parts atomically using a stable request identity and authenticated scope', async () => {
    rpc.mockResolvedValue({ data: input.id, error: null });
    expect(await createCommitment('owner-space', input)).toBe(input.id);
    expect(rpc).toHaveBeenCalledWith('create_client_commitment', expect.objectContaining({ p_id: input.id, p_space_id: 'owner-space', p_channel: 'email' }));
  });
  it('surfaces failed persistence', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } });
    await expect(createCommitment('s', input)).rejects.toThrow('Database unavailable');
  });
  it('installs actual automatic event definitions with no retry of uncertain effects', () => {
    for (const key of ['reply', 'post_tour'] as const) {
      const definition = coverageDefinition(key);
      expect(definition.autonomy).toBe('auto');
      expect(definition.actions[0]).toMatchObject({ type: 'run_chippi', maxRetries: 1, onError: 'stop' });
      expect(coverageId('s1', key)).toBe(coverageId('s1', key));
      expect(coverageId('s1', key)).not.toBe(coverageId('s2', key));
    }
  });
});
