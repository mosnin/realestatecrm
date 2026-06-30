/**
 * Unit tests for the "branch" action in the workflow engine.
 *
 * Contracts tested:
 *   1. First matching path runs and subsequent paths are skipped.
 *   2. Second path runs when the first path's condition does not match.
 *   3. Default actions run when no path condition matches.
 *   4. Returns pathTaken:null when no path matches and no defaultActions.
 *   5. A failed sub-action causes the branch step to return status:'failed'.
 *   6. A stop signal from a sub-action (filter not matched) halts further
 *      sub-actions in the same path.
 *   7. Label is used as pathTaken when present; field name is the fallback.
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
    summary: `done: ${instruction.slice(0, 50)}`,
  })),
  buildHeadlessToolContext: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { executeAction } from '@/lib/workflows/actions';
import { runAutonomousInstruction } from '@/lib/agent/run-instruction';

const mockedRunInstruction = vi.mocked(runAutonomousInstruction);

const OPTS = { spaceId: 'space_1', autonomy: 'draft' as const };

describe('branch action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes the first matching path and skips the rest', async () => {
    const context = { lead: { status: 'hot' } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              label: 'Hot lead',
              field: 'lead.status',
              operator: 'eq',
              value: 'hot',
              actions: [{ type: 'delay', config: { delayMinutes: 1 } }],
            },
            {
              label: 'Warm lead',
              field: 'lead.status',
              operator: 'eq',
              value: 'warm',
              actions: [{ type: 'delay', config: { delayMinutes: 5 } }],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.pathTaken).toBe('Hot lead');
    expect(result.detail.stepsRun).toBe(1);
  });

  it('falls through to the second path when the first does not match', async () => {
    const context = { lead: { score: 55 } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              label: 'high',
              field: 'lead.score',
              operator: 'gte',
              value: 80,
              actions: [{ type: 'delay', config: { delayMinutes: 1 } }],
            },
            {
              label: 'mid',
              field: 'lead.score',
              operator: 'gte',
              value: 50,
              actions: [{ type: 'delay', config: { delayMinutes: 2 } }],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.pathTaken).toBe('mid');
    expect(result.detail.stepsRun).toBe(1);
  });

  it('runs default actions when no path matches', async () => {
    const context = { lead: { score: 10 } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              field: 'lead.score',
              operator: 'gte',
              value: 80,
              actions: [{ type: 'delay', config: { delayMinutes: 1 } }],
            },
          ],
          defaultActions: [{ type: 'delay', config: { delayMinutes: 10 } }],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.pathTaken).toBe('default');
    expect(result.detail.stepsRun).toBe(1);
  });

  it('returns pathTaken:null when no path matches and there are no default actions', async () => {
    const context = { lead: { score: 0 } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              field: 'lead.score',
              operator: 'gte',
              value: 80,
              actions: [{ type: 'delay', config: { delayMinutes: 1 } }],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.pathTaken).toBeNull();
    expect(result.detail.reason).toMatch(/no path/i);
  });

  it('uses the field name as pathTaken when the path has no label', async () => {
    const context = { lead: { tags: ['buyer'] } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              field: 'lead.tags',
              operator: 'contains',
              value: 'buyer',
              actions: [{ type: 'delay', config: { delayMinutes: 1 } }],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.pathTaken).toBe('lead.tags');
  });

  it('returns failed when a sub-action in the matched path fails', async () => {
    mockedRunInstruction.mockResolvedValueOnce({ ok: false, ran: false, summary: 'agent error' });
    const context = { lead: { status: 'new' } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              label: 'always',
              field: 'lead.status',
              operator: 'exists',
              actions: [
                { type: 'run_chippi', config: { instruction: 'Do something' } },
              ],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('failed');
    expect(result.detail.pathTaken).toBe('always');
    expect((result.detail.results as Array<{ status: string }>)[0].status).toBe('failed');
  });

  it('stops executing sub-actions when a filter step returns stop:true', async () => {
    // filter(lead.score >= 80) will FAIL for score=30 → stop=true
    // The second sub-action (run_chippi) must NOT run.
    const context = { lead: { score: 30 } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              label: 'always',
              field: 'lead.status',
              operator: 'not_exists',
              actions: [
                {
                  type: 'filter',
                  config: { field: 'lead.score', operator: 'gte', value: 80 },
                },
                { type: 'run_chippi', config: { instruction: 'Should not run' } },
              ],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    // Branch itself should be ok (filter skipped = not a failure)
    expect(result.status).toBe('ok');
    // Only 1 step ran (the filter), run_chippi was halted by stop
    expect(result.detail.stepsRun).toBe(1);
    // runAutonomousInstruction should never have been called
    expect(mockedRunInstruction).not.toHaveBeenCalled();
  });

  it('runs all sub-actions in the matched path when none stop early', async () => {
    const context = { lead: { status: 'active' } };
    const result = await executeAction(
      {
        type: 'branch',
        config: {
          paths: [
            {
              label: 'active',
              field: 'lead.status',
              operator: 'eq',
              value: 'active',
              actions: [
                { type: 'delay', config: { delayMinutes: 1 } },
                { type: 'delay', config: { delayMinutes: 2 } },
                { type: 'delay', config: { delayMinutes: 3 } },
              ],
            },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.stepsRun).toBe(3);
  });
});
