import type { AuthState, DeepReviewResult, DeepReviewLead } from '../shared/types';

// ── DOM References ───────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const authScreen = $('auth-screen');
const lockedScreen = $('locked-screen');
const mainScreen = $('main-screen');

const usernameInput = $<HTMLInputElement>('username-input');
const passwordInput = $<HTMLInputElement>('password-input');
const loginBtn = $<HTMLButtonElement>('login-btn');
const loginError = $('login-error');

const chatMessages = $('chat-messages');
const chatInput = $<HTMLInputElement>('chat-input');
const chatSendBtn = $<HTMLButtonElement>('chat-send-btn');
const refreshBtn = $<HTMLButtonElement>('refresh-btn');
const logoutBtn = $<HTMLButtonElement>('logout-btn');
const logoutLockedBtn = $<HTMLButtonElement>('logout-locked-btn');
const pageIndicator = $('page-indicator');

// ── State ────────────────────────────────────────────────────────────────────

let hasPageContext = false;
let isWaitingForReply = false;

// ── Screen Management ────────────────────────────────────────────────────────

function showScreen(screen: 'auth' | 'locked' | 'main') {
  authScreen.style.display = screen === 'auth' ? 'flex' : 'none';
  lockedScreen.style.display = screen === 'locked' ? 'flex' : 'none';
  mainScreen.style.display = screen === 'main' ? 'flex' : 'none';
}

function handleAuthState(state: AuthState) {
  if (!state.authenticated) { showScreen('auth'); return; }
  if (!state.hasAccess) { showScreen('locked'); return; }
  showScreen('main');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function usernameToEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : `${trimmed}@pocketrep.app`;
}

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showLoginError('Enter your username and password.');
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

  if (result.error) { showLoginError(result.error); return; }
  handleAuthState(result.authState);
});

passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwordInput.focus(); });

function showLoginError(msg: string) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
  showScreen('auth');
  chatMessages.innerHTML = '';
});

logoutLockedBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
  showScreen('auth');
});

// ── Page Context ────────────────────────────────────────────────────────────

async function silentPageExtract() {
  pageIndicator.className = 'page-indicator loading';
  pageIndicator.title = 'Reading page...';

  const result = await chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_CONTEXT' });

  if (result?.hasContent) {
    hasPageContext = true;
    pageIndicator.className = 'page-indicator active';
    pageIndicator.title = 'Page context loaded';
  } else {
    hasPageContext = false;
    pageIndicator.className = 'page-indicator inactive';
    pageIndicator.title = 'No page content detected';
  }
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.style.transform = 'rotate(360deg)';
  setTimeout(() => { refreshBtn.style.transform = ''; }, 400);
  await silentPageExtract();
});

// ── Quick Action Buttons ────────────────────────────────────────────────────

const quickActions = $('quick-actions');

quickActions.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.quick-action-btn') as HTMLElement | null;
  if (!btn) return;
  const prompt = btn.getAttribute('data-prompt');
  if (prompt) {
    chatInput.value = prompt;
    sendChat();
    // Hide quick actions after first use
    quickActions.style.display = 'none';
  }
});

// ── Chat ────────────────────────────────────────────────────────────────────

chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendChat();
});

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || isWaitingForReply) return;

  chatInput.value = '';
  appendMessage('user', text);

  isWaitingForReply = true;
  chatSendBtn.disabled = true;
  chatInput.disabled = true;

  // Show thinking indicator
  const thinkingEl = createThinkingIndicator();
  chatMessages.appendChild(thinkingEl);
  scrollToBottom();

  const result = await chrome.runtime.sendMessage({
    type: 'CHAT_MESSAGE',
    payload: { content: text },
  });

  thinkingEl.remove();
  isWaitingForReply = false;
  chatSendBtn.disabled = false;
  chatInput.disabled = false;
  chatInput.focus();

  if (result.error && !result.deepReview) {
    appendMessage('assistant', `Something went wrong: ${result.error}`);
  } else if (result.reply) {
    appendMessage('assistant', result.reply);
  }
}

// ── Message Rendering ───────────────────────────────────────────────────────

function appendMessage(role: 'user' | 'assistant', content: string) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg msg-${role}`;

  if (role === 'assistant') {
    wrapper.innerHTML = formatAssistantMessage(content);
    // Attach copy button listeners
    wrapper.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scriptEl = btn.closest('.script-block')?.querySelector('.script-text');
        if (scriptEl) {
          navigator.clipboard.writeText(scriptEl.textContent || '');
          (btn as HTMLButtonElement).textContent = 'Copied!';
          setTimeout(() => { (btn as HTMLButtonElement).textContent = 'Copy'; }, 1200);
        }
      });
    });
  } else {
    wrapper.textContent = content;
  }

  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

function formatAssistantMessage(content: string): string {
  // Detect numbered scripts (#1, #2, etc.) or email-like blocks with subject lines
  // Wrap script-like blocks in copyable containers
  const lines = content.split('\n');
  let html = '';
  let inScript = false;
  let scriptLines: string[] = [];
  let scriptNum = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const scriptMatch = line.match(/^(?:#(\d+)[:\s]|(\d+)\.\s)/);

    if (scriptMatch && !inScript) {
      // Start of a new numbered item — check if the next lines look like a script
      scriptNum = scriptMatch[1] || scriptMatch[2];
      const restOfLine = line.replace(/^(?:#\d+[:\s]|\d+\.\s)/, '').trim();
      if (restOfLine) scriptLines.push(restOfLine);
      inScript = true;
    } else if (inScript) {
      // Continue script until empty line or next numbered item
      const nextScriptMatch = line.match(/^(?:#(\d+)[:\s]|(\d+)\.\s)/);
      if (nextScriptMatch || (line.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^(?:#\d+[:\s]|\d+\.\s)/))) {
        // Flush current script
        html += buildScriptBlock(scriptNum, scriptLines.join('\n'));
        scriptLines = [];
        if (nextScriptMatch) {
          scriptNum = nextScriptMatch[1] || nextScriptMatch[2];
          const rest = line.replace(/^(?:#\d+[:\s]|\d+\.\s)/, '').trim();
          if (rest) scriptLines.push(rest);
        } else {
          inScript = false;
        }
      } else if (line.trim() === '' && scriptLines.length > 0) {
        // Empty line might be part of email script (between subject and body)
        scriptLines.push('');
      } else if (line.trim() !== '') {
        scriptLines.push(line);
      } else {
        // Double empty line — end script
        html += buildScriptBlock(scriptNum, scriptLines.join('\n'));
        scriptLines = [];
        inScript = false;
      }
    } else {
      html += escapeHtml(line) + (i < lines.length - 1 ? '<br>' : '');
    }
  }

  // Flush remaining script
  if (inScript && scriptLines.length > 0) {
    html += buildScriptBlock(scriptNum, scriptLines.join('\n'));
  }

  return html || escapeHtml(content);
}

function buildScriptBlock(num: string, text: string): string {
  return `<div class="script-block">
    <div class="script-header">
      <span class="script-num">#${num}</span>
      <button class="copy-btn">Copy</button>
    </div>
    <div class="script-text">${escapeHtml(text.trim())}</div>
  </div>`;
}

function createThinkingIndicator(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'msg msg-assistant thinking';
  el.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  return el;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Deep Review: Inline Progress + Results ──────────────────────────────────

let deepReviewProgressEl: HTMLElement | null = null;

function showDeepReviewProgress(current: number, total: number, name: string) {
  if (!deepReviewProgressEl) {
    deepReviewProgressEl = document.createElement('div');
    deepReviewProgressEl.className = 'msg msg-assistant deep-review-progress';
    chatMessages.appendChild(deepReviewProgressEl);
  }

  const pct = Math.round((current / total) * 100);
  deepReviewProgressEl.innerHTML = `
    <div class="dr-progress-text">Reviewing lead ${current} of ${total}...</div>
    <div class="dr-progress-name">${escapeHtml(name)}</div>
    <div class="dr-progress-bar-bg"><div class="dr-progress-bar" style="width:${pct}%"></div></div>
  `;
  scrollToBottom();
}

function displayGamePlan(result: DeepReviewResult) {
  // Remove progress indicator
  if (deepReviewProgressEl) {
    deepReviewProgressEl.remove();
    deepReviewProgressEl = null;
  }

  const summaryEl = document.createElement('div');
  summaryEl.className = 'msg msg-assistant';
  summaryEl.innerHTML = `<strong>Game plan ready</strong> — ${result.leads.length} leads, ${result.reviewedCount} reviewed in detail.`;
  chatMessages.appendChild(summaryEl);

  // Render each lead as a game plan card
  for (const lead of result.leads) {
    const cardEl = document.createElement('div');
    cardEl.className = 'msg msg-assistant game-plan-card';
    cardEl.innerHTML = buildGamePlanCard(lead);

    // Copy button listener
    cardEl.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scriptEl = btn.closest('.gp-script')?.querySelector('.script-text');
        if (scriptEl) {
          navigator.clipboard.writeText(scriptEl.textContent || '');
          (btn as HTMLButtonElement).textContent = 'Copied!';
          setTimeout(() => { (btn as HTMLButtonElement).textContent = 'Copy'; }, 1200);
        }
      });
    });

    chatMessages.appendChild(cardEl);
  }

  scrollToBottom();
}

const PRIORITY_COLORS: Record<string, string> = {
  HOT: '#f08080', WARM: '#d4a843', COLD: '#5a6070', DEAD: '#3a3a44',
};

function buildGamePlanCard(lead: DeepReviewLead): string {
  const p = (lead.priority || 'WARM').toUpperCase();
  const color = PRIORITY_COLORS[p] || PRIORITY_COLORS.WARM;

  if (lead.skipped) {
    return `<div class="gp-header">
      <span class="gp-priority" style="color:${color}">${p}</span>
      <span class="gp-name">${escapeHtml(lead.name)}</span>
    </div>
    <div class="gp-skipped">Could not access — review manually</div>`;
  }

  return `<div class="gp-header">
    <span class="gp-priority" style="color:${color}">${p}</span>
    <span class="gp-name">${escapeHtml(lead.name)}</span>
    ${lead.product ? `<span class="gp-product">${escapeHtml(lead.product)}</span>` : ''}
  </div>
  <div class="gp-last">${escapeHtml(lead.lastInteraction)}</div>
  <div class="gp-play">${escapeHtml(lead.play)}</div>
  ${lead.script ? `<div class="gp-script">
    <div class="script-text">${escapeHtml(lead.script)}</div>
    <button class="copy-btn">Copy</button>
  </div>` : ''}`;
}

// ── Listen for service worker broadcasts ────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'AUTH_STATE':
      handleAuthState(message.payload);
      break;
    case 'DEEP_REVIEW_PROGRESS': {
      const { current, total, name } = message.payload;
      showDeepReviewProgress(current, total, name);
      break;
    }
    case 'DEEP_REVIEW_COMPLETE':
      displayGamePlan(message.payload);
      break;
    case 'PAGE_CHANGED':
      silentPageExtract();
      break;
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

async function initialize() {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  handleAuthState(authState);

  // Silently extract page context
  await silentPageExtract();

  chatInput.focus();
}

initialize();
