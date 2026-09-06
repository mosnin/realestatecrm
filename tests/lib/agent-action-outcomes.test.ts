import { describe, it, expect, vi } from 'vitest';
const { inserted, emitted, firstAction } = vi.hoisted(() => ({ inserted: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })), emitted: vi.fn(), firstAction: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ insert: inserted }) } }));
vi.mock('@/lib/telemetry', () => ({ emit: emitted, maybeEmitFirstAction: firstAction, SIDE_EFFECTING_TOOLS: new Set(['send_email', 'set_followup']) }));
import { classifyToolOutcome, recordToolOutcome, recordActivityOutcome } from '@/lib/ai-tools/outcomes';
describe('Actual useful work', () => {
  it('separates a draft, failure, uncertain delivery, and confirmed send', () => {
    expect(classifyToolOutcome('draft_email', { summary: 'ready', display: 'message-draft' })).toBe('drafted');
    expect(classifyToolOutcome('send_email', { summary: 'sent', display: 'error' })).toBe('failed');
    expect(classifyToolOutcome('send_email', { summary: 'unknown', durableExecutionDisposition: 'reconciliation_required' })).toBe('uncertain');
    expect(classifyToolOutcome('send_email', { summary: 'sent', display: 'success' })).toBe('completed');
    expect(classifyToolOutcome('schedule_tour', { summary: 'Booked', display: 'tours', data: { tours: [{ tourId: 'saved-tour' }] } })).toBe('completed');
    expect(classifyToolOutcome('schedule_tour', { summary: 'No receipt', display: 'tours', data: { tours: [] } })).toBe('read');
  });
  it('does not count a draft as activation', () => {
    firstAction.mockClear();
    recordToolOutcome('draft_email', { summary: 'ready', display: 'message-draft' }, { userId: 'owner', space: { id: 'space', slug: 'oak', name: 'Oak', ownerId: 'owner' }, signal: new AbortController().signal });
    expect(firstAction).not.toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ outcome: 'drafted' }) }));
  });
  it('uses the same receipt identity on repeated writes and preserves tenant scope', async () => {
    await recordActivityOutcome({ spaceId: 'space', name: 'send_email', outcome: 'completed', callId: 'call-1' });
    await recordActivityOutcome({ spaceId: 'space', name: 'send_email', outcome: 'completed', callId: 'call-1' });
    expect(inserted.mock.calls.at(-1)?.[0]).toMatchObject({ id: 'ts:space:call-1', spaceId: 'space', outcome: 'completed' });
  });
});
