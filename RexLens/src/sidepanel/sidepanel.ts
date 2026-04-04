import type { ScanResult, ScanItem, AuthState, DeepReviewResult, DeepReviewLead } from '../shared/types';

// ── DOM References ───────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const authScreen = $('auth-screen');
const lockedScreen = $('locked-screen');
const mainScreen = $('main-screen');

// Auth
const usernameInput = $<HTMLInputElement>('username-input');
const passwordInput = $<HTMLInputElement>('password-input');
const loginBtn = $<HTMLButtonElement>('login-btn');
const loginError = $('login-error');

// Main
const statusBadge = $('status-badge');
const scanBtn = $<HTMLButtonElement>('scan-btn');
const scanBtnText = $('scan-btn-text');

// Scan Results
const scanResults = $('scan-results');
const scanItems = $('scan-items');
const scanCount = $('scan-count');

// Deep Review (agent mode)
const deepReviewSection = $('deep-review-section');
const deepReviewBtn = $<HTMLButtonElement>('deep-review-btn');
const deepReviewBtnText = $('deep-review-btn-text');
const deepReviewEstimate = $('deep-review-estimate');
const deepReviewProgress = $('deep-review-progress');
const deepReviewBar = $('deep-review-bar');
const deepReviewStatus = $('deep-review-status');
const deepReviewCancelBtn = $<HTMLButtonElement>('deep-review-cancel-btn');
const deepReviewResults = $('deep-review-results');
const deepReviewCards = $('deep-review-cards');
const deepReviewBadge = $('deep-review-badge');

// Chat
const chatMessages = $('chat-messages');
const chatInput = $<HTMLInputElement>('chat-input');
const chatSendBtn = $<HTMLButtonElement>('chat-send-btn');

// Logout
const logoutBtn = $<HTMLButtonElement>('logout-btn');
const logoutLockedBtn = $<HTMLButtonElement>('logout-locked-btn');

// ── State ────────────────────────────────────────────────────────────────────

let currentScanResult: ScanResult | null = null;

// ── Screen Management ────────────────────────────────────────────────────────

function showScreen(screen: 'auth' | 'locked' | 'main') {
  authScreen.style.display = screen === 'auth' ? 'flex' : 'none';
  lockedScreen.style.display = screen === 'locked' ? 'flex' : 'none';
  mainScreen.style.display = screen === 'main' ? 'flex' : 'none';
}

function setStatus(status: 'idle' | 'scanning' | 'analyzing' | 'ready' | 'error', message?: string) {
  const labels: Record<string, string> = {
    idle: 'Idle',
    scanning: 'Scanning...',
    analyzing: 'Analyzing...',
    ready: 'Ready',
    error: message || 'Error',
  };

  statusBadge.textContent = labels[status] || status;
  statusBadge.className = `badge badge-${status}`;

  const busy = status === 'scanning' || status === 'analyzing';
  scanBtn.disabled = busy;
  scanBtnText.textContent = busy
    ? status.charAt(0).toUpperCase() + status.slice(1) + '...'
    : 'Scan Page';
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function usernameToEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  // If they typed a full email, use it as-is; otherwise append the default domain
  return trimmed.includes('@') ? trimmed : `${trimmed}@pocketrep.app`;
}

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError('Enter your username and password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  loginError.style.display = 'none';

  const result = await chrome.runtime.sendMessage({
    type: 'AUTH_LOGIN',
    payload: { email: usernameToEmail(username), password },
  });

  loginBtn.disabled = false;
  loginBtn.textContent = 'Sign In';

  if (result.error) {
    showError(result.error);
    return;
  }

  handleAuthState(result.authState);
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') passwordInput.focus();
});

function showError(msg: string) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
  showScreen('auth');
  resetUI();
});

logoutLockedBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
  showScreen('auth');
});

function handleAuthState(state: AuthState) {
  if (!state.authenticated) {
    showScreen('auth');
    return;
  }
  if (!state.hasAccess) {
    showScreen('locked');
    return;
  }
  showScreen('main');
}

// ── Scan ──────────────────────────────────────────────────────────────────────

scanBtn.addEventListener('click', async () => {
  setStatus('scanning');

  let result: any;
  try {
    result = await Promise.race([
      chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Scan timed out. Try again.')), 60_000)),
    ]);
  } catch (err: any) {
    setStatus('error', err.message);
    return;
  }

  if (result.error) {
    setStatus('error', result.error);
    return;
  }

  if (result.scanResult) {
    displayScanResults(result.scanResult);
  }
});

function displayScanResults(result: ScanResult) {
  currentScanResult = result;
  setStatus('ready');

  const actionableItems = result.items.filter(i => !i.dismiss);
  const dismissItems = result.items.filter(i => i.dismiss);

  scanCount.textContent = `${actionableItems.length} item${actionableItems.length !== 1 ? 's' : ''}`;
  scanItems.innerHTML = '';

  // Actionable items first
  actionableItems.forEach((item, index) => {
    scanItems.appendChild(createScanItemEl(item, index + 1));
  });

  // Dismiss items at the end (collapsed)
  if (dismissItems.length > 0) {
    const dismissHeader = document.createElement('div');
    dismissHeader.className = 'dismiss-section-header';
    dismissHeader.textContent = `${dismissItems.length} notification${dismissItems.length !== 1 ? 's' : ''} — dismiss`;
    scanItems.appendChild(dismissHeader);

    dismissItems.forEach((item, index) => {
      scanItems.appendChild(createScanItemEl(item, actionableItems.length + index + 1));
    });
  }

  if (result.items.length === 0) {
    scanItems.innerHTML = '<div class="scan-empty">No actionable items found on this page. Try scanning a CRM worklist, email inbox, or conversation.</div>';
  }
  scanResults.style.display = 'block';

  // Show Deep Review button if there are actionable items
  if (actionableItems.length > 0) {
    const count = Math.min(actionableItems.length, 25);
    const estimatedSec = count * 9;
    deepReviewEstimate.textContent = `Rex will click into ${count} lead${count !== 1 ? 's' : ''} — about ${estimatedSec}s`;
    deepReviewSection.style.display = 'block';
    deepReviewBtn.disabled = false;
    deepReviewBtnText.textContent = 'Deep Review';
  } else {
    deepReviewSection.style.display = 'none';
  }

  // Hide previous deep review results when a new scan happens
  deepReviewResults.style.display = 'none';
  deepReviewCards.innerHTML = '';
}

const TASK_ICONS: Record<string, string> = {
  phone: '📞', email: '📧', text: '📱',
  followup: '🤝', service: '🔧',
  notification: '🔔',
};

const TASK_LABELS: Record<string, string> = {
  phone: 'PHONE', email: 'EMAIL', text: 'TEXT',
  followup: 'FOLLOW-UP', service: 'SERVICE',
  notification: 'DISMISS',
};

function createScanItemEl(item: ScanItem, num: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `scan-item${item.dismiss ? ' scan-item-dismiss' : ''}`;

  const taskType = item.taskType || 'followup';
  const icon = TASK_ICONS[taskType] || '👤';
  const label = TASK_LABELS[taskType] || 'TASK';
  const urgencyClass = item.urgency === 'high' ? 'urgency-high' : item.urgency === 'low' ? 'urgency-low' : '';

  el.innerHTML = `
    <div class="scan-item-header">
      <span class="scan-item-num">${num}</span>
      <span class="scan-item-name">${escapeHtml(item.name)}</span>
      <span class="scan-item-badge task-${taskType}">${icon} ${label}</span>
      ${urgencyClass ? `<span class="scan-item-urgency ${urgencyClass}">${item.urgency.toUpperCase()}</span>` : ''}
    </div>
    <div class="scan-item-context">${escapeHtml(item.context)}</div>
    ${item.product ? `<div class="scan-item-product">${escapeHtml(item.product)}</div>` : ''}
    ${item.script ? `
    <div class="scan-item-script">
      <div class="scan-item-script-text" contenteditable="true" spellcheck="true" data-item-num="${num}">${escapeHtml(item.script)}</div>
      <div class="scan-item-script-actions">
        <button class="btn-copy-script" title="Copy script">Copy</button>
      </div>
    </div>` : ''}
  `;

  // Copy button — copies the current (possibly edited) text
  const copyBtn = el.querySelector('.btn-copy-script');
  const scriptText = el.querySelector('.scan-item-script-text') as HTMLElement | null;
  if (copyBtn && scriptText) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(scriptText.textContent || '');
      (copyBtn as HTMLButtonElement).textContent = 'Copied!';
      setTimeout(() => { (copyBtn as HTMLButtonElement).textContent = 'Copy'; }, 1000);
    });
  }

  return el;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Deep Review (Agent Mode) ──────────────────────────────────────────────

deepReviewBtn.addEventListener('click', async () => {
  deepReviewBtn.disabled = true;
  deepReviewBtnText.textContent = 'Starting...';
  deepReviewSection.style.display = 'none';

  // Show progress
  deepReviewProgress.style.display = 'flex';
  deepReviewBar.style.width = '0%';
  deepReviewStatus.textContent = 'Starting deep review...';
  deepReviewCancelBtn.disabled = false;

  const result = await chrome.runtime.sendMessage({ type: 'DEEP_REVIEW' });

  if (result.error) {
    deepReviewProgress.style.display = 'none';
    deepReviewSection.style.display = 'block';
    deepReviewBtn.disabled = false;
    deepReviewBtnText.textContent = 'Deep Review';
    setStatus('error', result.error);
  }
});

deepReviewCancelBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CANCEL_DEEP_REVIEW' });
  deepReviewStatus.textContent = 'Cancelling...';
  deepReviewCancelBtn.disabled = true;
});

function displayDeepReviewResults(result: DeepReviewResult) {
  deepReviewProgress.style.display = 'none';
  deepReviewResults.style.display = 'block';

  // Hide scan results — game plan replaces them
  scanResults.style.display = 'none';

  deepReviewBadge.textContent = `${result.leads.length} lead${result.leads.length !== 1 ? 's' : ''}`;
  deepReviewCards.innerHTML = '';

  result.leads.forEach((lead, index) => {
    deepReviewCards.appendChild(createGamePlanCard(lead, index));
  });
}

const PRIORITY_ICONS: Record<string, string> = {
  HOT: '🔥', WARM: '☀️', COLD: '❄️', DEAD: '💀',
};

function createGamePlanCard(lead: DeepReviewLead, index: number): HTMLElement {
  const card = document.createElement('div');
  const priority = (lead.priority || 'WARM').toUpperCase();
  const priorityClass = `priority-${priority.toLowerCase()}`;
  card.className = `game-plan-card ${priorityClass}${lead.skipped ? ' game-plan-skipped' : ''}`;

  const icon = PRIORITY_ICONS[priority] || '☀️';
  const taskIcon = TASK_ICONS[lead.taskType] || '📞';
  const taskLabel = TASK_LABELS[lead.taskType] || lead.taskType?.toUpperCase() || 'TASK';

  card.innerHTML = `
    <div class="game-plan-header">
      <span class="game-plan-priority ${priorityClass}">${icon} ${priority}</span>
      <span class="game-plan-name">${escapeHtml(lead.name)}</span>
      ${lead.product ? `<span class="game-plan-product">${escapeHtml(lead.product)}</span>` : ''}
    </div>
    ${lead.skipped ? `
    <div class="game-plan-skipped-note">Could not access — review manually</div>
    ` : `
    <div class="game-plan-last"><strong>Last:</strong> ${escapeHtml(lead.lastInteraction)}</div>
    <div class="game-plan-play"><strong>The play:</strong> ${taskIcon} ${escapeHtml(lead.play)}</div>
    ${lead.script ? `
    <div class="game-plan-script">
      <div class="game-plan-script-text" contenteditable="true" spellcheck="true" data-review-num="${index + 1}">${escapeHtml(lead.script)}</div>
      <div class="game-plan-script-actions">
        <button class="btn-copy-script" title="Copy script">Copy</button>
      </div>
    </div>` : ''}
    `}
  `;

  // Copy button
  const copyBtn = card.querySelector('.btn-copy-script');
  const scriptText = card.querySelector('.game-plan-script-text') as HTMLElement | null;
  if (copyBtn && scriptText) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(scriptText.textContent || '');
      (copyBtn as HTMLButtonElement).textContent = 'Copied!';
      setTimeout(() => { (copyBtn as HTMLButtonElement).textContent = 'Copy'; }, 1000);
    });
  }

  return card;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  appendChatMessage('user', text);

  chatSendBtn.disabled = true;
  chatInput.disabled = true;

  // Show thinking indicator
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'chat-msg chat-msg-assistant chat-thinking';
  thinkingEl.textContent = 'Rex is thinking...';
  chatMessages.appendChild(thinkingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const result = await chrome.runtime.sendMessage({
    type: 'CHAT_MESSAGE',
    payload: { role: 'user', content: text },
  });

  // Remove thinking indicator
  thinkingEl.remove();
  chatSendBtn.disabled = false;
  chatInput.disabled = false;
  chatInput.focus();

  if (result.error) {
    appendChatMessage('assistant', `Error: ${result.error}`);
  } else {
    handleChatReply(result.reply);
  }
}

function handleChatReply(reply: string) {
  // Check for [UPDATE #N] prefix — Rex rewrote a script
  const updateMatch = reply.match(/^\[UPDATE #(\d+)\]\n([\s\S]+?)(?:\n\n([\s\S]*))?$/);
  if (updateMatch) {
    const itemNum = parseInt(updateMatch[1], 10);
    const newScript = updateMatch[2].trim();
    const commentary = (updateMatch[3] || '').trim();

    // Update the script in the scan results list
    const scriptEl = scanItems.querySelector(`[data-item-num="${itemNum}"]`) as HTMLElement | null;
    if (scriptEl) {
      scriptEl.textContent = newScript;
      scriptEl.style.borderColor = 'var(--gold)';
      setTimeout(() => { scriptEl.style.borderColor = ''; }, 2000);
    }

    // Show commentary in chat (or confirmation if no commentary)
    appendChatMessage('assistant', commentary || `Updated script #${itemNum}.`);
    return;
  }

  appendChatMessage('assistant', reply);
}

function appendChatMessage(role: 'user' | 'assistant', content: string) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Listen for service worker broadcasts ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'AUTH_STATE':
      handleAuthState(message.payload);
      break;
    case 'COPY_FIRST_SCRIPT': {
      const firstScript = scanItems.querySelector('.scan-item-script-text') as HTMLElement | null;
      if (firstScript?.textContent) {
        navigator.clipboard.writeText(firstScript.textContent);
        scanCount.textContent = 'Copied!';
        setTimeout(() => {
          if (currentScanResult) {
            const count = currentScanResult.items.filter(i => !i.dismiss).length;
            scanCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
          }
        }, 1500);
      }
      break;
    }
    case 'STATUS':
      setStatus(message.payload.status, message.payload.message);
      break;
    case 'SCAN_RESULTS':
      displayScanResults(message.payload);
      break;
    case 'DEEP_REVIEW_PROGRESS': {
      const { current, total, name } = message.payload;
      const pct = Math.round((current / total) * 100);
      deepReviewBar.style.width = `${pct}%`;
      deepReviewStatus.textContent = `Reviewing lead ${current} of ${total}... clicking into ${name}`;
      break;
    }
    case 'DEEP_REVIEW_COMPLETE':
      deepReviewProgress.style.display = 'none';
      displayDeepReviewResults(message.payload);
      break;
  }
});

// ── Reset UI ─────────────────────────────────────────────────────────────────

function resetUI() {
  currentScanResult = null;
  scanResults.style.display = 'none';
  scanItems.innerHTML = '';
  chatMessages.innerHTML = '';
  deepReviewSection.style.display = 'none';
  deepReviewProgress.style.display = 'none';
  deepReviewResults.style.display = 'none';
  deepReviewCards.innerHTML = '';
  setStatus('idle');
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function initialize() {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  handleAuthState(authState);

  // Load any existing scan results
  const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_SCAN' });
  if (last.scanResult) {
    displayScanResults(last.scanResult);
  }
}

initialize();
