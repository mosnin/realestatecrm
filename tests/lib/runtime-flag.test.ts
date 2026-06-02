/**
 * Runtime flag is the gate that decides whether a chat request runs on the
 * in-process TypeScript SDK runtime (default) or is proxied to the Modal
 * Python sandbox (opt-in via `CHIPPI_CHAT_RUNTIME=modal`).
 *
 * The in-app TS runtime owns the prod path now: direct OpenAI gpt-5-mini, no
 * cold start, full tool set + approval gates + the delegate_task orchestrator.
 * Modal stays reachable + reversible for heavy turns / incident response. The
 * contract is: any value other than the exact string `"modal"` routes to the
 * in-app TS runtime — including unset, empty, and case variants.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';

const ORIGINAL = process.env.CHIPPI_CHAT_RUNTIME;

describe('chatRuntime', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
    else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL;
  });

  it('returns "ts" when the env var is unset (production default)', () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('ts');
  });

  it('returns "ts" when the env var is empty', () => {
    process.env.CHIPPI_CHAT_RUNTIME = '';
    expect(chatRuntime()).toBe('ts');
  });

  it('returns "ts" for any value other than the exact string "modal"', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'MODAL';
    expect(chatRuntime()).toBe('ts');
    process.env.CHIPPI_CHAT_RUNTIME = ' modal ';
    expect(chatRuntime()).toBe('ts');
    process.env.CHIPPI_CHAT_RUNTIME = 'true';
    expect(chatRuntime()).toBe('ts');
    process.env.CHIPPI_CHAT_RUNTIME = '1';
    expect(chatRuntime()).toBe('ts');
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    expect(chatRuntime()).toBe('ts');
  });

  it('returns "modal" only when the env var is exactly "modal"', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    expect(chatRuntime()).toBe('modal');
  });

  it('reads the env var at call time, not at module load', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    expect(chatRuntime()).toBe('modal');
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    expect(chatRuntime()).toBe('ts');
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('ts');
  });
});
