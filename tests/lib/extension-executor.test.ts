/**
 * Unit tests for the extension's pure CDP action executor
 * (extension/lib/executor.js). Drives executeAction() with a fake `cdp.send`
 * recorder — no chrome.* APIs involved — and asserts the exact CDP
 * methods/params emitted for every action in the closed allow-list from
 * lib/browser-control/protocol.ts, plus its error paths.
 */

import { describe, it, expect, vi } from 'vitest';
// extension/lib/executor.js is a plain ES module with zero chrome.* deps —
// importable directly by Vitest, same as any other .js module. Typed via the
// colocated extension/lib/executor.d.ts.
import { executeAction } from '../../extension/lib/executor.js';

type Call = { method: string; params: unknown };

/** A fake CDP transport: records every call, and lets each test script
 *  canned responses per method (in call order per-method). */
function makeFakeCdp(responses: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const cursors: Record<string, number> = {};
  const send = vi.fn(async (method: string, params: unknown) => {
    calls.push({ method, params });
    const queue = responses[method];
    if (!queue) {
      // Default fallback used by every test for the trailing page-info call.
      if (method === 'Runtime.evaluate') {
        const expr = (params as { expression?: string })?.expression ?? '';
        if (expr.includes('location.href')) {
          return { result: { value: { url: 'https://example.com/page', title: 'Example' } } };
        }
      }
      return {};
    }
    const i = cursors[method] ?? 0;
    cursors[method] = i + 1;
    return queue[Math.min(i, queue.length - 1)];
  });
  return { send, calls };
}

describe('extension executor — navigate', () => {
  it('sends Page.navigate with the target URL and reports success', async () => {
    const cdp = makeFakeCdp();
    const result = await executeAction({ type: 'navigate', url: 'https://example.com/' }, cdp);

    expect(cdp.calls[0]).toEqual({ method: 'Page.navigate', params: { url: 'https://example.com/' } });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('https://example.com/');
    expect(result.pageUrl).toBe('https://example.com/page');
    expect(result.pageTitle).toBe('Example');
  });

  it('reports failure when Page.navigate returns an errorText', async () => {
    const cdp = makeFakeCdp({ 'Page.navigate': [{ errorText: 'net::ERR_NAME_NOT_RESOLVED' }] });
    const result = await executeAction({ type: 'navigate', url: 'https://bad.invalid/' }, cdp);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
  });
});

describe('extension executor — click', () => {
  it('dispatches moved+pressed+released at explicit x/y', async () => {
    const cdp = makeFakeCdp();
    const result = await executeAction({ type: 'click', x: 100, y: 200 }, cdp);

    const mouseCalls = cdp.calls.filter((c) => c.method === 'Input.dispatchMouseEvent');
    expect(mouseCalls.map((c) => (c.params as { type: string }).type)).toEqual([
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
    ]);
    for (const c of mouseCalls) {
      expect(c.params).toMatchObject({ x: 100, y: 200 });
    }
    expect(result.ok).toBe(true);
  });

  it('resolves a selector to its bounding-box center when no x/y is given', async () => {
    const cdp = makeFakeCdp({
      'Runtime.evaluate': [{ result: { value: { x: 55, y: 65 } } }],
    });
    const result = await executeAction({ type: 'click', selector: '#submit' }, cdp);

    const evalCall = cdp.calls.find((c) => c.method === 'Runtime.evaluate');
    expect((evalCall!.params as { expression: string }).expression).toContain('"#submit"');
    const pressed = cdp.calls.find(
      (c) => c.method === 'Input.dispatchMouseEvent' && (c.params as { type: string }).type === 'mousePressed',
    );
    expect(pressed!.params).toMatchObject({ x: 55, y: 65 });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('#submit');
  });

  it('errors when the selector resolves to nothing, without dispatching mouse events', async () => {
    const cdp = makeFakeCdp({ 'Runtime.evaluate': [{ result: { value: null } }] });
    const result = await executeAction({ type: 'click', selector: '.missing' }, cdp);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('.missing');
    expect(cdp.calls.some((c) => c.method === 'Input.dispatchMouseEvent')).toBe(false);
  });

  it('errors when neither coordinates nor a selector are given', async () => {
    const cdp = makeFakeCdp();
    // Valid per ClickAction's schema (x/y/selector are all optional) — the
    // executor itself is responsible for rejecting this at runtime.
    const result = await executeAction({ type: 'click' }, cdp);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/x\/y|selector/);
  });
});

describe('extension executor — type', () => {
  it('emits Input.insertText with the given text', async () => {
    const cdp = makeFakeCdp();
    const result = await executeAction({ type: 'type', text: 'hello world' }, cdp);

    const insert = cdp.calls.find((c) => c.method === 'Input.insertText');
    expect(insert!.params).toEqual({ text: 'hello world' });
    expect(result.ok).toBe(true);
  });

  it('clicks the selector to focus it before inserting text', async () => {
    const cdp = makeFakeCdp({
      'Runtime.evaluate': [{ result: { value: { x: 10, y: 20 } } }],
    });
    await executeAction({ type: 'type', text: 'hi', selector: '#name' }, cdp);

    const methodOrder = cdp.calls.map((c) => c.method);
    expect(methodOrder.indexOf('Input.dispatchMouseEvent')).toBeGreaterThanOrEqual(0);
    expect(methodOrder.indexOf('Input.dispatchMouseEvent')).toBeLessThan(methodOrder.indexOf('Input.insertText'));
  });

  it('errors when the focus selector is not found and never inserts text', async () => {
    const cdp = makeFakeCdp({ 'Runtime.evaluate': [{ result: { value: null } }] });
    const result = await executeAction({ type: 'type', text: 'hi', selector: '#gone' }, cdp);

    expect(result.ok).toBe(false);
    expect(cdp.calls.some((c) => c.method === 'Input.insertText')).toBe(false);
  });
});

describe('extension executor — press', () => {
  it('dispatches rawKeyDown then keyUp for Enter with the char event in between', async () => {
    const cdp = makeFakeCdp();
    const result = await executeAction({ type: 'press', key: 'Enter' }, cdp);

    const keyCalls = cdp.calls.filter((c) => c.method === 'Input.dispatchKeyEvent');
    expect(keyCalls.map((c) => (c.params as { type: string }).type)).toEqual(['rawKeyDown', 'char', 'keyUp']);
    expect(keyCalls[0].params).toMatchObject({ key: 'Enter', windowsVirtualKeyCode: 13 });
    expect(result.ok).toBe(true);
  });

  it('dispatches rawKeyDown then keyUp (no char event) for non-printable keys like Tab', async () => {
    const cdp = makeFakeCdp();
    await executeAction({ type: 'press', key: 'Tab' }, cdp);

    const keyCalls = cdp.calls.filter((c) => c.method === 'Input.dispatchKeyEvent');
    expect(keyCalls.map((c) => (c.params as { type: string }).type)).toEqual(['rawKeyDown', 'keyUp']);
  });
});

describe('extension executor — scroll', () => {
  it('dispatches a mouseWheel event with the given dy when no selector is given', async () => {
    const cdp = makeFakeCdp();
    const result = await executeAction({ type: 'scroll', dy: 500 }, cdp);

    const wheel = cdp.calls.find((c) => c.method === 'Input.dispatchMouseEvent');
    expect(wheel!.params).toMatchObject({ type: 'mouseWheel', deltaY: 500 });
    expect(result.ok).toBe(true);
  });

  it('scrolls an element into view via Runtime.evaluate when toSelector is given', async () => {
    const cdp = makeFakeCdp({ 'Runtime.evaluate': [{ result: { value: true } }] });
    const result = await executeAction({ type: 'scroll', toSelector: '#footer' }, cdp);

    const evalCall = cdp.calls.find((c) => c.method === 'Runtime.evaluate');
    expect((evalCall!.params as { expression: string }).expression).toContain('scrollIntoView');
    expect(cdp.calls.some((c) => c.method === 'Input.dispatchMouseEvent')).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('errors when toSelector resolves to nothing', async () => {
    const cdp = makeFakeCdp({ 'Runtime.evaluate': [{ result: { value: false } }] });
    const result = await executeAction({ type: 'scroll', toSelector: '#missing' }, cdp);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('#missing');
  });
});

describe('extension executor — read_dom', () => {
  it('returns the page text and truncates to maxChars', async () => {
    const longText = 'x'.repeat(2000);
    const cdp = makeFakeCdp({
      'Runtime.evaluate': [{ result: { value: { text: longText, roles: [] } } }],
    });
    const result = await executeAction({ type: 'read_dom', maxChars: 500 }, cdp);

    expect(result.ok).toBe(true);
    expect(result.dom).toHaveLength(500);
  });

  it('appends an interactive-elements section built from roles', async () => {
    const cdp = makeFakeCdp({
      'Runtime.evaluate': [
        { result: { value: { text: 'Welcome', roles: ['button: Submit', 'a: Home'] } } },
      ],
    });
    const result = await executeAction({ type: 'read_dom', maxChars: 12000 }, cdp);

    expect(result.dom).toContain('Welcome');
    expect(result.dom).toContain('button: Submit');
    expect(result.dom).toContain('a: Home');
  });
});

describe('extension executor — screenshot', () => {
  it('returns a data URL built from the captured base64 frame', async () => {
    const cdp = makeFakeCdp({
      'Page.captureScreenshot': [{ data: 'ZmFrZWJhc2U2NA==' }],
    });
    const result = await executeAction({ type: 'screenshot' }, cdp);

    expect(cdp.calls[0]).toEqual({
      method: 'Page.captureScreenshot',
      params: { format: 'jpeg', quality: 60 },
    });
    expect(result.ok).toBe(true);
    expect(result.screenshot).toBe('data:image/jpeg;base64,ZmFrZWJhc2U2NA==');
  });

  it('errors when the capture returns no data', async () => {
    const cdp = makeFakeCdp({ 'Page.captureScreenshot': [{}] });
    const result = await executeAction({ type: 'screenshot' }, cdp);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('extension executor — wait', () => {
  it('waits via the injected sleep function instead of a real timer', async () => {
    const cdp = makeFakeCdp();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeAction({ type: 'wait', ms: 250 }, cdp, { sleep });

    expect(sleep).toHaveBeenCalledWith(250);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('250');
  });
});

describe('extension executor — unsupported action safety net', () => {
  it('never throws, and rejects anything outside the closed allow-list', async () => {
    const cdp = makeFakeCdp();
    // @ts-expect-error — deliberately outside BrowserActionInput's allow-list
    const result = await executeAction({ type: 'eval', code: 'alert(1)' }, cdp);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('eval');
  });

  it('catches a throwing cdp.send and returns an error result instead of throwing', async () => {
    const send = vi.fn().mockRejectedValue(new Error('debugger detached'));
    const result = await executeAction({ type: 'click', x: 1, y: 1 }, { send });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('debugger detached');
  });
});
