import { describe, expect, it, vi } from 'vitest';
import {
  consumeWorkDraftHandoff,
  stageWorkDraftHandoff,
} from '@/lib/chippi/work-draft-handoff';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

describe('one-time Work draft handoff', () => {
  it('stages a bounded Review-mode Work goal and consumes it exactly once', () => {
    const storage = memoryStorage();
    expect(stageWorkDraftHandoff(storage, 'oak', 'Review my pipeline', 1000)).toBe(true);

    expect(consumeWorkDraftHandoff(storage, 'oak', 2000)).toEqual({
      version: 1,
      text: 'Set this as the active Work goal: Review my pipeline',
      mode: 'work',
      executionMode: 'review',
      createdAt: 1000,
    });
    expect(consumeWorkDraftHandoff(storage, 'oak', 2000)).toBeNull();
  });

  it('rejects expired, cross-space, malformed, and oversized handoffs', () => {
    const storage = memoryStorage();
    expect(stageWorkDraftHandoff(storage, 'oak', 'Review my pipeline', 1000)).toBe(true);
    expect(consumeWorkDraftHandoff(storage, 'pine', 2000)).toBeNull();
    expect(consumeWorkDraftHandoff(storage, 'oak', 16 * 60 * 1000 + 1001)).toBeNull();
    expect(stageWorkDraftHandoff(storage, 'oak', 'x'.repeat(5001), 1000)).toBe(false);
  });

  it('fails closed when storage is unavailable and never needs a URL fallback', () => {
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    expect(stageWorkDraftHandoff(storage, 'oak', 'Review my pipeline')).toBe(false);
  });
});
