/**
 * Pure CDP action executor — the ONLY place browser-control actions turn into
 * Chrome DevTools Protocol commands. Implements exactly the closed allow-list
 * from lib/browser-control/protocol.ts (BrowserActionInput): navigate, click,
 * type, press, scroll, read_dom, screenshot, wait. There is deliberately no
 * "run arbitrary JS" action — Runtime.evaluate is used only internally, with
 * fixed, non-attacker-controlled expressions (selector strings are passed as
 * JSON-encoded literals, never interpolated as code).
 *
 * `executeAction(action, cdp, opts)` takes an injected `cdp` object shaped
 * `{ send(method, params): Promise<result> }` so this file has zero
 * dependency on `chrome.*` and is unit-testable in plain Node (see
 * tests/lib/extension-executor.test.ts). background.js is the only caller
 * that wires `cdp` to the real chrome.debugger APIs.
 *
 * Every branch returns a BrowserActionResult-shaped plain object:
 *   { ok, summary?, dom?, screenshot?, pageUrl?, pageTitle?, error? }
 */

// Keys the `press` action is allowed to send (mirrors PressAction's z.enum in
// protocol.ts exactly — do not widen without widening the contract first).
const KEY_MAP = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
};

const DEFAULT_SCROLL_DY = 400;
const DEFAULT_WHEEL_X = 400;
const DEFAULT_WHEEL_Y = 300;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Evaluate a fixed expression and return its JS value (or null on error). */
async function evaluateValue(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  if (res && res.exceptionDetails) return null;
  return res && res.result ? res.result.value : null;
}

/** Resolve a CSS selector to the viewport-space center of its bounding box. */
async function resolveCenter(cdp, selector) {
  const expr =
    '(() => { const el = document.querySelector(' +
    JSON.stringify(selector) +
    '); if (!el) return null; const r = el.getBoundingClientRect(); ' +
    'return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()';
  return evaluateValue(cdp, expr);
}

async function dispatchClick(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

async function doNavigate(action, cdp) {
  const res = await cdp.send('Page.navigate', { url: action.url });
  if (res && res.errorText) {
    return { ok: false, error: `Navigation failed: ${res.errorText}` };
  }
  return { ok: true, summary: `Navigated to ${action.url}` };
}

async function doClick(action, cdp) {
  let x = action.x;
  let y = action.y;
  if ((x === undefined || y === undefined) && action.selector) {
    const center = await resolveCenter(cdp, action.selector);
    if (!center) {
      return { ok: false, error: `Element not found: ${action.selector}` };
    }
    x = center.x;
    y = center.y;
  }
  if (x === undefined || y === undefined) {
    return { ok: false, error: 'click requires x/y coordinates or a selector' };
  }
  await dispatchClick(cdp, x, y);
  return {
    ok: true,
    summary: action.selector
      ? `Clicked "${action.selector}" at (${Math.round(x)}, ${Math.round(y)})`
      : `Clicked at (${Math.round(x)}, ${Math.round(y)})`,
  };
}

async function doType(action, cdp) {
  if (action.selector) {
    const center = await resolveCenter(cdp, action.selector);
    if (!center) {
      return { ok: false, error: `Element not found: ${action.selector}` };
    }
    await dispatchClick(cdp, center.x, center.y);
  }
  await cdp.send('Input.insertText', { text: action.text });
  const preview = action.text.length > 40 ? `${action.text.slice(0, 40)}…` : action.text;
  return { ok: true, summary: `Typed "${preview}"` };
}

async function doPress(action, cdp) {
  const mapped = KEY_MAP[action.key];
  if (!mapped) {
    return { ok: false, error: `Unsupported key: ${action.key}` };
  }
  const base = {
    key: mapped.key,
    code: mapped.code,
    windowsVirtualKeyCode: mapped.windowsVirtualKeyCode,
    nativeVirtualKeyCode: mapped.windowsVirtualKeyCode,
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (mapped.text) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: mapped.text, ...base });
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  return { ok: true, summary: `Pressed ${action.key}` };
}

async function doScroll(action, cdp) {
  if (action.toSelector) {
    const expr =
      '(() => { const el = document.querySelector(' +
      JSON.stringify(action.toSelector) +
      '); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()';
    const found = await evaluateValue(cdp, expr);
    if (!found) {
      return { ok: false, error: `Element not found: ${action.toSelector}` };
    }
    return { ok: true, summary: `Scrolled to "${action.toSelector}"` };
  }
  const dy = action.dy ?? DEFAULT_SCROLL_DY;
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: DEFAULT_WHEEL_X,
    y: DEFAULT_WHEEL_Y,
    deltaX: 0,
    deltaY: dy,
  });
  return { ok: true, summary: `Scrolled by ${dy}px` };
}

async function doReadDom(action, cdp) {
  const expr =
    '(() => { ' +
    'const text = document.body ? document.body.innerText : ""; ' +
    'const nodes = Array.from(document.querySelectorAll(' +
    '"[role], button, a, input, select, textarea, [aria-label]"' +
    ')).slice(0, 80); ' +
    'const roles = nodes.map((el) => { ' +
    'const role = el.getAttribute("role") || el.tagName.toLowerCase(); ' +
    'const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("value") || "").trim().slice(0, 60); ' +
    'return name ? `${role}: ${name}` : role; ' +
    '}); ' +
    'return { text, roles }; })()';
  const value = (await evaluateValue(cdp, expr)) || { text: '', roles: [] };
  const rolesBlock = value.roles && value.roles.length
    ? `\n\n[interactive elements]\n${value.roles.join('\n')}`
    : '';
  const full = `${value.text || ''}${rolesBlock}`;
  const dom = full.length > action.maxChars ? full.slice(0, action.maxChars) : full;
  return { ok: true, summary: `Read page (${dom.length} chars)`, dom };
}

async function doScreenshot(action, cdp) {
  const res = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 60,
  });
  if (!res || !res.data) {
    return { ok: false, error: 'Screenshot capture returned no data' };
  }
  return {
    ok: true,
    summary: 'Captured screenshot',
    screenshot: `data:image/jpeg;base64,${res.data}`,
  };
}

async function doWait(action, sleep) {
  await sleep(action.ms);
  return { ok: true, summary: `Waited ${action.ms}ms` };
}

async function safeGetPageInfo(cdp) {
  const value = await evaluateValue(
    cdp,
    '({ url: location.href, title: document.title })',
  ).catch(() => null);
  if (!value) return {};
  return { pageUrl: value.url, pageTitle: value.title };
}

/**
 * Execute one BrowserActionInput against an injected CDP `send` function.
 * Never throws — all failures resolve to `{ ok: false, error }`.
 */
export async function executeAction(action, cdp, opts = {}) {
  const sleep = opts.sleep || defaultSleep;
  let result;
  try {
    switch (action.type) {
      case 'navigate':
        result = await doNavigate(action, cdp);
        break;
      case 'click':
        result = await doClick(action, cdp);
        break;
      case 'type':
        result = await doType(action, cdp);
        break;
      case 'press':
        result = await doPress(action, cdp);
        break;
      case 'scroll':
        result = await doScroll(action, cdp);
        break;
      case 'read_dom':
        result = await doReadDom(action, cdp);
        break;
      case 'screenshot':
        result = await doScreenshot(action, cdp);
        break;
      case 'wait':
        result = await doWait(action, sleep);
        break;
      default:
        return { ok: false, error: `Unsupported action type: ${action.type}` };
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }

  const info = await safeGetPageInfo(cdp);
  return { ...result, ...info };
}

export const __internal = { KEY_MAP, resolveCenter, evaluateValue };
