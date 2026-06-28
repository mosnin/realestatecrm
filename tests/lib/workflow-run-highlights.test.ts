/**
 * Unit tests for highlightsFromSteps — reduces a run's steps to the per-node
 * outcome map the canvas uses to light up the executed path.
 */

import { describe, it, expect } from 'vitest';
import { highlightsFromSteps } from '@/components/workflows/run-highlights';

describe('highlightsFromSteps', () => {
  it('maps each step to its node id and normalized status', () => {
    const steps = [
      { status: 'ok', detail: { nodeId: 'c', passed: true } },
      { status: 'ok', detail: { nodeId: 'hot' } },
    ];
    expect(highlightsFromSteps(steps)).toEqual({ c: 'ok', hot: 'ok' });
  });

  it('normalizes failed/error → failed and skipped → skipped', () => {
    const steps = [
      { status: 'failed', detail: { nodeId: 'a' } },
      { status: 'error', detail: { nodeId: 'b' } },
      { status: 'skipped', detail: { nodeId: 'c' } },
      { status: 'completed', detail: { nodeId: 'd' } },
    ];
    expect(highlightsFromSteps(steps)).toEqual({ a: 'failed', b: 'failed', c: 'skipped', d: 'ok' });
  });

  it('ignores steps with no nodeId (linear path / malformed detail)', () => {
    const steps = [
      { status: 'ok', detail: { passed: true } }, // no nodeId
      { status: 'ok', detail: null },
      { status: 'ok' },
      { status: 'ok', detail: { nodeId: 42 } }, // non-string
      { status: 'ok', detail: { nodeId: 'real' } },
    ];
    expect(highlightsFromSteps(steps)).toEqual({ real: 'ok' });
  });

  it('lets the last step for a node win', () => {
    const steps = [
      { status: 'ok', detail: { nodeId: 'x' } },
      { status: 'failed', detail: { nodeId: 'x' } },
    ];
    expect(highlightsFromSteps(steps)).toEqual({ x: 'failed' });
  });

  it('returns an empty map for no steps', () => {
    expect(highlightsFromSteps([])).toEqual({});
  });
});
