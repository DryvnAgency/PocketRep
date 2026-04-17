// ── Rex Lens Chat Panel ─────────────────────────────────────────────────────
// Injected into the page via Shadow DOM. Dark-themed side panel with chat,
// pill buttons, task queue batching, file upload, and session persistence.

import type { StructuredTask } from '../shared/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_TASKS_PER_BATCH = 30;
const PANEL_MIN_WIDTH = 340;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 460;

// ── Types ───────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SessionState {
  messages: ChatMsg[];
  taskQueue: StructuredTask[];
  processedTaskCount: number;
}

// ── CSS ─────────────────────────────────────────────────────────────────────

const PANEL_CSS = /* css */ `
:host { all: initial; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Toggle Button ────────────────────────── */
#rex-toggle {
  position: fixed; bottom: 20px; right: 20px;
  width: 54px; height: 54px; border-radius: 50%;
  background: linear-gradient(135deg, #e94560, #0f3460);
  color: #fff; border: none; font-size: 22px;
  cursor: pointer; z-index: 2147483647;
  box-shadow: 0 4px 18px rgba(233,69,96,0.45);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
  font-weight: 700; letter-spacing: -0.5px;
}
#rex-toggle:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(233,69,96,0.6); }

/* ── Panel Shell ──────────────────────────── */
#rex-panel {
  position: fixed; top: 0; right: 0;
  width: ${PANEL_DEFAULT_WIDTH}px; height: 100vh;
  background: #111827; color: #e5e7eb;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 14px; z-index: 2147483646;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 30px rgba(0,0,0,0.55);
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
}
#rex-panel.open { transform: translateX(0); }

/* ── Resize Handle ────────────────────────── */
#rex-resize {
  position: absolute; left: 0; top: 0; bottom: 0; width: 5px;
  cursor: ew-resize; background: transparent;
  transition: background 0.15s;
}
#rex-resize:hover, #rex-resize.active { background: rgba(233,69,96,0.5); }

/* ── Header ───────────────────────────────── */
#rex-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: #0d1117;
  border-bottom: 1px solid #1e293b; flex-shrink: 0;
  user-select: none;
}
.rex-logo { font-weight: 700; font-size: 16px; color: #e94560; }
#rex-counter {
  font-size: 11px; color: #6b7280; margin-left: auto;
  background: #1e293b; padding: 3px 8px; border-radius: 10px;
}
.rex-hdr-btn {
  background: none; border: none; color: #6b7280;
  font-size: 18px; cursor: pointer; padding: 2px 6px;
  border-radius: 4px; line-height: 1;
}
.rex-hdr-btn:hover { color: #e5e7eb; background: #1e293b; }

/* ── Messages Area ────────────────────────── */
#rex-messages {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  scroll-behavior: smooth;
}
#rex-messages::-webkit-scrollbar { width: 6px; }
#rex-messages::-webkit-scrollbar-track { background: transparent; }
#rex-messages::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }

/* ── Message Bubbles ──────────────────────── */
.rex-msg {
  max-width: 92%; padding: 10px 14px;
  border-radius: 14px; line-height: 1.55;
  word-wrap: break-word; position: relative;
  font-size: 13.5px;
}
.rex-msg-user {
  align-self: flex-end; background: #e94560; color: #fff;
  border-bottom-right-radius: 4px;
}
.rex-msg-ai {
  align-self: flex-start; background: #1e293b; color: #e5e7eb;
  border-bottom-left-radius: 4px;
}
.rex-msg-system {
  align-self: center; background: #1e293b; color: #9ca3af;
  font-size: 12px; padding: 6px 12px; border-radius: 8px;
}

/* AI message markdown */
.rex-msg-ai h2 { font-size: 15px; color: #e94560; margin: 8px 0 4px; }
.rex-msg-ai h3 { font-size: 14px; color: #e94560; margin: 6px 0 3px; }
.rex-msg-ai h4 { font-size: 13.5px; color: #d4a843; margin: 4px 0 2px; }
.rex-msg-ai strong { color: #f3f4f6; }
.rex-msg-ai code { background: #111827; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
.rex-msg-ai ol, .rex-msg-ai ul { padding-left: 18px; margin: 4px 0; }
.rex-msg-ai li { margin: 2px 0; }
.rex-msg-ai p { margin: 4px 0; }

/* Copy button on AI messages */
.rex-copy-btn {
  position: absolute; top: 6px; right: 6px;
  background: #374151; border: none; color: #9ca3af;
  font-size: 11px; padding: 3px 8px; border-radius: 4px;
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.rex-msg-ai:hover .rex-copy-btn { opacity: 1; }
.rex-copy-btn:hover { background: #4b5563; color: #e5e7eb; }

/* Script blocks */
.rex-script-block {
  background: #0d1117; border-radius: 8px; padding: 10px 12px;
  margin: 6px 0; position: relative;
}
.rex-script-block .rex-script-copy {
  position: absolute; top: 6px; right: 6px;
  background: #e94560; border: none; color: #fff;
  font-size: 11px; padding: 3px 10px; border-radius: 4px;
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.rex-script-block:hover .rex-script-copy { opacity: 1; }

/* ── Queue Status ─────────────────────────── */
#rex-queue {
  display: none; padding: 10px 16px;
  background: #1e293b; border-top: 1px solid #374151;
  flex-shrink: 0;
}
#rex-queue.visible { display: flex; align-items: center; gap: 10px; }
#rex-queue-text { flex: 1; font-size: 12px; color: #9ca3af; }
#rex-continue-btn {
  background: linear-gradient(135deg, #e94560, #0f3460);
  border: none; color: #fff; font-size: 12px; font-weight: 600;
  padding: 6px 16px; border-radius: 6px; cursor: pointer;
  transition: opacity 0.15s;
}
#rex-continue-btn:hover { opacity: 0.9; }
#rex-continue-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Limit Banner ─────────────────────────── */
#rex-limit-banner {
  display: none; padding: 10px 16px; text-align: center;
  background: #7f1d1d; color: #fca5a5; font-size: 12px;
  flex-shrink: 0;
}
#rex-limit-banner.visible { display: block; }

/* ── Pill Buttons ─────────────────────────── */
#rex-pills {
  display: flex; gap: 6px; padding: 8px 16px;
  overflow-x: auto; flex-shrink: 0;
  border-top: 1px solid #1e293b;
}
#rex-pills::-webkit-scrollbar { height: 0; }
.rex-pill {
  white-space: nowrap; padding: 4px 10px;
  border-radius: 20px; border: 1px solid #374151;
  background: transparent; color: #d1d5db;
  font-size: 11px; cursor: pointer;
  transition: all 0.18s; flex-shrink: 0;
}
.rex-pill:hover {
  border-color: #e94560; color: #fff;
  box-shadow: 0 0 10px rgba(233,69,96,0.25);
}
.rex-pill-primary {
  background: linear-gradient(135deg, #e94560, #0f3460);
  border-color: transparent; color: #fff; font-weight: 600;
}
.rex-pill-primary:hover {
  box-shadow: 0 0 14px rgba(233,69,96,0.45);
  border-color: transparent;
}

/* ── File Previews ────────────────────────── */
#rex-file-previews {
  display: none; gap: 6px; padding: 6px 16px;
  flex-shrink: 0; flex-wrap: wrap;
}
#rex-file-previews.visible { display: flex; }
.rex-file-thumb {
  position: relative; width: 48px; height: 48px;
  border-radius: 6px; overflow: hidden;
  border: 1px solid #374151;
}
.rex-file-thumb img {
  width: 100%; height: 100%; object-fit: cover;
}
.rex-file-thumb .rex-file-icon {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; background: #1e293b;
  color: #9ca3af; font-size: 10px; text-align: center;
  padding: 2px; word-break: break-all;
}
.rex-file-remove {
  position: absolute; top: -4px; right: -4px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #ef4444; border: none; color: #fff;
  font-size: 10px; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}

/* ── Input Area ───────────────────────────── */
#rex-input-area {
  display: flex; align-items: flex-end; gap: 6px;
  padding: 10px 12px; background: #0d1117;
  border-top: 1px solid #1e293b; flex-shrink: 0;
}
#rex-attach-btn {
  background: none; border: none; color: #6b7280;
  font-size: 18px; cursor: pointer; padding: 4px;
  flex-shrink: 0; line-height: 1;
}
#rex-attach-btn:hover { color: #e5e7eb; }
#rex-input {
  flex: 1; background: #1e293b; border: 1px solid #374151;
  border-radius: 12px; color: #e5e7eb; padding: 8px 14px;
  font-size: 13.5px; font-family: inherit; resize: none;
  max-height: 120px; line-height: 1.45; outline: none;
  overflow-y: auto;
  transition: border-color 0.15s;
}
#rex-input::placeholder { color: #6b7280; }
#rex-input:focus { border-color: #e94560; }
#rex-send-btn {
  background: #e94560; border: none; color: #fff;
  width: 34px; height: 34px; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0;
  font-size: 16px; transition: opacity 0.15s;
}
#rex-send-btn:hover { opacity: 0.85; }
#rex-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Thinking Indicator ───────────────────── */
.rex-thinking { display: flex; gap: 4px; padding: 10px 14px; }
.rex-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #6b7280; animation: rex-bounce 1.2s infinite;
}
.rex-dot:nth-child(2) { animation-delay: 0.15s; }
.rex-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes rex-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

/* ── Scanning Indicator ───────────────────── */
.rex-scanning {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; color: #9ca3af; font-size: 13px;
}
.rex-spinner {
  width: 16px; height: 16px; border: 2px solid #374151;
  border-top-color: #e94560; border-radius: 50%;
  animation: rex-spin 0.8s linear infinite;
}
@keyframes rex-spin { to { transform: rotate(360deg); } }

/* ── Auth Screen ─────────────────────────── */
#rex-auth {
  display: none; flex-direction: column; align-items: center;
  justify-content: center; flex: 1; padding: 32px 24px; gap: 20px;
}
#rex-auth.visible { display: flex; }
.rex-auth-logo { font-size: 28px; font-weight: 700; color: #e94560; letter-spacing: -0.5px; }
.rex-auth-subtitle {
  font-size: 11px; color: #6b7280; text-transform: uppercase;
  letter-spacing: 0.12em; margin-top: -12px;
}
.rex-auth-card { width: 100%; max-width: 280px; display: flex; flex-direction: column; gap: 10px; }
.rex-auth-input {
  background: #1e293b; border: 1px solid #374151; border-radius: 8px;
  padding: 10px 14px; color: #e5e7eb; font-size: 13.5px;
  font-family: inherit; outline: none; width: 100%;
  transition: border-color 0.15s;
}
.rex-auth-input::placeholder { color: #6b7280; }
.rex-auth-input:focus { border-color: #e94560; }
.rex-auth-btn {
  background: linear-gradient(135deg, #e94560, #0f3460);
  border: none; color: #fff; padding: 10px 16px; border-radius: 8px;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.15s; margin-top: 4px;
}
.rex-auth-btn:hover { opacity: 0.9; }
.rex-auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rex-auth-error { color: #fca5a5; font-size: 12px; text-align: center; display: none; }
.rex-auth-error.visible { display: block; }

/* ── Main UI Wrapper ─────────────────────── */
#rex-main { display: none; flex-direction: column; flex: 1; overflow: hidden; }
#rex-main.visible { display: flex; }
`;

// ── HTML ────────────────────────────────────────────────────────────────────

const PANEL_HTML = /* html */ `
<button id="rex-toggle">R</button>
<div id="rex-panel">
  <div id="rex-resize"></div>

  <!-- Auth Screen -->
  <div id="rex-auth">
    <span class="rex-auth-logo">Rex Lens</span>
    <span class="rex-auth-subtitle">AI Sales Coach</span>
    <div class="rex-auth-card">
      <input type="text" class="rex-auth-input" id="rex-username" placeholder="Username" autocomplete="username">
      <input type="password" class="rex-auth-input" id="rex-password" placeholder="Password" autocomplete="current-password">
      <button class="rex-auth-btn" id="rex-login-btn">Sign In</button>
      <p class="rex-auth-error" id="rex-auth-error"></p>
    </div>
  </div>

  <!-- Main UI (shown after auth) -->
  <div id="rex-main">
    <div id="rex-header">
      <span class="rex-logo">Rex Lens</span>
      <span id="rex-counter">0 tasks</span>
      <button class="rex-hdr-btn" id="rex-logout-btn" title="Sign Out">&#9211;</button>
      <button class="rex-hdr-btn" id="rex-minimize-btn" title="Minimize">&minus;</button>
      <button class="rex-hdr-btn" id="rex-close-btn" title="Close">&times;</button>
    </div>
    <div id="rex-messages"></div>
    <div id="rex-queue">
      <span id="rex-queue-text"></span>
      <button id="rex-continue-btn">Continue</button>
    </div>
    <div id="rex-limit-banner">Daily limit reached — your scripts reset at midnight. Upgrade your plan for a higher limit!</div>
    <div id="rex-pills">
      <button class="rex-pill rex-pill-primary" data-action="scan">Scan My Page</button>
      <button class="rex-pill" data-action="rebuttals">Rebuttals</button>
      <button class="rex-pill" data-action="email">Email Writer</button>
      <button class="rex-pill" data-action="text">Text Writer</button>
      <button class="rex-pill" data-action="phone">Phone Script</button>
    </div>
    <div id="rex-file-previews"></div>
    <div id="rex-input-area">
      <button id="rex-attach-btn" title="Attach file">&#128206;</button>
      <textarea id="rex-input" placeholder="Ask Rex Lens anything..." rows="1"></textarea>
      <button id="rex-send-btn" title="Send">&#10148;</button>
      <input type="file" id="rex-file-input" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv" style="display:none">
    </div>
  </div>
</div>
`;

// ── Panel Class ─────────────────────────────────────────────────────────────

export class RexLensPanel {
  private shadow: ShadowRoot;
  private state: SessionState = { messages: [], taskQueue: [], processedTaskCount: 0 };
  private dailyLimitHit = false;
  private isOpen = false;
  private isSending = false;
  private isAuthenticated = false;
  private attachedFiles: { file: File; dataUrl?: string }[] = [];
  private panelWidth = PANEL_DEFAULT_WIDTH;

  // DOM refs (populated in init)
  private panel!: HTMLElement;
  private toggle!: HTMLElement;
  private authScreen!: HTMLElement;
  private mainUI!: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private counterEl!: HTMLElement;
  private queueEl!: HTMLElement;
  private queueTextEl!: HTMLElement;
  private continueBtn!: HTMLButtonElement;
  private limitBanner!: HTMLElement;
  private filePreviewsEl!: HTMLElement;
  private fileInputEl!: HTMLInputElement;

  constructor() {
    const host = document.createElement('div');
    host.id = 'rex-lens-host';
    document.documentElement.appendChild(host);
    this.shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    this.shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = PANEL_HTML;
    this.shadow.appendChild(wrapper);

    this.bindRefs();
    this.bindEvents();
    this.loadState();
    this.listenForBroadcasts();
    this.checkAuth();
  }

  // ── Refs ────────────────────────────────────────────────────────────────

  private $(id: string): HTMLElement { return this.shadow.getElementById(id)!; }

  private bindRefs() {
    this.panel = this.$('rex-panel');
    this.toggle = this.$('rex-toggle');
    this.authScreen = this.$('rex-auth');
    this.mainUI = this.$('rex-main');
    this.messagesEl = this.$('rex-messages');
    this.inputEl = this.$('rex-input') as HTMLTextAreaElement;
    this.sendBtn = this.$('rex-send-btn') as HTMLButtonElement;
    this.counterEl = this.$('rex-counter');
    this.queueEl = this.$('rex-queue');
    this.queueTextEl = this.$('rex-queue-text');
    this.continueBtn = this.$('rex-continue-btn') as HTMLButtonElement;
    this.limitBanner = this.$('rex-limit-banner');
    this.filePreviewsEl = this.$('rex-file-previews');
    this.fileInputEl = this.$('rex-file-input') as HTMLInputElement;
  }

  // ── Events ──────────────────────────────────────────────────────────────

  private bindEvents() {
    // Toggle
    this.toggle.addEventListener('click', () => this.togglePanel());
    this.$('rex-minimize-btn').addEventListener('click', () => this.closePanel());
    this.$('rex-close-btn').addEventListener('click', () => this.closePanel());

    // Auth
    this.$('rex-login-btn').addEventListener('click', () => this.login());
    this.$('rex-password').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.login();
    });
    this.$('rex-username').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') (this.$('rex-password') as HTMLInputElement).focus();
    });
    this.$('rex-logout-btn').addEventListener('click', () => this.logout());

    // Send
    this.sendBtn.addEventListener('click', () => this.sendChat());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
    });

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
    });

    // Pills
    this.shadow.getElementById('rex-pills')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.rex-pill') as HTMLElement | null;
      if (btn) this.handlePill(btn.dataset.action!);
    });

    // Queue continue
    this.continueBtn.addEventListener('click', () => this.processBatch());

    // File upload
    this.$('rex-attach-btn').addEventListener('click', () => this.fileInputEl.click());
    this.fileInputEl.addEventListener('change', () => {
      if (this.fileInputEl.files) this.handleFiles(this.fileInputEl.files);
      this.fileInputEl.value = '';
    });

    // Resize
    this.initResize();
  }

  // ── Panel Lifecycle ─────────────────────────────────────────────────────

  private togglePanel() { this.isOpen ? this.closePanel() : this.openPanel(); }

  private openPanel() {
    this.isOpen = true;
    this.panel.classList.add('open');
    this.toggle.style.display = 'none';
    this.checkAuth();
    this.scrollToBottom();
    if (this.isAuthenticated) this.inputEl.focus();
  }

  private closePanel() {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.toggle.style.display = 'flex';
  }

  // ── Resize ──────────────────────────────────────────────────────────────

  private initResize() {
    const handle = this.$('rex-resize');
    let startX = 0;
    let startW = 0;

    const onMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newW = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startW + delta));
      this.panelWidth = newW;
      this.panel.style.width = newW + 'px';
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = this.panelWidth;
      handle.classList.add('active');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Messages ────────────────────────────────────────────────────────────

  private appendMessage(role: ChatMsg['role'], content: string) {
    this.state.messages.push({ role, content });

    const div = document.createElement('div');

    if (role === 'system') {
      div.className = 'rex-msg rex-msg-system';
      div.textContent = content;
    } else if (role === 'user') {
      div.className = 'rex-msg rex-msg-user';
      div.textContent = content;
    } else {
      div.className = 'rex-msg rex-msg-ai';
      div.innerHTML = this.renderMarkdown(content);
      // Add copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'rex-copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
      div.appendChild(copyBtn);
    }

    this.messagesEl.appendChild(div);
    this.scrollToBottom();
    this.saveState();
  }

  private showThinking(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'rex-msg rex-msg-ai rex-thinking';
    div.innerHTML = '<span class="rex-dot"></span><span class="rex-dot"></span><span class="rex-dot"></span>';
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
    return div;
  }

  private showScanning(text: string): HTMLElement {
    const div = document.createElement('div');
    div.className = 'rex-msg rex-msg-ai rex-scanning';
    div.innerHTML = `<span class="rex-spinner"></span><span>${this.esc(text)}</span>`;
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
    return div;
  }

  private scrollToBottom() {
    requestAnimationFrame(() => { this.messagesEl.scrollTop = this.messagesEl.scrollHeight; });
  }

  private updateCounter() {
    const count = this.state.processedTaskCount;
    this.counterEl.textContent = count > 0 ? `${count} tasks` : '';
  }

  private showDailyLimit() {
    this.dailyLimitHit = true;
    this.limitBanner.textContent = 'Daily limit reached — your scripts reset at midnight. Upgrade your plan for a higher limit!';
    this.limitBanner.classList.add('visible');
    this.sendBtn.disabled = true;
    this.inputEl.disabled = true;
  }

  // ── Markdown Rendering ──────────────────────────────────────────────────

  private renderMarkdown(text: string): string {
    let html = this.esc(text);
    // Headers (must be before bold)
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // Bold & italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Numbered lists: detect consecutive lines starting with digits
    html = html.replace(/((?:^|\n)\d+\.\s.+(?:\n(?!\d+\.\s).+)*)+/g, (block) => {
      const items = block.trim().split(/\n(?=\d+\.\s)/).map(line => {
        const content = line.replace(/^\d+\.\s/, '').trim();
        return `<li>${content}</li>`;
      });
      return `<ol>${items.join('')}</ol>`;
    });
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    // Single newlines → <br>
    html = html.replace(/\n/g, '<br>');
    // Clean empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    return html;
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  private async sendChat() {
    const text = this.inputEl.value.trim();
    if (!text || this.isSending || this.dailyLimitHit) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // Include attached files info
    let fullText = text;
    if (this.attachedFiles.length > 0) {
      const names = this.attachedFiles.map(f => f.file.name).join(', ');
      fullText += `\n\n[Attached files: ${names}]`;
      this.clearFiles();
    }

    this.appendMessage('user', fullText);

    this.isSending = true;
    this.sendBtn.disabled = true;
    const thinkingEl = this.showThinking();

    try {
      const result = await this.sendToSW({ type: 'CHAT_MESSAGE', payload: { content: fullText } });
      thinkingEl.remove();
      if (result.error?.includes('DAILY_LIMIT') || result.error === 'DAILY_LIMIT') {
        this.showDailyLimit();
      } else if (result.error) {
        this.appendMessage('assistant', `Something went wrong: ${result.error}`);
      } else if (result.reply) {
        this.appendMessage('assistant', result.reply);
      }
    } catch (err: any) {
      thinkingEl.remove();
      if (err.message === 'DAILY_LIMIT') {
        this.showDailyLimit();
      } else {
        this.appendMessage('system', `Error: ${err.message}`);
      }
    } finally {
      this.isSending = false;
      this.sendBtn.disabled = this.dailyLimitHit;
    }
  }

  // ── Pill Handlers ───────────────────────────────────────────────────────

  private handlePill(action: string) {
    switch (action) {
      case 'scan':
        this.scanPage();
        break;
      case 'rebuttals':
        this.inputEl.value = 'The customer said: "';
        this.inputEl.focus();
        this.inputEl.setSelectionRange(this.inputEl.value.length - 1, this.inputEl.value.length - 1);
        break;
      case 'email':
        this.inputEl.value = 'Write a customer email for ';
        this.inputEl.focus();
        break;
      case 'text':
        this.inputEl.value = 'Write a customer text message for ';
        this.inputEl.focus();
        break;
      case 'phone':
        this.inputEl.value = 'Write a phone script opener for ';
        this.inputEl.focus();
        break;
    }
  }

  // ── Scan My Page ────────────────────────────────────────────────────────

  private async scanPage() {
    if (this.isSending || this.dailyLimitHit) return;

    this.isSending = true;
    this.sendBtn.disabled = true;
    this.appendMessage('user', 'Scan My Page');
    const scanEl = this.showScanning('Scanning worklist...');

    try {
      // 1. Tell service worker to prepare adapter + extract page
      const result = await this.sendToSW({ type: 'SCAN_PAGE' });

      if (result.error) {
        scanEl.remove();
        this.appendMessage('system', result.error);
        return;
      }

      const tasks: StructuredTask[] = result.tasks || [];
      const rawText: string = result.rawText || '';

      if (tasks.length === 0 && !rawText) {
        scanEl.remove();
        this.appendMessage('system', 'No tasks found. Make sure you\'re on a worklist page.');
        return;
      }

      // Fresh scan resets the task counter (queue continues don't)
      this.state.processedTaskCount = 0;
      this.state.taskQueue = [];

      const allTasks = tasks;
      const scanSpan = scanEl.querySelector('span:last-child');
      if (scanSpan) scanSpan.textContent = `Found ${allTasks.length} tasks. Generating scripts...`;

      // Store in queue
      this.state.taskQueue = allTasks.slice(MAX_TASKS_PER_BATCH);
      const firstBatch = allTasks.slice(0, MAX_TASKS_PER_BATCH);

      // Process first batch
      const batchResult = await this.sendToSW({
        type: 'SCAN_BATCH',
        payload: { tasks: firstBatch, rawText: tasks.length === 0 ? rawText : '' },
      });

      scanEl.remove();

      if (batchResult.error?.includes('DAILY_LIMIT') || batchResult.error === 'DAILY_LIMIT') {
        this.showDailyLimit();
      } else if (batchResult.error) {
        this.appendMessage('system', `Scan failed: ${batchResult.error}`);
      } else {
        this.state.processedTaskCount += firstBatch.length;
        this.updateCounter();
        this.appendMessage('assistant', batchResult.reply || 'No scripts generated.');
      }

      // Show queue status if tasks remain
      this.updateQueueStatus();

    } catch (err: any) {
      scanEl.remove();
      if (err.message === 'DAILY_LIMIT') {
        this.showDailyLimit();
      } else {
        this.appendMessage('system', `Scan error: ${err.message}`);
      }
    } finally {
      this.isSending = false;
      this.sendBtn.disabled = this.dailyLimitHit;
      this.saveState();
    }
  }

  // ── Batch Processing ────────────────────────────────────────────────────

  private async processBatch() {
    if (this.state.taskQueue.length === 0 || this.isSending || this.dailyLimitHit) return;

    this.isSending = true;
    this.continueBtn.disabled = true;
    const thinkingEl = this.showScanning('Processing next batch...');

    try {
      const batch = this.state.taskQueue.slice(0, MAX_TASKS_PER_BATCH);
      this.state.taskQueue = this.state.taskQueue.slice(MAX_TASKS_PER_BATCH);

      const result = await this.sendToSW({
        type: 'SCAN_BATCH',
        payload: { tasks: batch, rawText: '' },
      });

      thinkingEl.remove();

      if (result.error?.includes('DAILY_LIMIT') || result.error === 'DAILY_LIMIT') {
        // Put batch back in queue so they can resume tomorrow
        this.state.taskQueue = [...batch, ...this.state.taskQueue];
        this.showDailyLimit();
      } else if (result.error) {
        this.appendMessage('system', `Batch failed: ${result.error}`);
      } else {
        this.state.processedTaskCount += batch.length;
        this.updateCounter();
        this.appendMessage('assistant', result.reply || 'No scripts generated.');
      }

      this.updateQueueStatus();
    } catch (err: any) {
      thinkingEl.remove();
      if (err.message === 'DAILY_LIMIT') {
        this.showDailyLimit();
      } else {
        this.appendMessage('system', `Batch error: ${err.message}`);
      }
    } finally {
      this.isSending = false;
      this.continueBtn.disabled = false;
      this.sendBtn.disabled = this.dailyLimitHit;
      this.saveState();
    }
  }

  private updateQueueStatus() {
    if (this.state.taskQueue.length > 0) {
      const shown = this.state.processedTaskCount;
      const total = shown + this.state.taskQueue.length;
      this.queueTextEl.textContent = `Showing ${shown} of ${total} tasks. ${this.state.taskQueue.length} remaining in queue.`;
      this.queueEl.classList.add('visible');
    } else {
      this.queueEl.classList.remove('visible');
    }
  }

  // ── File Upload ─────────────────────────────────────────────────────────

  private handleFiles(files: FileList) {
    for (const file of files) {
      const entry: { file: File; dataUrl?: string } = { file };

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          entry.dataUrl = reader.result as string;
          this.renderFilePreviews();
        };
        reader.readAsDataURL(file);
      }

      this.attachedFiles.push(entry);
    }
    this.renderFilePreviews();
  }

  private renderFilePreviews() {
    this.filePreviewsEl.innerHTML = '';
    if (this.attachedFiles.length === 0) {
      this.filePreviewsEl.classList.remove('visible');
      return;
    }
    this.filePreviewsEl.classList.add('visible');

    this.attachedFiles.forEach((entry) => {
      const thumb = document.createElement('div');
      thumb.className = 'rex-file-thumb';

      if (entry.dataUrl) {
        thumb.innerHTML = `<img src="${entry.dataUrl}" alt="${this.esc(entry.file.name)}">`;
      } else {
        const ext = entry.file.name.split('.').pop() || '?';
        thumb.innerHTML = `<div class="rex-file-icon">${this.esc(ext.toUpperCase())}</div>`;
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'rex-file-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', () => {
        const idx = this.attachedFiles.indexOf(entry);
        if (idx !== -1) this.attachedFiles.splice(idx, 1);
        this.renderFilePreviews();
      });
      thumb.appendChild(removeBtn);
      this.filePreviewsEl.appendChild(thumb);
    });
  }

  private clearFiles() {
    this.attachedFiles = [];
    this.filePreviewsEl.innerHTML = '';
    this.filePreviewsEl.classList.remove('visible');
  }

  // ── Service Worker Communication ────────────────────────────────────────

  private sendToSW(message: any): Promise<any> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ error: 'Request timed out (60s). Try again.' });
      }, 60_000);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message || 'Service worker unavailable' });
            return;
          }
          resolve(response || { error: 'No response from service worker' });
        });
      } catch (err: any) {
        clearTimeout(timeout);
        resolve({ error: err.message || 'Failed to send message' });
      }
    });
  }

  private listenForBroadcasts() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'AUTH_STATE') {
        this.handleAuthState(message.payload);
      } else if (message.type === 'TOGGLE_PANEL') {
        this.togglePanel();
      }
    });
  }

  // ── Session Persistence ─────────────────────────────────────────────────

  private async saveState() {
    try {
      await chrome.storage.session.set({ rexPanelState: this.state });
    } catch { /* quota exceeded or not available */ }
  }

  private async loadState() {
    try {
      const data = await chrome.storage.session.get('rexPanelState');
      if (data.rexPanelState) {
        this.state = data.rexPanelState;
        // Restore messages
        for (const msg of this.state.messages) {
          const div = document.createElement('div');
          if (msg.role === 'system') {
            div.className = 'rex-msg rex-msg-system';
            div.textContent = msg.content;
          } else if (msg.role === 'user') {
            div.className = 'rex-msg rex-msg-user';
            div.textContent = msg.content;
          } else {
            div.className = 'rex-msg rex-msg-ai';
            div.innerHTML = this.renderMarkdown(msg.content);
            const copyBtn = document.createElement('button');
            copyBtn.className = 'rex-copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(msg.content);
              copyBtn.textContent = 'Copied!';
              setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
            });
            div.appendChild(copyBtn);
          }
          this.messagesEl.appendChild(div);
        }
        this.updateCounter();
        this.updateQueueStatus();
        this.scrollToBottom();
      }
    } catch { /* not available */ }
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  private async checkAuth() {
    const state = await this.sendToSW({ type: 'GET_AUTH_STATE' });
    this.handleAuthState(state);
  }

  private handleAuthState(state: any) {
    if (state?.authenticated && state?.hasAccess) {
      this.isAuthenticated = true;
      this.authScreen.classList.remove('visible');
      this.mainUI.classList.add('visible');
    } else {
      this.isAuthenticated = false;
      this.authScreen.classList.add('visible');
      this.mainUI.classList.remove('visible');
    }
  }

  private usernameToEmail(input: string): string {
    const trimmed = input.trim().toLowerCase();
    return trimmed.includes('@') ? trimmed : `${trimmed}@pocketrep.app`;
  }

  private async login() {
    const usernameEl = this.$('rex-username') as HTMLInputElement;
    const passwordEl = this.$('rex-password') as HTMLInputElement;
    const loginBtn = this.$('rex-login-btn') as HTMLButtonElement;
    const errorEl = this.$('rex-auth-error');

    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    if (!username || !password) {
      errorEl.textContent = 'Enter your username and password.';
      errorEl.classList.add('visible');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    errorEl.classList.remove('visible');

    const result = await this.sendToSW({
      type: 'AUTH_LOGIN',
      payload: { email: this.usernameToEmail(username), password },
    });

    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';

    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.classList.add('visible');
      return;
    }

    this.handleAuthState(result.authState);
  }

  private async logout() {
    await this.sendToSW({ type: 'AUTH_LOGOUT' });
    this.handleAuthState({ authenticated: false });
    // Clear chat state
    this.state = { messages: [], taskQueue: [], processedTaskCount: 0 };
    this.dailyLimitHit = false;
    this.messagesEl.innerHTML = '';
    this.updateCounter();
    this.updateQueueStatus();
    this.saveState();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private esc(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
// Only create panel on the top frame

export function initPanel() {
  if (window === window.top) {
    new RexLensPanel();
  }
}
