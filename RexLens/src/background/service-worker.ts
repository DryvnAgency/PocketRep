import { getSupabase, SUPABASE_ANON_KEY } from '../shared/supabase';
import { buildPageScanPrompt, buildChatPrompt, buildMiniSummaryPrompt, buildDeepScanAnalysisPrompt, REX_MODEL, AI_PROXY_URL, stripSensitiveData } from '../shared/prompts';
import type { Profile, PageContent, ScanResult, ScanItem, AuthState, ContactSummary, ContactActionPlan, DeepScanResult } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';

// ── State ────────────────────────────────────────────────────────────────────

let authState: AuthState = { authenticated: false, profile: null, hasAccess: false };
let lastPageContent: PageContent | null = null;
let lastScanResult: ScanResult | null = null;
let chatHistory: { role: string; content: string }[] = [];
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 10_000; // 10 second minimum between scans

// Deep scan state
let isDeepScanning = false;
let deepScanCancelled = false;
let deepScanResults: ContactSummary[] = [];

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Try to restore auth session
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await loadProfile(session.user.id);
  }

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await loadProfile(session.user.id);
    } else {
      authState = { authenticated: false, profile: null, hasAccess: false };
    }
    broadcastAuthState();
  });
}

async function loadProfile(userId: string) {
  const supabase = getSupabase();
  const profileRes = await supabase.from('profiles').select('*').eq('id', userId).single();
  const profile = profileRes.data as Profile | null;

  // TODO: Add proper plan gating before launch (e.g. check subscription status)
  // For now, any authenticated Rex Lens user has access
  const hasAccess = true;

  authState = {
    authenticated: true,
    profile,
    hasAccess,
  };
}

function broadcastAuthState() {
  chrome.runtime.sendMessage({ type: 'AUTH_STATE', payload: authState }).catch(() => {});
}

// ── Content Script Injection Fallback ────────────────────────────────────────

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
  } catch {
    // Content script not loaded — inject it programmatically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content-script.js'],
    });
    // Brief wait for the script to initialize
    await new Promise(r => setTimeout(r, 200));
  }
}

// ── AI Auth Header Helper ───────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// ── AI Calls ─────────────────────────────────────────────────────────────────

/** Call the AI proxy and extract the text response, with full error diagnostics. */
async function callAIProxy(body: Record<string, unknown>): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json();

  // Anthropic error response: { type: "error", error: { type: "...", message: "..." } }
  if (json.type === 'error' || json.error) {
    const msg = json.error?.message || json.error?.type || JSON.stringify(json.error || json);
    throw new Error(`Anthropic API error: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`AI proxy returned ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }

  const text = json.content?.[0]?.text;
  if (text === undefined || text === null) {
    console.error('[Rex Lens] Unexpected AI proxy response:', JSON.stringify(json).slice(0, 500));
    throw new Error(`Unexpected AI response format: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return text;
}

async function analyzePageWithAI(page: PageContent): Promise<ScanResult> {
  const cleanedPage = {
    ...page,
    mainText: stripSensitiveData(page.mainText),
    conversations: page.conversations.map(stripSensitiveData),
  };

  const systemPrompt = buildPageScanPrompt(
    authState.profile?.full_name || '',
    cleanedPage,
  );

  const text = await callAIProxy({
    model: REX_MODEL,
    max_tokens: 2000,
    system: 'Respond only with valid JSON. No markdown fences.',
    messages: [{ role: 'user', content: systemPrompt }],
  });

  // Strip markdown fences if the model wrapped it anyway
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const items: ScanItem[] = Array.isArray(parsed.items) ? parsed.items : [];
    return { items };
  } catch {
    // If JSON parsing fails, return a single item with the raw text
    return {
      items: [{
        name: 'Page Analysis',
        taskType: 'followup',
        product: '',
        urgency: 'medium' as const,
        context: text.slice(0, 300) || 'Analysis complete but response was not structured.',
        script: '',
        dismiss: false,
      }],
    };
  }
}

async function chatWithRex(userMessage: string): Promise<string> {
  const pageContext = lastPageContent
    ? `Page: ${lastPageContent.title} (${lastPageContent.type})\n${lastPageContent.mainText.slice(0, 1000)}`
    : 'No page scanned yet.';

  const scanContext = lastScanResult && lastScanResult.items.length > 0
    ? lastScanResult.items.map((item, i) =>
      `#${i + 1} ${item.name} [${item.taskType.toUpperCase()}] — ${item.context}${item.script ? `\nScript: ${item.script.slice(0, 200)}` : ''}`
    ).join('\n\n')
    : 'No scan results yet.';

  const systemPrompt = buildChatPrompt(
    authState.profile?.full_name || '',
    pageContext,
    scanContext,
  );

  chatHistory.push({ role: 'user', content: userMessage });

  // Keep last 10 messages for context
  const recentHistory = chatHistory.slice(-10);

  const reply = await callAIProxy({
    model: REX_MODEL,
    max_tokens: 600,
    system: systemPrompt,
    messages: recentHistory.map(m => ({ role: m.role, content: m.content })),
  });

  chatHistory.push({ role: 'assistant', content: reply });

  return reply;
}

// ── Deep Scan AI ────────────────────────────────────────────────────────────

async function miniSummarize(pageContent: PageContent): Promise<string> {
  const cleanedText = stripSensitiveData(pageContent.mainText) +
    (pageContent.conversations.length > 0
      ? '\n\nConversations:\n' + pageContent.conversations.map(stripSensitiveData).join('\n---\n')
      : '');
  const prompt = buildMiniSummaryPrompt(cleanedText);

  return await callAIProxy({
    model: REX_MODEL,
    max_tokens: 150,
    system: 'Respond with exactly 4 lines of plain text. No JSON, no markdown.',
    messages: [{ role: 'user', content: prompt }],
  });
}

async function analyzeDeepScan(summaries: ContactSummary[]): Promise<DeepScanResult> {
  const prompt = buildDeepScanAnalysisPrompt(
    summaries.map(s => ({ name: s.name, summary: s.summary }))
  );

  const text = await callAIProxy({
    model: REX_MODEL,
    max_tokens: 2000,
    system: 'Respond only with valid JSON. No markdown fences.',
    messages: [{ role: 'user', content: prompt }],
  });

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const contacts: ContactActionPlan[] = Array.isArray(parsed.contacts)
      ? parsed.contacts
      : [];

    return {
      contacts,
      scannedCount: summaries.length,
      totalFound: summaries.length,
    };
  } catch {
    return {
      contacts: summaries.map(s => ({
        name: s.name,
        summary: s.summary,
        text: '',
        email: { subject: '', body: '' },
        callScript: '',
        book: 'Analysis failed — review manually',
      })),
      scannedCount: summaries.length,
      totalFound: summaries.length,
    };
  }
}

const DEEP_SCAN_TIMEOUT_MS = 60_000; // 60-second total timeout

/** Auto deep scan: silently checks for clickable contacts and runs deep scan if found. */
async function autoDeepScan(tabId: number): Promise<void> {
  try {
    await ensureContentScript(tabId);
    const clickable = await chrome.tabs.sendMessage(tabId, { type: 'FIND_CLICKABLE' });
    if (!Array.isArray(clickable) || clickable.length === 0) return; // No contacts — skip silently

    // Contacts found — trigger deep scan in background
    broadcast({ type: 'AUTO_DEEP_SCAN_START' });
    const deepResult = await runDeepScan(tabId);
    broadcast({ type: 'DEEP_SCAN_COMPLETE', payload: deepResult });

    if (lastScanResult) {
      lastScanResult.deepScan = deepResult;
    }
  } catch {
    // Auto deep scan is best-effort — don't surface errors
  }
}

async function runDeepScan(tabId: number): Promise<DeepScanResult> {
  isDeepScanning = true;
  deepScanCancelled = false;
  deepScanResults = [];
  const scanStart = Date.now();

  try {
    // Ensure content script is loaded before deep scan
    await ensureContentScript(tabId);

    // Step 1: Find clickable contacts on the page
    const clickableContacts = await chrome.tabs.sendMessage(tabId, { type: 'FIND_CLICKABLE' });
    if (!Array.isArray(clickableContacts) || clickableContacts.length === 0) {
      throw new Error('No clickable contacts found on this page.');
    }

    const total = clickableContacts.length;

    // Broadcast found count
    broadcast({ type: 'DEEP_SCAN_PROGRESS', payload: { current: 0, total, name: 'Starting...' } });

    // Step 2: Click into each contact, extract, and mini-summarize
    for (let i = 0; i < total; i++) {
      if (deepScanCancelled) break;
      if (Date.now() - scanStart > DEEP_SCAN_TIMEOUT_MS) {
        broadcast({ type: 'DEEP_SCAN_PROGRESS', payload: { current: i, total, name: 'Timeout — analyzing what we have...' } });
        break;
      }

      const contact = clickableContacts[i];
      broadcast({ type: 'DEEP_SCAN_PROGRESS', payload: { current: i + 1, total, name: contact.name } });

      try {
        const result = await chrome.tabs.sendMessage(tabId, {
          type: 'CLICK_AND_EXTRACT',
          payload: { selector: contact.selector },
        });

        if (result.success && result.content) {
          const summary = await miniSummarize(result.content);
          deepScanResults.push({
            name: contact.name,
            summary,
            sourceUrl: result.content.url || '',
          });
        } else {
          deepScanResults.push({
            name: contact.name,
            summary: 'Could not extract — page may require manual navigation.',
            sourceUrl: '',
          });
        }
      } catch {
        deepScanResults.push({
          name: contact.name,
          summary: 'Extraction failed — contact may not have a detail page.',
          sourceUrl: '',
        });
      }

      // 500ms pause between navigations
      if (i < total - 1 && !deepScanCancelled) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Step 3: Analyze all summaries with final AI call (skip if nothing gathered)
    if (deepScanResults.length === 0) {
      return { contacts: [], scannedCount: 0, totalFound: total };
    }

    broadcast({ type: 'STATUS', payload: { status: 'analyzing', message: 'Generating action plans...' } });
    const result = await analyzeDeepScan(deepScanResults);
    result.totalFound = total;

    return result;
  } finally {
    isDeepScanning = false;
  }
}

function broadcast(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage & { type: string }, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Keep channel open for async
  }
);

async function handleMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'AUTH_LOGIN': {
      const { email, password } = message.payload;
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        await loadProfile(data.user.id);
        broadcastAuthState();
      }
      return { success: true, authState };
    }

    case 'AUTH_LOGOUT': {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      authState = { authenticated: false, profile: null, hasAccess: false };
      chatHistory = [];
      lastPageContent = null;
      lastScanResult = null;
      broadcastAuthState();
      return { success: true };
    }

    case 'GET_AUTH_STATE': {
      return authState;
    }

    case 'ANALYZE_PAGE': {
      // Rate limiting
      const now = Date.now();
      if (now - lastScanTime < SCAN_COOLDOWN_MS) {
        const wait = Math.ceil((SCAN_COOLDOWN_MS - (now - lastScanTime)) / 1000);
        return { error: `Please wait ${wait}s before scanning again.` };
      }

      if (!authState.hasAccess) {
        return { error: 'Sign in to Rex Lens to use this feature.' };
      }

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab found.' };

      // Broadcast scanning status
      chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'scanning' } }).catch(() => {});

      // Ensure content script is loaded, inject if needed
      let pageContent: PageContent;
      try {
        await ensureContentScript(tab.id);
        pageContent = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE' });
      } catch {
        return { error: 'Content script not loaded. Try refreshing the page.' };
      }

      lastPageContent = pageContent;
      lastScanTime = Date.now();

      // Broadcast analyzing status
      chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'analyzing' } }).catch(() => {});

      // Analyze with AI
      try {
        const scanResult = await analyzePageWithAI(pageContent);
        lastScanResult = scanResult;
        chatHistory = []; // Reset chat on new scan

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'ready' } }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'SCAN_RESULTS', payload: scanResult }).catch(() => {});

        // Update badge
        const itemCount = scanResult.items.filter(i => !i.dismiss).length;
        chrome.action.setBadgeText({ text: itemCount > 0 ? String(itemCount) : '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#10B981' });

        // Auto deep scan: check for clickable contacts in the background
        if (!isDeepScanning) {
          autoDeepScan(tab.id).catch(() => {});
        }

        return { success: true, scanResult };
      } catch (err: any) {
        chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'error', message: err.message } }).catch(() => {});
        return { error: `AI analysis failed: ${err.message}` };
      }
    }

    case 'DEEP_SCAN': {
      if (isDeepScanning) return { error: 'Deep scan already in progress.' };
      if (!authState.hasAccess) return { error: 'Sign in to Rex Lens to use this feature.' };

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab found.' };

      broadcast({ type: 'STATUS', payload: { status: 'scanning', message: 'Deep scanning...' } });

      try {
        const deepResult = await runDeepScan(tab.id);
        broadcast({ type: 'STATUS', payload: { status: 'ready' } });
        broadcast({ type: 'DEEP_SCAN_COMPLETE', payload: deepResult });

        if (lastSuggestions) {
          lastSuggestions.deepScan = deepResult;
        }

        return { success: true, deepScan: deepResult };
      } catch (err: any) {
        broadcast({ type: 'STATUS', payload: { status: 'error', message: err.message } });
        return { error: `Deep scan failed: ${err.message}` };
      }
    }

    case 'CANCEL_DEEP_SCAN': {
      deepScanCancelled = true;
      return { ok: true };
    }

    case 'CHAT_MESSAGE': {
      if (!authState.hasAccess) return { error: 'Sign in to Rex Lens to use this feature.' };

      try {
        const reply = await chatWithRex(message.payload.content);
        return { reply };
      } catch (err: any) {
        return { error: `Chat failed: ${err.message}` };
      }
    }

    case 'CONFIRM_INSERT': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab.' };

      try {
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: 'INSERT_TEXT',
          payload: message.payload,
        });
        return result;
      } catch {
        return { error: 'Could not insert text. Try refreshing the page.' };
      }
    }

    case 'HIGHLIGHT_FIELD': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab.' };

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'HIGHLIGHT_FIELD',
          payload: message.payload,
        });
        return { ok: true };
      } catch {
        return { error: 'Content script not loaded.' };
      }
    }

    case 'DETECT_FIELDS': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab.' };

      try {
        const fields = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FIELDS' });
        return { fields };
      } catch {
        return { error: 'Content script not loaded.' };
      }
    }

    case 'SCROLL': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return {};
      await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL', payload: message.payload }).catch(() => {});
      return { ok: true };
    }

    case 'GET_LAST_SCAN': {
      return { scanResult: lastScanResult, pageContent: lastPageContent };
    }

    case 'CONTENT_SCRIPT_READY': {
      // Content script loaded — no action needed
      return { ok: true };
    }

    default:
      return {};
  }
}

// ── Keyboard Shortcut ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === 'scan-page') {
    chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' }).catch(() => {});
  }
});

// ── Side Panel Behavior ──────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id! });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Init on install / startup ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  init();
});

chrome.runtime.onStartup.addListener(() => {
  init();
});

// Init immediately too
init();
