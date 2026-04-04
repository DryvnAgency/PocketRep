import type { ScanResult, ScanItem, AuthState, DeepScanResult, ContactActionPlan } from '../shared/types';

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

// Deep Scan (auto-triggered after page scan when contacts are found)
const deepScanProgress = $('deep-scan-progress');
const deepScanBar = $('deep-scan-bar');
const deepScanStatus = $('deep-scan-status');
const deepScanCancelBtn = $<HTMLButtonElement>('deep-scan-cancel-btn');
const deepScanResults = $('deep-scan-results');
const deepScanCards = $('deep-scan-cards');
const deepScanBadge = $('deep-scan-badge');

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
        <button class="btn-save-contact" title="Send to PocketRep">Send to PocketRep</button>
      </div>
    </div>` : `
    <div class="scan-item-script-actions" style="margin-top:6px">
      <button class="btn-save-contact" title="Send to PocketRep">Send to PocketRep</button>
    </div>`}
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

  // Send to PocketRep button
  const saveBtn = el.querySelector('.btn-save-contact') as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      const result = await chrome.runtime.sendMessage({
        type: 'SAVE_CONTACT',
        payload: { name: item.name, product: item.product, context: item.context },
      });
      if (result.saved) {
        saveBtn.textContent = 'Saved ✓';
        saveBtn.classList.add('btn-save-done');
      } else if (result.alreadySaved) {
        saveBtn.textContent = 'Already saved';
        saveBtn.classList.add('btn-save-done');
      } else {
        saveBtn.textContent = result.error || 'Failed';
        setTimeout(() => { saveBtn.textContent = 'Send to PocketRep'; saveBtn.disabled = false; }, 2000);
      }
    });
  }

  return el;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Deep Scan (auto-triggered) ──────────────────────────────────────────────

deepScanCancelBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CANCEL_DEEP_SCAN' });
  deepScanStatus.textContent = 'Cancelling...';
  deepScanCancelBtn.disabled = true;
});

function displayDeepScanResults(result: DeepScanResult) {
  deepScanResults.style.display = 'block';
  deepScanBadge.textContent = `${result.scannedCount} contacts`;
  deepScanCards.innerHTML = '';

  result.contacts.forEach((contact, index) => {
    const card = createActionCard(contact, index < 3);
    deepScanCards.appendChild(card);
  });
}

function createActionCard(contact: ContactActionPlan, expanded: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = `action-card${expanded ? ' expanded' : ''}${contact.dismiss ? ' dismiss' : ''}`;

  const isSkip = contact.dismiss || (contact.book || '').toLowerCase().startsWith('skip') || (contact.book || '').toLowerCase().startsWith('dismiss');

  const taskType = contact.taskType || 'followup';
  const icon = TASK_ICONS[taskType] || '👤';
  const label = TASK_LABELS[taskType] || 'Task';

  card.innerHTML = `
    <div class="action-card-header">
      <span>${icon}</span>
      <span class="action-card-name">${escapeHtml(contact.name)}</span>
      <span class="action-card-badge task-${taskType}">${label}</span>
      ${contact.product ? `<span class="action-card-vehicle">${escapeHtml(contact.product)}</span>` : ''}
      <span class="action-card-toggle">▶</span>
    </div>
    <div class="action-card-summary">${escapeHtml(contact.summary)}</div>
    <div class="action-card-body">
      ${contact.dismiss ? `
      <div class="action-book skip">
        <span>🔔</span>
        <span>${escapeHtml(contact.book || 'Notification only — dismiss this task')}</span>
      </div>` : `
      ${contact.callScript ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📞 Call Script</span>
          <button class="btn-copy-sm" data-copy="call">Copy</button>
        </div>
        <div class="action-section-text">${escapeHtml(contact.callScript)}</div>
      </div>` : ''}

      ${contact.email && contact.email.subject ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📧 Email</span>
          <button class="btn-copy-sm" data-copy="email">Copy</button>
        </div>
        <div class="action-section-subject">Subject: ${escapeHtml(contact.email.subject)}</div>
        <div class="action-section-text">${escapeHtml(contact.email.body)}</div>
      </div>` : ''}

      ${contact.text ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📱 Text</span>
          <button class="btn-copy-sm" data-copy="text">Copy</button>
        </div>
        <div class="action-section-text">${escapeHtml(contact.text)}</div>
      </div>` : ''}

      <div class="action-book${isSkip ? ' skip' : ''}">
        <span>📅</span>
        <span>${escapeHtml(contact.book || 'No booking suggestion')}</span>
      </div>
      `}
    </div>
  `;

  const header = card.querySelector('.action-card-header')!;
  header.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  card.querySelectorAll<HTMLButtonElement>('.btn-copy-sm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.copy;
      let text = '';
      if (type === 'text') text = contact.text;
      else if (type === 'email') text = `Subject: ${contact.email.subject}\n\n${contact.email.body}`;
      else if (type === 'call') text = contact.callScript;

      navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1000);
    });
  });

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
    case 'AUTO_DEEP_SCAN_START':
      deepScanProgress.style.display = 'flex';
      deepScanResults.style.display = 'none';
      deepScanBar.style.width = '0%';
      deepScanStatus.textContent = 'Contacts detected — scanning...';
      deepScanCancelBtn.disabled = false;
      break;
    case 'DEEP_SCAN_PROGRESS': {
      const { current, total, name } = message.payload;
      const pct = Math.round((current / total) * 100);
      deepScanBar.style.width = `${pct}%`;
      deepScanStatus.textContent = `Scanning ${current} of ${total} — ${name}`;
      break;
    }
    case 'DEEP_SCAN_COMPLETE':
      deepScanProgress.style.display = 'none';
      deepScanCancelBtn.disabled = false;
      displayDeepScanResults(message.payload);
      break;
  }
});

// ── Reset UI ─────────────────────────────────────────────────────────────────

function resetUI() {
  currentScanResult = null;
  scanResults.style.display = 'none';
  scanItems.innerHTML = '';
  chatMessages.innerHTML = '';
  deepScanProgress.style.display = 'none';
  deepScanResults.style.display = 'none';
  deepScanCards.innerHTML = '';
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
    if (last.scanResult.deepScan) {
      displayDeepScanResults(last.scanResult.deepScan);
    }
  }
}

initialize();
