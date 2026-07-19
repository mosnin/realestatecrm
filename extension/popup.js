/**
 * Chippi Browser Control — popup UI logic.
 *
 * Talks to background.js exclusively via chrome.runtime.sendMessage; holds
 * no state of its own beyond what it reads from chrome.storage.local /
 * asks background for via 'chippi-get-status'.
 */

const DEFAULT_BASE_URL = 'https://www.usechippi.com';

const el = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  statusSub: document.getElementById('statusSub'),
  pairCard: document.getElementById('pairCard'),
  connectedCard: document.getElementById('connectedCard'),
  killedCard: document.getElementById('killedCard'),
  codeInput: document.getElementById('codeInput'),
  connectBtn: document.getElementById('connectBtn'),
  pairError: document.getElementById('pairError'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  saveBaseUrlBtn: document.getElementById('saveBaseUrlBtn'),
};

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function render(status) {
  el.baseUrlInput.value = status.baseUrl || DEFAULT_BASE_URL;

  if (!status.token) {
    el.statusDot.className = 'status-dot';
    el.statusText.textContent = 'Not connected';
    el.statusSub.textContent = 'Enter the pairing code shown in Chippi to connect this browser.';
    el.pairCard.style.display = '';
    el.connectedCard.style.display = 'none';
    el.killedCard.style.display = 'none';
    return;
  }

  if (status.killSwitchActive) {
    el.statusDot.className = 'status-dot killed';
    el.statusText.textContent = 'Stopped';
    el.statusSub.textContent = status.label ? `Connected as ${status.label}` : 'Connected';
    el.pairCard.style.display = 'none';
    el.connectedCard.style.display = '';
    el.killedCard.style.display = '';
    return;
  }

  el.statusDot.className = 'status-dot connected';
  el.statusText.textContent = status.label ? `Connected as ${status.label}` : 'Connected';
  el.statusSub.textContent = 'Chippi can drive this browser when a chat asks it to.';
  el.pairCard.style.display = 'none';
  el.connectedCard.style.display = '';
  el.killedCard.style.display = 'none';
}

async function refreshStatus() {
  try {
    const status = await sendMessage({ type: 'chippi-get-status' });
    render(status);
  } catch {
    el.statusText.textContent = 'Extension error';
    el.statusSub.textContent = 'Try reloading the extension from chrome://extensions.';
  }
}

el.connectBtn.addEventListener('click', async () => {
  const code = el.codeInput.value.trim().toUpperCase();
  el.pairError.style.display = 'none';
  if (code.length !== 8) {
    el.pairError.textContent = 'Enter the 8-character code shown in Chippi.';
    el.pairError.style.display = 'block';
    return;
  }
  el.connectBtn.disabled = true;
  el.connectBtn.textContent = 'Connecting…';
  try {
    const deviceLabel = navigator.userAgent.includes('Mac')
      ? 'Chrome on Mac'
      : navigator.userAgent.includes('Windows')
        ? 'Chrome on Windows'
        : 'Chrome';
    const res = await sendMessage({ type: 'chippi-pair', code, deviceLabel });
    if (!res.ok) throw new Error(res.error || 'Pairing failed');
    el.codeInput.value = '';
    await refreshStatus();
  } catch (err) {
    el.pairError.textContent = err.message || 'Pairing failed. Check the code and try again.';
    el.pairError.style.display = 'block';
  } finally {
    el.connectBtn.disabled = false;
    el.connectBtn.textContent = 'Connect';
  }
});

el.disconnectBtn.addEventListener('click', async () => {
  el.disconnectBtn.disabled = true;
  await sendMessage({ type: 'chippi-disconnect' });
  el.disconnectBtn.disabled = false;
  await refreshStatus();
});

el.resumeBtn.addEventListener('click', async () => {
  el.resumeBtn.disabled = true;
  await sendMessage({ type: 'chippi-resume' });
  el.resumeBtn.disabled = false;
  await refreshStatus();
});

el.saveBaseUrlBtn.addEventListener('click', async () => {
  const value = el.baseUrlInput.value.trim() || DEFAULT_BASE_URL;
  await sendMessage({ type: 'chippi-set-base-url', baseUrl: value });
  await refreshStatus();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'chippi-auth-invalid' || message?.type === 'chippi-kill-switch-engaged') {
    refreshStatus();
  }
});

refreshStatus();
