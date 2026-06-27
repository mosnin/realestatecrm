/**
 * signup-plan transports the buyer's chosen self-serve plan through the
 * signup→onboarding chain via sessionStorage. The module is the only client
 * carrier that survives the redirect chain, so pin its contract: it stores
 * ONLY a recognized plan (noise and the 'solo' default are dropped so an
 * absent pick stays absent), it validates on read, and storage exceptions
 * (private mode / quota) are swallowed rather than thrown. Vitest runs in
 * node, so we stub a minimal window.sessionStorage at call time.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  rememberSignupPlan,
  readSignupPlan,
  clearSignupPlan,
} from '@/lib/signup-plan';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
});

describe('signup-plan transport', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    (globalThis as { window?: unknown }).window = { sessionStorage: store };
  });

  it('round-trips a recognized plan', () => {
    rememberSignupPlan('pro');
    expect(readSignupPlan()).toBe('pro');
    rememberSignupPlan('solo');
    expect(readSignupPlan()).toBe('solo');
  });

  it('never stores noise or the absent-pick default', () => {
    rememberSignupPlan('enterprise');
    rememberSignupPlan(undefined);
    rememberSignupPlan('');
    expect(store._map.size).toBe(0);
    expect(readSignupPlan()).toBeNull();
  });

  it('returns null when nothing was stored this session', () => {
    expect(readSignupPlan()).toBeNull();
  });

  it('validates on read — a tampered entry resolves to a real plan, never raw', () => {
    store._map.set('chippi:signup-plan', 'hacker');
    expect(readSignupPlan()).toBe('solo'); // resolveSelfServePlan floor
  });

  it('clears the stored choice', () => {
    rememberSignupPlan('pro');
    clearSignupPlan();
    expect(readSignupPlan()).toBeNull();
  });

  it('swallows sessionStorage exceptions (private mode / quota)', () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    };
    expect(() => rememberSignupPlan('pro')).not.toThrow();
    expect(readSignupPlan()).toBeNull();
    expect(() => clearSignupPlan()).not.toThrow();
  });
});

describe('signup-plan on the server (no window)', () => {
  it('is a no-op / null when window is undefined', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(() => rememberSignupPlan('pro')).not.toThrow();
    expect(readSignupPlan()).toBeNull();
    expect(() => clearSignupPlan()).not.toThrow();
  });
});
