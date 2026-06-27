/**
 * observability.ts is the one wrapper between the app and Sentry. Two things
 * matter and are easy to regress: (1) reportLog routes by level — errors
 * become Issues (captureException/Message) so they page someone, warns leave a
 * breadcrumb (and capture only if they carry an Error), info/debug NEVER
 * capture an exception; (2) telemetry must never throw into a request path, so
 * a Sentry that blows up is swallowed and withSpan still runs its work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  startSpan,
  sentryLogger,
} = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  startSpan: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
  sentryLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  startSpan,
  logger: sentryLogger,
}));

import {
  reportLog,
  withSpan,
  captureError,
  setUserContext,
} from '@/lib/observability';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reportLog routing', () => {
  it('error WITH an Error -> captureException (becomes an Issue)', () => {
    reportLog('error', 'boom', { a: 1 }, new Error('x'));
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureMessage).not.toHaveBeenCalled();
    expect(sentryLogger.error).toHaveBeenCalledWith('boom', { a: 1 });
  });

  it('error WITHOUT an Error -> captureMessage at error level', () => {
    reportLog('error', 'no-err-object');
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('no-err-object');
    // The level is applied via the scope callback (2nd arg) -> scope.setLevel.
    const scopeCb = captureMessage.mock.calls[0][1] as (s: unknown) => unknown;
    const setLevel = vi.fn();
    scopeCb({ setLevel, setExtras: vi.fn() });
    expect(setLevel).toHaveBeenCalledWith('error');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('warn leaves a breadcrumb and only captures when carrying an Error', () => {
    reportLog('warn', 'soft');
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();

    vi.clearAllMocks();
    reportLog('warn', 'soft-with-err', undefined, new Error('y'));
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('info/debug never capture an exception or message', () => {
    reportLog('info', 'fyi');
    reportLog('debug', 'trace');
    expect(addBreadcrumb).toHaveBeenCalledTimes(2);
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('telemetry never throws into the request path', () => {
  it('swallows a Sentry that throws', () => {
    captureException.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });
    expect(() => captureError(new Error('real'))).not.toThrow();
  });

  it('setUserContext tolerates a throwing Sentry', () => {
    setUser.mockImplementationOnce(() => {
      throw new Error('nope');
    });
    expect(() => setUserContext({ id: 'u1' })).not.toThrow();
  });
});

describe('withSpan transparency', () => {
  it('returns the wrapped work’s result', async () => {
    await expect(withSpan('n', 'op', async () => 42)).resolves.toBe(42);
  });

  it('still runs the work if starting the span throws', async () => {
    startSpan.mockImplementationOnce(() => {
      throw new Error('span fail');
    });
    await expect(withSpan('n', 'op', async () => 'ran')).resolves.toBe('ran');
  });
});
