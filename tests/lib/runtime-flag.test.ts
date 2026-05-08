/**
 * Runtime flag is the gate that decides whether a chat request goes
 * through the Modal Python sandbox (default) or the in-process TS
 * SDK runtime (opt-in). Modal is the load-bearing production path;
 * only an explicit `CHIPPI_CHAT_RUNTIME=ts` should use the TS path.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';

const ORIGINAL = process.env.CHIPPI_CHAT_RUNTIME;

describe('chatRuntime', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
    else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL;
  });

  it('returns "modal" when the env var is unset (production default)', () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('modal');
  });

  it('returns "modal" when the env var is empty', () => {
    process.env.CHIPPI_CHAT_RUNTIME = '';
    expect(chatRuntime()).toBe('modal');
  });

  it('returns "modal" for any value other than the exact string "ts"', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'TS';
    expect(chatRuntime()).toBe('modal');
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    expect(chatRuntime()).toBe('modal');
    process.env.CHIPPI_CHAT_RUNTIME = 'true';
    expect(chatRuntime()).toBe('modal');
    process.env.CHIPPI_CHAT_RUNTIME = '1';
    expect(chatRuntime()).toBe('modal');
  });

  it('returns "ts" only when the env var is exactly "ts"', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    expect(chatRuntime()).toBe('ts');
  });

  it('reads the env var at call time, not at module load', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    expect(chatRuntime()).toBe('ts');
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    expect(chatRuntime()).toBe('modal');
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('modal');
  });
});
