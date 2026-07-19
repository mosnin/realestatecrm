/**
 * Chippi Browser Control — background service worker.
 *
 * Owns the control loop: once paired, long-polls the Chippi server for the
 * next queued browser-control action, executes it against the active tab via
 * chrome.debugger (CDP), and posts the result back on the following poll.
 * Mirrors every CDP mouse event to the content script so the visible cursor
 * overlay tracks what's actually happening, and stops immediately on the
 * user's kill switch, a server-issued `stop`, a 401 (token revoked), or the
 * debugger detaching (e.g. the user closed the "cancel debugging" banner).
 *
 * Server contract this file assumes (owned by the server track, not this
 * file — see extension/README.md "Server contract assumptions"):
 *   POST {baseUrl}/api/browser-control/pair/redeem  RedeemPairingBody -> { token, label }
 *   POST {baseUrl}/api/browser-control/poll         PollBody (Bearer token) -> PollResponse
 */

import { executeAction } from './lib/executor.js';

const DEFAULT_BASE_URL = 'https://www.usechippi.com';
const IDLE_POLL_DELAY_MS = 1500;
const ERROR_POLL_DELAY_MS = 4000;
const HEARTBEAT_ALARM = 'chippi-poll-heartbeat';
const CDP_PROTOCOL_VERSION = '1.3';

// In-memory only — a fresh service worker instance always starts with these,
// and re-derives everything else from chrome.storage.local, which is the
// durable source of truth across service-worker restarts.
let loopRunning = false;
let pendingCompleted = null; // { actionId, result } queued for the next poll

// ── storage helpers ─────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

async function getConfig() {
  const stored = await getStorage([
    'baseUrl',
    'token',
    'sessionId',
    'killSwitchActive',
    'label',
  ]);
  return {
    baseUrl: stored.baseUrl || DEFAULT_BASE_URL,
    token: stored.token || null,
    sessionId: stored.sessionId || null,
    killSwitchActive: !!stored.killSwitchActive,
    label: stored.label || null,
  };
}

// ── popup notifications ─────────────────────────────────────────────────────

function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No popup open to receive it — fine, storage is the source of truth.
  });
}

// ── debugger (CDP) plumbing ─────────────────────────────────────────────────

async function getTargetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab to control');
  return tab;
}

function tabExists(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, CDP_PROTOCOL_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err && !/already attached/i.test(err.message || '')) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function detachDebugger(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError; // ignore — may already be detached
      resolve();
    });
  });
}

function sendCdpCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`${method}: ${err.message}`));
        return;
      }
      resolve(result);
    });
  });
}

/** Builds the injected `cdp.send` used by executeAction, mirroring mouse
 *  events to the visible cursor overlay drawn by content-script.js. */
function makeCdp(tabId) {
  return {
    async send(method, params) {
      const result = await sendCdpCommand(tabId, method, params);
      if (method === 'Input.dispatchMouseEvent') {
        chrome.tabs
          .sendMessage(tabId, { type: 'chippi-cursor', event: params })
          .catch(() => {});
      }
      return result;
    },
  };
}

async function setSessionUiActive(tabId, active) {
  await chrome.tabs
    .sendMessage(tabId, { type: active ? 'chippi-session-start' : 'chippi-session-stop' })
    .catch(() => {});
}

// ── kill switch ──────────────────────────────────────────────────────────

async function activateKillSwitch(tabId) {
  await setStorage({ killSwitchActive: true });
  if (tabId) {
    await detachDebugger(tabId);
    await setSessionUiActive(tabId, false);
  }
  notifyPopup({ type: 'chippi-kill-switch-engaged' });
}

// ── poll loop ────────────────────────────────────────────────────────────

async function postPoll(baseUrl, token, sessionId) {
  const body = { sessionId: sessionId || undefined, completed: pendingCompleted || undefined };
  const res = await fetch(`${baseUrl}/api/browser-control/poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  pendingCompleted = null;
  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Poll failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function handleTokenInvalid() {
  await setStorage({ token: null, sessionId: null, label: null, killSwitchActive: false });
  loopRunning = false;
  notifyPopup({ type: 'chippi-auth-invalid' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPollLoop() {
  if (loopRunning) return;
  loopRunning = true;
  let currentTabId = null;
  try {
    while (loopRunning) {
      const { baseUrl, token, sessionId, killSwitchActive } = await getConfig();
      if (!token) break;
      if (killSwitchActive) break;

      let poll;
      try {
        poll = await postPoll(baseUrl, token, sessionId);
      } catch (err) {
        if (err.status === 401) {
          await handleTokenInvalid();
          break;
        }
        await sleep(ERROR_POLL_DELAY_MS);
        continue;
      }

      if (poll.stop) {
        if (currentTabId) {
          await detachDebugger(currentTabId);
          await setSessionUiActive(currentTabId, false);
        }
        await setStorage({ sessionId: null, activeTabId: null });
        break;
      }

      if (!poll.action) {
        await sleep(IDLE_POLL_DELAY_MS);
        continue;
      }

      const { id: actionId, sessionId: newSessionId, input } = poll.action;
      if (newSessionId && newSessionId !== sessionId) {
        // A new session must re-pin its own tab — tear down the previous one's
        // debugger + banner so no abandoned tab is left in the "controlling"
        // state, then forget the pin so the block below re-pins.
        if (currentTabId != null) {
          await detachDebugger(currentTabId);
          await setSessionUiActive(currentTabId, false);
          currentTabId = null;
        }
        await setStorage({ sessionId: newSessionId, activeTabId: null });
      }

      let result;
      try {
        // Pin the target tab ONCE per session: the tab focused when the
        // session's FIRST action arrives. Every later action drives that SAME
        // tab, so a mid-session focus change can never silently redirect CDP
        // onto an unintended tab (security-review fix). Resumes onto the same
        // tab across MV3 service-worker restarts via stored activeTabId; if
        // that tab was closed, re-pins to the current active tab.
        if (currentTabId == null) {
          const cfg = await getConfig();
          let pinned = cfg.activeTabId;
          if (pinned != null && !(await tabExists(pinned))) pinned = null;
          if (pinned == null) pinned = (await getTargetTab()).id;
          currentTabId = pinned;
          await setStorage({ activeTabId: currentTabId });
          await attachDebugger(currentTabId);
          await setSessionUiActive(currentTabId, true);
        } else if (!(await tabExists(currentTabId))) {
          // The pinned tab was closed mid-session — fail honestly instead of
          // hopping to whatever is focused now. Clearing the pin lets a
          // subsequent action re-pin to the user's current tab intentionally.
          currentTabId = null;
          await setStorage({ activeTabId: null });
          throw new Error('The tab Chippi was controlling was closed. Re-issue the action to control the current tab.');
        }
        const cdp = makeCdp(currentTabId);
        result = await executeAction(input, cdp);
      } catch (err) {
        result = { ok: false, error: err && err.message ? err.message : String(err) };
      }

      pendingCompleted = { actionId, result };
    }
  } finally {
    loopRunning = false;
  }
}

function kickPollLoop() {
  runPollLoop().catch(() => {
    loopRunning = false;
  });
}

// ── pairing ──────────────────────────────────────────────────────────────

async function redeemPairingCode(code, deviceLabel) {
  const { baseUrl } = await getConfig();
  const res = await fetch(`${baseUrl}/api/browser-control/pair/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceLabel }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Pairing failed (${res.status})`);
  }
  const data = await res.json();
  await setStorage({
    token: data.token,
    label: data.label || deviceLabel || null,
    sessionId: null,
    killSwitchActive: false,
  });
  kickPollLoop();
  return data;
}

async function disconnect() {
  loopRunning = false;
  const { activeTabId } = await getStorage(['activeTabId']);
  if (activeTabId) {
    await detachDebugger(activeTabId);
    await setSessionUiActive(activeTabId, false);
  }
  await setStorage({ token: null, sessionId: null, label: null, killSwitchActive: false });
}

// ── message routing ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'chippi-pair': {
        try {
          const data = await redeemPairingCode(message.code, message.deviceLabel);
          sendResponse({ ok: true, label: data.label });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return;
      }
      case 'chippi-disconnect': {
        await disconnect();
        sendResponse({ ok: true });
        return;
      }
      case 'chippi-resume': {
        await setStorage({ killSwitchActive: false });
        kickPollLoop();
        sendResponse({ ok: true });
        return;
      }
      case 'chippi-set-base-url': {
        await setStorage({ baseUrl: message.baseUrl });
        sendResponse({ ok: true });
        return;
      }
      case 'chippi-get-status': {
        const cfg = await getConfig();
        sendResponse({ ok: true, ...cfg, loopRunning });
        return;
      }
      case 'chippi-kill-switch': {
        // Sent from content-script.js's floating kill-switch button.
        await activateKillSwitch(sender.tab && sender.tab.id);
        sendResponse({ ok: true });
        return;
      }
      default:
        sendResponse({ ok: false, error: 'Unknown message' });
    }
  })();
  return true; // keep the message channel open for the async response
});

// If the debugger detaches for any reason (user dismissed the "this page is
// being debugged" banner, tab closed, etc.) treat it as an immediate stop —
// never keep silently trying to drive a tab we've lost control of.
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    setSessionUiActive(source.tabId, false).catch(() => {});
  }
});

// Service workers are ephemeral: resume the loop on every wake if we should
// still be paired-and-active, and use a periodic alarm as a heartbeat in
// case the worker was killed mid-loop without an event to wake it.
chrome.runtime.onStartup.addListener(() => {
  getConfig().then((cfg) => {
    if (cfg.token && !cfg.killSwitchActive) kickPollLoop();
  });
});
chrome.runtime.onInstalled.addListener(() => {
  getStorage(['baseUrl']).then((s) => {
    if (!s.baseUrl) setStorage({ baseUrl: DEFAULT_BASE_URL });
  });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.4 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return;
  getConfig().then((cfg) => {
    if (cfg.token && !cfg.killSwitchActive && !loopRunning) kickPollLoop();
  });
});
