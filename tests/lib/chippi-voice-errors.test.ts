/**
 * chippi-voice's error helpers are the single source of truth for what Chippi
 * SAYS when something breaks: classifyError turns a raw error string into a
 * ChippiErrorCode, chippiErrorMessage turns that code into an in-character line.
 * The classifier's substring precedence is load-bearing (rate-limit before
 * budget before guardrail...), and every code must map to a non-empty,
 * first-person message. Pin both so the voice never degrades to a stack trace.
 */

import { describe, it, expect } from 'vitest';
import { classifyError, chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';

describe('classifyError', () => {
  it('falls back to internal for empty / null / unrecognized', () => {
    expect(classifyError(null)).toBe('internal');
    expect(classifyError(undefined)).toBe('internal');
    expect(classifyError('')).toBe('internal');
    expect(classifyError('something weird happened')).toBe('internal');
  });

  it('maps the recognized error families (case-insensitive)', () => {
    expect(classifyError('Rate limit exceeded')).toBe('rate_limited');
    expect(classifyError('TOO MANY requests')).toBe('rate_limited');
    expect(classifyError('monthly budget reached')).toBe('budget_exhausted');
    expect(classifyError('token quota')).toBe('budget_exhausted');
    expect(classifyError('blocked by guardrail')).toBe('guardrail');
    expect(classifyError('request refused by policy')).toBe('guardrail');
    expect(classifyError('fetch failed: ECONNRESET')).toBe('network');
    expect(classifyError('host unreachable')).toBe('network');
    expect(classifyError('401 Unauthorized')).toBe('auth');
    expect(classifyError('tool failed to run')).toBe('tool_failure');
  });

  it('honors precedence: rate limit wins over budget', () => {
    // contains both "rate limit" and "budget"; the earlier check must win
    expect(classifyError('rate limit hit while checking budget')).toBe('rate_limited');
  });

  it('only classifies tool errors when BOTH "tool" and failed/error appear', () => {
    expect(classifyError('the tool was great')).toBe('internal'); // no failure word
    expect(classifyError('tool error')).toBe('tool_failure');
  });
});

describe('chippiErrorMessage', () => {
  it('returns a non-empty, first-person line for every code', () => {
    const codes = [
      'cold_start', 'tool_failure', 'budget_exhausted', 'quota', 'guardrail',
      'network', 'rate_limited', 'auth', 'persistence', 'internal',
    ] as const;
    for (const code of codes) {
      const msg = chippiErrorMessage(code);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/error|exception|stack|null|undefined/i); // no system-warning vocab
    }
  });

  it('shares one message between budget_exhausted and quota', () => {
    expect(chippiErrorMessage('quota')).toBe(chippiErrorMessage('budget_exhausted'));
  });

  it('falls back to the internal line for an unknown code', () => {
    expect(chippiErrorMessage('totally_unknown' as Parameters<typeof chippiErrorMessage>[0])).toBe(
      chippiErrorMessage('internal'),
    );
  });
});
