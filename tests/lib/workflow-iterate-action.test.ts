/**
 * Unit tests for the "iterate" action in the workflow engine.
 *
 * Contracts tested:
 *   1. iterate processes each item in an array resolved from a context dot-path.
 *   2. iterate respects a configured limit (defaults to 10, caps at 50).
 *   3. iterate with an empty source array returns ok with processed=0.
 *   4. iterate stashes results into context[outputField] for subsequent steps.
 *
 * Pure unit tests — no DB, no real agent calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: vi.fn(async ({ instruction }: { instruction: string }) => ({
    ok: true,
    ran: true,
    summary: `processed: ${instruction.slice(0, 50)}`,
  })),
  buildHeadlessToolContext: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { executeAction } from '@/lib/workflows/actions';

const OPTS = { spaceId: 'space_1', autonomy: 'draft' as const };

describe('iterate action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes each item in an array from context dot-path', async () => {
    const context = { lead: { tags: ['buyer', 'hot', 'investor'] } };
    const result = await executeAction(
      {
        type: 'iterate',
        config: { source: 'lead.tags', instruction: 'Handle {{item}}' },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.processed).toBe(3);
    expect(result.detail.failed).toBe(0);
  });

  it('caps at the configured limit', async () => {
    const context = { lead: { tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) } };
    const result = await executeAction(
      {
        type: 'iterate',
        config: { source: 'lead.tags', instruction: 'Handle {{item}}', limit: 5 },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.processed).toBe(5);
    expect(result.detail.capped).toBe(true);
  });

  it('returns ok with processed=0 for empty array', async () => {
    const context = { lead: { tags: [] } };
    const result = await executeAction(
      {
        type: 'iterate',
        config: { source: 'lead.tags', instruction: 'Handle {{item}}' },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.processed).toBe(0);
  });

  it('stashes results into context outputField', async () => {
    const context: Record<string, unknown> = { lead: { tags: ['a', 'b'] } };
    await executeAction(
      {
        type: 'iterate',
        config: { source: 'lead.tags', instruction: 'Process {{item}}', outputField: 'loopResults' },
      },
      context,
      OPTS,
    );
    expect(Array.isArray(context.loopResults)).toBe(true);
    expect((context.loopResults as unknown[]).length).toBe(2);
  });
});
