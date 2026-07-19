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
 * Also runs a throttled SCREENCAST while a session is pinned to a tab: a
 * small low-quality JPEG frame captured on a ~1.5s timer (plus once right
 * after every action) rides along on the next poll as `PollBody.frame` so
 * the Chippi oversight panel can show the user what the agent sees. And when
 * the in-page kill switch fires, the very next poll carries
 * `PollBody.killed = true` so the SERVER ends the session too — not just the
 * local loop — before the extension detaches.
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
const SCREENCAST_INTERVAL_MS = 1500;
const SCREENCAST_QUALITY = 40;

// In-memory only — a fresh service worker instance always starts with these,
// and re-derives everything else from chrome.storage.local, which is the
// durable source of truth across service-worker restarts.
let loopRunning = false;
let pendingCompleted = null; // { actionId, result } queued for the next poll
let killedPending = false; // user hit the kill switch — report it on the next poll

// ── screencast (throttled live frame capture) ───────────────────────────────
// In-memory only, scoped to the currently pinned tab. Never runs without a
// pinned session tab — started when one is pinned, stopped the moment it
// isn't (session end, kill switch, tab lost, loop exit).
const screencast = {
  tabId: null,
  timerId: null,
  captureInFlight: false,
  latestFrame: null, // LiveFrame-shaped: { image, pageUrl, pageTitle }
};

function stopScreencast() {
  if (screencast.timerId != null) {
    clearInterval(screencast.timerId);
  }
  screencast.tabId = null;
  screencast.timerId = null;
  screencast.captureInFlight = false;
  screencast.latestFrame = null;
}

async function captureScreencastFrame() {
  const tabId = screencast.tabId;
  if (tabId == null) return; // no pinned session tab — never capture
  if (screencast.captureInFlight) return; // previous capture still running — skip, no pile-up
  screencast.captureInFlight = true;
  try {
    const res = await sendCdpCommand(tabId, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: SCREENCAST_QUALITY,
    });
    if (!res || !res.data) return;
    let pageUrl;
    let pageTitle;
    try {
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (t) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(t);
        });
      });
      pageUrl = tab && tab.url;
      pageTitle = tab && tab.title;
    } catch {
      // Tab may have been closed mid-capture — frame is still useful without
      // the url/title, so keep it rather than discarding.
    }
    // Only overwrite if we're still pinned to this same tab — a session
    // change/stop that raced this capture must not resurrect a stale frame.
    if (screencast.tabId === tabId) {
      screencast.latestFrame = {
        image: `data:image/jpeg;base64,${res.data}`,
        pageUrl,
        pageTitle,
      };
    }
  } catch {
    // Debugger detached / tab gone mid-capture — just skip this frame.
  } finally {
    screencast.captureInFlight = false;
  }
}

function startScreencast(tabId) {
  if (screencast.tabId === tabId && screencast.timerId != null) return; // already running for this tab
  stopScreencast();
  screencast.tabId = tabId;
  screencast.timerId = setInterval(captureScreencastFrame, SCREENCAST_INTERVAL_MS);
  // Kick one off immediately rather than waiting a full interval for the
  // first frame.
  captureScreencastFrame();
}

/** Takes (without clearing) the current live frame for a poll body — the
 *  frame is a continuous "here's roughly what the tab looks like now" signal,
 *  not a one-shot event, so repeating it on a poll where nothing new was
 *  captured yet is harmless. */
function takeFrameForPoll() {
  return screencast.latestFrame || undefined;
}

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
  // Report the kill to the SERVER too, not just the local loop — the very
  // next poll (woken immediately below, even if the loop is mid idle-sleep)
  // carries PollBody.killed = true so the server ends the session and stops
  // handing out further actions, instead of only the extension going quiet.
  killedPending = true;
  await setStorage({ killSwitchActive: true });
  stopScreencast();
  if (tabId) {
    await detachDebugger(tabId);
    await setSessionUiActive(tabId, false);
  }
  wakeLoop();
  notifyPopup({ type: 'chippi-kill-switch-engaged' });
}

// ── poll loop ────────────────────────────────────────────────────────────

async function postPoll(baseUrl, token, sessionId) {
  const killed = killedPending;
  const body = {
    sessionId: sessionId || undefined,
    completed: pendingCompleted || undefined,
    frame: takeFrameForPoll(),
    killed: killed || undefined,
  };
  const res = await fetch(`${baseUrl}/api/browser-control/poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  pendingCompleted = null;
  // Only clear once the POST actually went out carrying it — a failed
  // request (network error, non-2xx) must retry with killed still pending
  // rather than silently dropping the kill signal.
  if (killed && res.ok) killedPending = false;
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

// A sleep that a concurrent event (the kill switch firing) can cut short, so
// "the very next poll" after a kill is genuinely immediate rather than
// waiting out whatever idle/error delay the loop happened to be in.
let wakeSleepEarly = null;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeSleepEarly = null;
      resolve();
    }, ms);
    wakeSleepEarly = () => {
      clearTimeout(timer);
      wakeSleepEarly = null;
      resolve();
    };
  });
}

function wakeLoop() {
  if (wakeSleepEarly) wakeSleepEarly();
}

async function runPollLoop() {
  if (loopRunning) return;
  loopRunning = true;
  let currentTabId = null;
  try {
    while (loopRunning) {
      const { baseUrl, token, sessionId, killSwitchActive } = await getConfig();
      if (!token) break;
      // Don't break on a still-active kill switch until we've actually
      // reported it (killedPending) to the server on a poll — otherwise the
      // server never learns the session was user-killed.
      if (killSwitchActive && !killedPending) break;

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

      if (killSwitchActive) {
        // Just reported killed=true above (the debugger was already detached
        // by activateKillSwitch()) — nothing left to do locally.
        break;
      }

      if (poll.stop) {
        stopScreencast();
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
          stopScreencast();
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
          startScreencast(currentTabId);
        } else if (!(await tabExists(currentTabId))) {
          // The pinned tab was closed mid-session — fail honestly instead of
          // hopping to whatever is focused now. Clearing the pin lets a
          // subsequent action re-pin to the user's current tab intentionally.
          currentTabId = null;
          stopScreencast();
          await setStorage({ activeTabId: null });
          throw new Error('The tab Chippi was controlling was closed. Re-issue the action to control the current tab.');
        }
        const cdp = makeCdp(currentTabId);
        result = await executeAction(input, cdp);
      } catch (err) {
        result = { ok: false, error: err && err.message ? err.message : String(err) };
      }

      pendingCompleted = { actionId, result };
      // One extra frame right after every action, in addition to the ~1.5s
      // timer — fire-and-forget so a slow capture never delays the next
      // poll; captureScreencastFrame()'s own in-flight guard prevents
      // pile-up against the timer's own ticks.
      captureScreencastFrame().catch(() => {});
    }
  } finally {
    loopRunning = false;
    stopScreencast();
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
  stopScreencast();
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
    // The tab we were screencasting just lost its debugger — no more
    // captures are possible until (if ever) a session re-pins it.
    if (screencast.tabId === source.tabId) stopScreencast();
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
