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

// Bounded waits below are expressed as (timeoutMs, intervalMs) but enforced
// by an ATTEMPT COUNT (timeoutMs / intervalMs), not wall-clock time, so they
// stay deterministic and fast under an injected fake `sleep` in tests — real
// Chrome still gets the intended ~8s / ~3s ceilings since its `sleep` is a
// real setTimeout.
const NAVIGATE_LOAD_TIMEOUT_MS = 8_000;
const NAVIGATE_POLL_INTERVAL_MS = 200;
const VISIBILITY_WAIT_TIMEOUT_MS = 3_000;
const VISIBILITY_POLL_INTERVAL_MS = 150;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `checkFn` (assumed to resolve a boolean) until it's truthy or a
 *  bounded number of attempts is exhausted. Attempt-count bounded rather than
 *  Date.now()-bounded on purpose: an injected fake `sleep` that resolves
 *  instantly (as tests use) still terminates promptly instead of spinning
 *  for the real wall-clock timeout. Never throws. */
async function pollUntil(sleep, checkFn, timeoutMs, intervalMs) {
  const maxAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let attempts = 0;
  let result = await checkFn().catch(() => false);
  while (!result && attempts < maxAttempts) {
    await sleep(intervalMs);
    attempts += 1;
    result = await checkFn().catch(() => false);
  }
  return !!result;
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

/** Resolve a CSS selector to the viewport-space center of its bounding box.
 *  Returns null when the selector matches nothing OR matches an element with
 *  zero area (e.g. display:none) — callers distinguish "not found" from
 *  "found but not interactable" via scrollSelectorIntoView first. */
async function resolveCenter(cdp, selector) {
  const expr =
    '(() => { const el = document.querySelector(' +
    JSON.stringify(selector) +
    '); if (!el) return null; const r = el.getBoundingClientRect(); ' +
    'if (r.width <= 0 || r.height <= 0) return null; ' +
    'return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()';
  return evaluateValue(cdp, expr);
}

/** Scrolls a selector's element into view (real pages routinely render the
 *  target off the current viewport). Returns false when the selector matches
 *  nothing at all — the "not found" case, distinct from "found but hidden". */
async function scrollSelectorIntoView(cdp, selector) {
  const expr =
    '(() => { const el = document.querySelector(' +
    JSON.stringify(selector) +
    '); if (!el) return false; ' +
    'if (typeof el.scrollIntoViewIfNeeded === "function") { el.scrollIntoViewIfNeeded(); } ' +
    'else { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } ' +
    'return true; })()';
  return evaluateValue(cdp, expr);
}

/** Whether a selector currently resolves to a non-zero-area, non-hidden
 *  element. Used for the bounded post-scroll visibility wait before click. */
async function isSelectorVisible(cdp, selector) {
  const expr =
    '(() => { const el = document.querySelector(' +
    JSON.stringify(selector) +
    '); if (!el) return false; const r = el.getBoundingClientRect(); ' +
    'if (r.width <= 0 || r.height <= 0) return false; ' +
    'const style = window.getComputedStyle(el); ' +
    'return style.visibility !== "hidden" && style.display !== "none"; })()';
  return evaluateValue(cdp, expr);
}

/**
 * Resolve a selector to a clickable/typeable center point, robust against
 * real pages: scrolls the element into view first, re-reads the bounding box
 * post-scroll (so coordinates reflect where the element actually ended up,
 * not its pre-scroll position), and — for click — waits (bounded) for it to
 * become visible before handing back coordinates. Returns an ACTIONABLE error
 * distinguishing "selector matches nothing" from "matches something with no
 * visible area", instead of a bare "not found".
 */
async function resolveInteractableCenter(cdp, selector, { sleep, waitVisible } = {}) {
  const found = await scrollSelectorIntoView(cdp, selector);
  if (!found) {
    return {
      center: null,
      error: `No element matches selector "${selector}" — check the selector against the page's current DOM (try read_dom) before retrying.`,
    };
  }
  if (waitVisible && sleep) {
    await pollUntil(
      sleep,
      () => isSelectorVisible(cdp, selector),
      VISIBILITY_WAIT_TIMEOUT_MS,
      VISIBILITY_POLL_INTERVAL_MS,
    );
  }
  const center = await resolveCenter(cdp, selector);
  if (!center) {
    return {
      center: null,
      error: `Element "${selector}" was found but has no visible size — it may be hidden, collapsed, or covered by another element.`,
    };
  }
  return { center, error: null };
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

async function doNavigate(action, cdp, sleep) {
  const res = await cdp.send('Page.navigate', { url: action.url });
  if (res && res.errorText) {
    return { ok: false, error: `Navigation failed: ${res.errorText}` };
  }
  // Wait for the new document to finish loading (bounded) so a following
  // action never races an unloaded/mid-navigation page.
  const loaded = await pollUntil(
    sleep,
    () => evaluateValue(cdp, 'document.readyState').then((v) => v === 'complete'),
    NAVIGATE_LOAD_TIMEOUT_MS,
    NAVIGATE_POLL_INTERVAL_MS,
  );
  return {
    ok: true,
    summary: loaded
      ? `Navigated to ${action.url}`
      : `Navigated to ${action.url} (page was still loading after ${Math.round(NAVIGATE_LOAD_TIMEOUT_MS / 1000)}s — proceeding anyway)`,
  };
}

async function doClick(action, cdp, sleep) {
  let x = action.x;
  let y = action.y;
  if ((x === undefined || y === undefined) && action.selector) {
    const { center, error } = await resolveInteractableCenter(cdp, action.selector, {
      sleep,
      waitVisible: true,
    });
    if (!center) {
      return { ok: false, error };
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

async function doType(action, cdp, sleep) {
  if (action.selector) {
    const { center, error } = await resolveInteractableCenter(cdp, action.selector, {
      sleep,
      waitVisible: false,
    });
    if (!center) {
      return { ok: false, error };
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

// document.querySelectorAll target for read_dom's interactive-element scan.
// [tabindex] catches custom interactive widgets (div role-less but
// keyboard-focusable) that real component libraries emit constantly.
const READ_DOM_SELECTOR = '[role], button, a, input, select, textarea, [aria-label], [tabindex]';

async function doReadDom(action, cdp) {
  const expr =
    '(() => { ' +
    'const text = document.body ? document.body.innerText : ""; ' +
    'const isVisible = (el) => { ' +
    'const r = el.getBoundingClientRect(); ' +
    'if (r.width <= 0 || r.height <= 0) return false; ' +
    'const style = window.getComputedStyle(el); ' +
    'return style.visibility !== "hidden" && style.display !== "none"; }; ' +
    'const labelFor = (el) => { ' +
    'if (el.labels && el.labels.length) { ' +
    'return Array.from(el.labels).map((l) => (l.innerText || "").trim()).filter(Boolean).join(" "); } ' +
    'return ""; }; ' +
    'const nodes = Array.from(document.querySelectorAll(' +
    JSON.stringify(READ_DOM_SELECTOR) +
    ')).filter(isVisible).slice(0, 80); ' +
    'const roles = nodes.map((el) => { ' +
    'const explicitRole = el.getAttribute("role"); ' +
    'const isLink = el.tagName === "A"; ' +
    'const hasHref = isLink && el.hasAttribute("href"); ' +
    // "href-less interactive roles": a role-bearing (or tabindex-bearing)
    // element that ISN'T a real navigable link — the agent needs to know
    // these are click targets, not URLs it can just fetch.
    'const kind = explicitRole || (isLink && !hasHref ? "link (no href — interactive)" : el.tagName.toLowerCase()); ' +
    'const name = (labelFor(el) || el.getAttribute("aria-label") || (el.innerText || "").trim() || el.getAttribute("placeholder") || el.getAttribute("value") || "").trim().slice(0, 60); ' +
    'return name ? `${kind}: ${name}` : kind; ' +
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
        result = await doNavigate(action, cdp, sleep);
        break;
      case 'click':
        result = await doClick(action, cdp, sleep);
        break;
      case 'type':
        result = await doType(action, cdp, sleep);
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

  // Every branch — including navigate, which has already waited for the new
  // document to load above — reports the page it ends on so the agent keeps
  // its bearings, reflecting the FINAL post-action state, not a stale one.
  const info = await safeGetPageInfo(cdp);
  return { ...result, ...info };
}

export const __internal = {
  KEY_MAP,
  resolveCenter,
  evaluateValue,
  pollUntil,
  scrollSelectorIntoView,
  isSelectorVisible,
  resolveInteractableCenter,
};
