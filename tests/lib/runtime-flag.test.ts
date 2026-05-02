/**
 * Runtime flag is the gate that decides whether a chat request goes
 * through the TS SDK runtime (default) or the legacy Modal proxy
 * (opt-in). Post-cutover, the SDK is the load-bearing path and only an
 * explicit `CHIPPI_CHAT_RUNTIME=modal` should reach back to the legacy
 * route — and that route has been deleted, so the value is vestigial
 * but kept for one stability cycle.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';

const ORIGINAL = process.env.CHIPPI_CHAT_RUNTIME;

describe('chatRuntime', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
    else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL;
  });

  it('returns "ts" when the env var is unset (post-cutover default)', () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    expect(chatRuntime()).toBe('ts');
  });

  it('returns "ts" when the env var is empty', () => {
    process.env.CHIPPI_CHAT_RUNTIME = '';
    expect(chatRuntime()).toBe('ts');
  });

  it('returns "ts" for any value other than the exact string "modal"', () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'TS';
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
