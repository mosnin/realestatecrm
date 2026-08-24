import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: vi.fn(),
  buildHeadlessToolContext: vi.fn(),
}));

import { executeAction } from '@/lib/workflows/actions';

describe('workflow delay honesty', () => {
  it('halts the run instead of skipping the wait', async () => {
    const result = await executeAction(
      { type: 'delay', config: { delayMinutes: 120 } },
      {},
      { spaceId: 'space_1', autonomy: 'draft' },
    );
    expect(result.status).toBe('skipped');
    expect(result.stop).toBe(true);
    expect(String(result.detail.note)).toContain('Later steps were not run');
    expect(String(result.detail.note)).not.toContain('subsequent steps ran immediately');
  });
});
