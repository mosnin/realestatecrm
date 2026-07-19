/**
 * Chippi Browser Control — content script.
 *
 * Injected into every top-level frame at document_start. Does NOTHING
 * visible until background.js tells it a session is active on this tab —
 * honest UI: the realtor only ever sees the banner/cursor/kill-switch while
 * Chippi is actually driving this tab, never speculatively.
 *
 * Renders three pieces of always-truthful state:
 *  1. A slim top banner: "Chippi is controlling this tab" + a live badge.
 *  2. An animated cursor-dot overlay that mirrors the CDP mouse events
 *     background.js is dispatching, so the realtor can see exactly what the
 *     agent is doing in real time.
 *  3. A floating kill-switch button (Chippi orange) that immediately tells
 *     background.js to detach the debugger and stop the loop.
 */

(() => {
  if (window.top !== window) return; // top frame only (manifest also enforces this)
  if (window.__chippiBrowserControlInjected) return;
  window.__chippiBrowserControlInjected = true;

  const BRAND_ORANGE = '#F25A00';
  const ROOT_ID = 'chippi-browser-control-root';

  let root = null;
  let banner = null;
  let cursor = null;
  let killButton = null;
  let active = false;

  function ensureUi() {
    if (root) return;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.all = 'initial';

    banner = document.createElement('div');
    Object.assign(banner.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '2147483647',
      background: BRAND_ORANGE,
      color: '#fff',
      font: '600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '8px 16px',
      textAlign: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
      display: 'none',
      pointerEvents: 'none',
    });
    banner.textContent = 'Chippi is controlling this tab';

    cursor = document.createElement('div');
    Object.assign(cursor.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '18px',
      height: '18px',
      marginLeft: '-9px',
      marginTop: '-9px',
      borderRadius: '50%',
      background: 'rgba(242, 90, 0, 0.55)',
      border: '2px solid ' + BRAND_ORANGE,
      boxShadow: '0 0 0 rgba(242,90,0,0.5)',
      zIndex: '2147483647',
      pointerEvents: 'none',
      display: 'none',
      transition: 'left 120ms ease, top 120ms ease, transform 120ms ease',
    });

    killButton = document.createElement('button');
    killButton.type = 'button';
    killButton.textContent = 'Stop Chippi';
    Object.assign(killButton.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      background: BRAND_ORANGE,
      color: '#fff',
      border: 'none',
      borderRadius: '999px',
      padding: '10px 18px',
      font: '700 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      cursor: 'pointer',
      display: 'none',
    });
    killButton.addEventListener('click', () => {
      killButton.disabled = true;
      killButton.textContent = 'Stopping…';
      chrome.runtime.sendMessage({ type: 'chippi-kill-switch' });
    });

    root.appendChild(banner);
    root.appendChild(cursor);
    root.appendChild(killButton);
    (document.body || document.documentElement).appendChild(root);
  }

  function setActive(next) {
    active = next;
    ensureUi();
    const display = active ? '' : 'none';
    banner.style.display = active ? 'block' : 'none';
    cursor.style.display = active ? 'block' : 'none';
    killButton.style.display = active ? 'block' : 'none';
    killButton.disabled = false;
    killButton.textContent = 'Stop Chippi';
    void display;
  }

  function moveCursor(x, y, pulse) {
    ensureUi();
    if (!active) return;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    if (pulse) {
      cursor.style.transform = 'scale(1.6)';
      setTimeout(() => {
        cursor.style.transform = 'scale(1)';
      }, 140);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'chippi-session-start':
        setActive(true);
        sendResponse({ ok: true });
        return;
      case 'chippi-session-stop':
        setActive(false);
        sendResponse({ ok: true });
        return;
      case 'chippi-cursor': {
        const ev = message.event || {};
        if (typeof ev.x === 'number' && typeof ev.y === 'number') {
          moveCursor(ev.x, ev.y, ev.type === 'mousePressed');
        }
        sendResponse({ ok: true });
        return;
      }
      default:
        return undefined;
    }
  });

  // If the page navigates within the same document (SPA route change) the
  // banner/cursor/button persist automatically since we never rebuild them
  // on our own — only background.js's explicit start/stop messages do.
  if (document.body) ensureUi();
  else document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
})();
