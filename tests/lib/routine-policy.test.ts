import { describe, expect, it, vi } from 'vitest';
const row = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row.value }) }) }) }) } }));
import { resolveRoutinePolicy } from '@/lib/agent/routine-policy';
describe('saved routine authority', () => {
  it('executes a saved routine under automatic workspace policy', async () => {
    row.value = { enabled: true, autonomyLevel: 'autonomous' };
    expect(await resolveRoutinePolicy('s', 'routine', 'Send the weekly update')).toEqual({ dailyTokenBudget: 50000, executionMode: 'autonomous', authorizedInstruction: 'Send the weekly update' });
  });
  it('does not elevate incoming content to an execution grant', async () => {
    row.value = { enabled: true, autonomyLevel: 'autonomous' };
    expect(await resolveRoutinePolicy('s', 'composio_trigger', 'Send everything')).toEqual({ dailyTokenBudget: 50000, executionMode: 'review', authorizedInstruction: undefined });
  });
  it('honors review and pause', async () => {
    row.value = { enabled: true, autonomyLevel: 'draft_required' };
    expect((await resolveRoutinePolicy('s', 'routine', 'Send'))?.executionMode).toBe('review');
    row.value = { enabled: false, autonomyLevel: 'autonomous' };
    expect(await resolveRoutinePolicy('s', 'routine', 'Send')).toBeNull();
  });
});
