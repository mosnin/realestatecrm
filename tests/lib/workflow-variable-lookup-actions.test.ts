/**
 * Unit tests for the lookup_table, set_variable, and get_variable actions, plus
 * the {{lookup.*}} / {{vars.*}} token namespaces they expose.
 *
 * Contracts tested:
 *   lookup_table:
 *     1. case-insensitive key match returns the mapped value in context.lookup.output
 *     2. no match with a fallback returns the fallback; matched=false
 *     3. no match without a fallback passes the resolved input through unchanged
 *     4. the input string is token-resolved before matching
 *   set_variable:
 *     5. stores a token-resolved value under context.vars[name]
 *     6. a later step can read it via {{vars.name}}
 *   get_variable:
 *     7. reads an existing variable; found=true
 *     8. falls back to defaultValue when unset; found=false
 *
 * Pure unit tests — no DB, no real agent calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { executeAction } from '@/lib/workflows/actions';

const OPTS = { spaceId: 'space_1', autonomy: 'draft' as const, runId: 'test' };

describe('lookup_table action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches a key case-insensitively and stores output in context.lookup', async () => {
    const context: Record<string, unknown> = { lead: { state: 'tx' } };
    const result = await executeAction(
      {
        type: 'lookup_table',
        config: {
          input: '{{lead.state}}',
          entries: [
            { key: 'TX', value: 'Texas' },
            { key: 'CA', value: 'California' },
          ],
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.matched).toBe(true);
    expect(result.detail.output).toBe('Texas');
    expect((context.lookup as Record<string, unknown>).output).toBe('Texas');
  });

  it('returns the fallback when no key matches', async () => {
    const context: Record<string, unknown> = { lead: { state: 'ZZ' } };
    const result = await executeAction(
      {
        type: 'lookup_table',
        config: {
          input: '{{lead.state}}',
          entries: [{ key: 'TX', value: 'Texas' }],
          fallback: 'Unknown',
        },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.matched).toBe(false);
    expect(result.detail.output).toBe('Unknown');
  });

  it('passes the resolved input through when no match and no fallback', async () => {
    const context: Record<string, unknown> = { lead: { state: 'NV' } };
    const result = await executeAction(
      {
        type: 'lookup_table',
        config: { input: '{{lead.state}}', entries: [{ key: 'TX', value: 'Texas' }] },
      },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.matched).toBe(false);
    expect(result.detail.output).toBe('NV');
  });
});

describe('set_variable / get_variable actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores a token-resolved value readable via {{vars.name}}', async () => {
    const context: Record<string, unknown> = { lead: { name: 'Dana' } };
    const setResult = await executeAction(
      { type: 'set_variable', config: { name: 'greeting', value: 'Hi {{lead.name}}' } },
      context,
      OPTS,
    );
    expect(setResult.status).toBe('ok');
    expect(setResult.detail.value).toBe('Hi Dana');
    expect((context.vars as Record<string, string>).greeting).toBe('Hi Dana');

    // A subsequent lookup_table step proves {{vars.greeting}} resolves.
    const echo = await executeAction(
      { type: 'lookup_table', config: { input: '{{vars.greeting}}', entries: [{ key: 'x', value: 'y' }] } },
      context,
      OPTS,
    );
    expect(echo.detail.input).toBe('Hi Dana');
  });

  it('get_variable reads an existing variable', async () => {
    const context: Record<string, unknown> = { vars: { tier: 'gold' } };
    const result = await executeAction(
      { type: 'get_variable', config: { name: 'tier', defaultValue: 'bronze' } },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.found).toBe(true);
    expect(result.detail.value).toBe('gold');
  });

  it('get_variable falls back to defaultValue when unset', async () => {
    const context: Record<string, unknown> = {};
    const result = await executeAction(
      { type: 'get_variable', config: { name: 'tier', defaultValue: 'bronze' } },
      context,
      OPTS,
    );
    expect(result.status).toBe('ok');
    expect(result.detail.found).toBe(false);
    expect(result.detail.value).toBe('bronze');
    expect((context.vars as Record<string, string>).tier).toBe('bronze');
  });
});

describe('run_workflow depth guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses to recurse past the max nesting depth (3) without touching the DB', async () => {
    // At depth 3 the guard must fail closed BEFORE any Supabase lookup, so the
    // mocked supabase.from is never called.
    const context: Record<string, unknown> = { _subWorkflowDepth: 3 };
    const result = await executeAction(
      { type: 'run_workflow', config: { workflowId: '00000000-0000-0000-0000-000000000000' } },
      context,
      OPTS,
    );
    expect(result.status).toBe('failed');
    expect(String(result.detail.error)).toContain('nesting depth');
  });
});
