import type { RexSuggestion, AuthState, FormField, DeepScanResult, ContactActionPlan } from '../shared/types';

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
const contactMatch = $('contact-match');
const contactMatchContent = $('contact-match-content');
const situationCard = $('situation-card');
const situationText = $('situation-text');
const suggestionsCard = $('suggestions-card');
const suggestionsList = $('suggestions-list');
const responseCard = $('response-card');
const responseText = $('response-text');
const copyResponseBtn = $<HTMLButtonElement>('copy-response-btn');
const insertResponseBtn = $<HTMLButtonElement>('insert-response-btn');
const followupCard = $('followup-card');
const followupText = $('followup-text');

// Insert Modal
const insertModal = $('insert-modal');
const insertModalField = $('insert-modal-field');
const insertModalPreview = $('insert-modal-preview');
const insertCancelBtn = $<HTMLButtonElement>('insert-cancel-btn');
const insertConfirmBtn = $<HTMLButtonElement>('insert-confirm-btn');

// Chat
const chatMessages = $('chat-messages');
const chatInput = $<HTMLInputElement>('chat-input');
const chatSendBtn = $<HTMLButtonElement>('chat-send-btn');

// Deep Scan
const deepScanBtn = $<HTMLButtonElement>('deep-scan-btn');
const deepScanBtnText = $('deep-scan-btn-text');
const deepScanProgress = $('deep-scan-progress');
const deepScanBar = $('deep-scan-bar');
const deepScanStatus = $('deep-scan-status');
const deepScanCancelBtn = $<HTMLButtonElement>('deep-scan-cancel-btn');
const deepScanResults = $('deep-scan-results');
const deepScanCards = $('deep-scan-cards');
const deepScanBadge = $('deep-scan-badge');

// Logout
const logoutBtn = $<HTMLButtonElement>('logout-btn');
const logoutLockedBtn = $<HTMLButtonElement>('logout-locked-btn');

// ── State ────────────────────────────────────────────────────────────────────

let currentSuggestions: RexSuggestion | null = null;
let currentDraftResponse: string | null = null;
let detectedFields: FormField[] = [];
let pendingInsert: { selector: string; text: string } | null = null;

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
  deepScanBtn.disabled = busy;
  scanBtnText.textContent = busy
    ? status.charAt(0).toUpperCase() + status.slice(1) + '...'
    : 'Scan Page';
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@pocketrep.app`;
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

// Handle Enter key on login fields
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

// Logout
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

  const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' });

  if (result.error) {
    setStatus('error', result.error);
    return;
  }

  if (result.suggestions) {
    displaySuggestions(result.suggestions);
  }
});

function displaySuggestions(suggestions: RexSuggestion) {
  currentSuggestions = suggestions;
  currentDraftResponse = suggestions.draftResponse;
  setStatus('ready');

  // Contact match
  if (suggestions.matchedContact) {
    const c = suggestions.matchedContact;
    const heatClass = c.heat_tier ? `heat-${c.heat_tier}` : '';
    contactMatchContent.innerHTML = `
      <strong>${c.first_name} ${c.last_name}</strong>
      ${c.heat_tier ? `<span class="heat-badge ${heatClass}">${c.heat_tier.toUpperCase()}</span>` : ''}
      <div class="contact-detail"><span>Vehicle:</span> <strong>${[c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ') || 'N/A'}</strong></div>
      <div class="contact-detail"><span>Stage:</span> <strong>${c.stage || 'unknown'}</strong></div>
      ${c.notes ? `<div class="contact-detail"><span>Notes:</span> ${c.notes}</div>` : ''}
    `;
    contactMatch.style.display = 'flex';
  } else {
    contactMatch.style.display = 'none';
  }

  // Situation
  situationText.textContent = suggestions.situation;
  situationCard.style.display = 'flex';

  // Suggestions
  suggestionsList.innerHTML = '';
  for (const s of suggestions.suggestions) {
    const li = document.createElement('li');
    li.textContent = s;
    li.addEventListener('click', () => {
      navigator.clipboard.writeText(s);
      li.style.borderColor = 'var(--success)';
      setTimeout(() => { li.style.borderColor = ''; }, 1000);
    });
    suggestionsList.appendChild(li);
  }
  suggestionsCard.style.display = suggestions.suggestions.length > 0 ? 'flex' : 'none';

  // Draft response
  if (suggestions.draftResponse) {
    responseText.textContent = suggestions.draftResponse;
    responseCard.style.display = 'flex';
  } else {
    responseCard.style.display = 'none';
  }

  // Follow-up
  if (suggestions.followUp) {
    followupText.textContent = suggestions.followUp;
    followupCard.style.display = 'flex';
  } else {
    followupCard.style.display = 'none';
  }
}

// ── Deep Scan ───────────────────────────────────────────────────────────────

deepScanBtn.addEventListener('click', async () => {
  deepScanBtn.disabled = true;
  deepScanBtnText.textContent = 'Scanning...';
  deepScanProgress.style.display = 'flex';
  deepScanResults.style.display = 'none';
  deepScanBar.style.width = '0%';
  deepScanStatus.textContent = 'Finding contacts...';

  const result = await chrome.runtime.sendMessage({ type: 'DEEP_SCAN' });

  deepScanBtn.disabled = false;
  deepScanBtnText.textContent = 'Deep Scan (up to 30 contacts)';
  deepScanProgress.style.display = 'none';

  if (result.error) {
    setStatus('error', result.error);
    return;
  }

  if (result.deepScan) {
    displayDeepScanResults(result.deepScan);
  }
});

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
    const card = createActionCard(contact, index < 3); // First 3 expanded
    deepScanCards.appendChild(card);
  });
}

function createActionCard(contact: ContactActionPlan, expanded: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = `action-card${expanded ? ' expanded' : ''}`;

  const isSkip = (contact.book || '').toLowerCase().startsWith('skip');

  card.innerHTML = `
    <div class="action-card-header">
      <span>👤</span>
      <span class="action-card-name">${escapeHtml(contact.name)}</span>
      <span class="action-card-toggle">▶</span>
    </div>
    <div class="action-card-summary">${escapeHtml(contact.summary)}</div>
    <div class="action-card-body">
      ${contact.text ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📱 Text</span>
          <button class="btn-copy-sm" data-copy="text">Copy</button>
        </div>
        <div class="action-section-text">${escapeHtml(contact.text)}</div>
      </div>` : ''}

      ${contact.email.subject ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📧 Email</span>
          <button class="btn-copy-sm" data-copy="email">Copy</button>
        </div>
        <div class="action-section-subject">Subject: ${escapeHtml(contact.email.subject)}</div>
        <div class="action-section-text">${escapeHtml(contact.email.body)}</div>
      </div>` : ''}

      ${contact.callScript ? `
      <div class="action-section">
        <div class="action-section-header">
          <span class="action-section-label">📞 Call Script</span>
          <button class="btn-copy-sm" data-copy="call">Copy</button>
        </div>
        <div class="action-section-text">${escapeHtml(contact.callScript)}</div>
      </div>` : ''}

      <div class="action-book${isSkip ? ' skip' : ''}">
        <span>📅</span>
        <span>${escapeHtml(contact.book || 'No booking suggestion')}</span>
      </div>
    </div>
  `;

  // Toggle expand/collapse
  const header = card.querySelector('.action-card-header')!;
  header.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  // Copy buttons
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

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Copy Response ────────────────────────────────────────────────────────────

copyResponseBtn.addEventListener('click', () => {
  if (!currentDraftResponse) return;
  navigator.clipboard.writeText(currentDraftResponse);
  copyResponseBtn.textContent = 'Copied!';
  setTimeout(() => { copyResponseBtn.textContent = 'Copy'; }, 1500);
});

// ── Insert into Page ─────────────────────────────────────────────────────────

insertResponseBtn.addEventListener('click', async () => {
  if (!currentDraftResponse) return;

  // Detect fields on the page
  const result = await chrome.runtime.sendMessage({ type: 'DETECT_FIELDS' });
  detectedFields = result.fields || [];

  if (detectedFields.length === 0) {
    alert('No text fields found on the page.');
    return;
  }

  // Use the first suitable field (compose/reply area)
  const targetField = detectedFields.find(f =>
    f.type === 'contenteditable' || f.type === 'textarea'
  ) || detectedFields[0];

  // Highlight the field
  await chrome.runtime.sendMessage({
    type: 'HIGHLIGHT_FIELD',
    payload: { selector: targetField.selector, highlight: true },
  });

  // Show confirmation modal
  pendingInsert = { selector: targetField.selector, text: currentDraftResponse };
  insertModalField.textContent = `Target: ${targetField.label}`;
  insertModalPreview.textContent = currentDraftResponse;
  insertModal.style.display = 'flex';
});

insertCancelBtn.addEventListener('click', async () => {
  insertModal.style.display = 'none';
  if (pendingInsert) {
    await chrome.runtime.sendMessage({
      type: 'HIGHLIGHT_FIELD',
      payload: { selector: pendingInsert.selector, highlight: false },
    });
    pendingInsert = null;
  }
});

insertConfirmBtn.addEventListener('click', async () => {
  if (!pendingInsert) return;

  const result = await chrome.runtime.sendMessage({
    type: 'CONFIRM_INSERT',
    payload: pendingInsert,
  });

  // Remove highlight
  await chrome.runtime.sendMessage({
    type: 'HIGHLIGHT_FIELD',
    payload: { selector: pendingInsert.selector, highlight: false },
  });

  insertModal.style.display = 'none';

  if (result.success) {
    insertResponseBtn.textContent = 'Inserted!';
    setTimeout(() => { insertResponseBtn.textContent = 'Insert into Page'; }, 1500);
  } else {
    alert(result.error || 'Failed to insert text.');
  }

  pendingInsert = null;
});

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

  const result = await chrome.runtime.sendMessage({
    type: 'CHAT_MESSAGE',
    payload: { role: 'user', content: text },
  });

  chatSendBtn.disabled = false;

  if (result.error) {
    appendChatMessage('assistant', `Error: ${result.error}`);
  } else {
    appendChatMessage('assistant', result.reply);
  }
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
    case 'STATUS':
      setStatus(message.payload.status, message.payload.message);
      break;
    case 'SUGGESTIONS_READY':
      displaySuggestions(message.payload);
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
      deepScanBtn.disabled = false;
      deepScanBtnText.textContent = 'Deep Scan (up to 30 contacts)';
      deepScanCancelBtn.disabled = false;
      displayDeepScanResults(message.payload);
      break;
  }
});

// ── Reset UI ─────────────────────────────────────────────────────────────────

function resetUI() {
  currentSuggestions = null;
  currentDraftResponse = null;
  detectedFields = [];
  contactMatch.style.display = 'none';
  situationCard.style.display = 'none';
  suggestionsCard.style.display = 'none';
  responseCard.style.display = 'none';
  followupCard.style.display = 'none';
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

  // Load any existing suggestions
  const last = await chrome.runtime.sendMessage({ type: 'GET_LAST_SUGGESTIONS' });
  if (last.suggestions) {
    displaySuggestions(last.suggestions);
    if (last.suggestions.deepScan) {
      displayDeepScanResults(last.suggestions.deepScan);
    }
  }
}

initialize();
