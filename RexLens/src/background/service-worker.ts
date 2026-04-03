import { getSupabase } from '../shared/supabase';
import { buildScreenAnalysisPrompt, buildChatPrompt, buildMiniSummaryPrompt, buildDeepScanAnalysisPrompt, REX_MODEL, AI_PROXY_URL, stripSensitiveData } from '../shared/prompts';
import type { Contact, Profile, PageContent, RexSuggestion, AuthState, ContactSummary, ContactActionPlan, DeepScanResult } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';

// ── State ────────────────────────────────────────────────────────────────────

let authState: AuthState = { authenticated: false, profile: null, hasAccess: false };
let contacts: Contact[] = [];
let lastPageContent: PageContent | null = null;
let lastSuggestions: RexSuggestion | null = null;
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
      contacts = [];
    }
    broadcastAuthState();
  });
}

async function loadProfile(userId: string) {
  const supabase = getSupabase();

  const [profileRes, contactsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('contacts').select('*').eq('user_id', userId).order('last_name'),
  ]);

  const profile = profileRes.data as Profile | null;
  contacts = (contactsRes.data as Contact[]) || [];

  const hasAccess =
    profile?.plan === 'rex_lens_standalone' ||
    profile?.plan === 'elite_bundle' ||
    (profile?.plan === 'elite' && profile?.rex_lens_active !== false);

  authState = {
    authenticated: true,
    profile,
    hasAccess,
  };
}

function broadcastAuthState() {
  chrome.runtime.sendMessage({ type: 'AUTH_STATE', payload: authState }).catch(() => {});
}

// ── Contact Matching ─────────────────────────────────────────────────────────

function fuzzyMatch(a: string, b: string): boolean {
  return a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
}

function matchContacts(page: PageContent): Contact[] {
  const matched: Contact[] = [];

  for (const contact of contacts) {
    const fullName = `${contact.first_name} ${contact.last_name}`.trim();

    // Match by name
    for (const name of page.contactNames) {
      if (fuzzyMatch(name, fullName) || fuzzyMatch(name, contact.first_name) || fuzzyMatch(name, contact.last_name)) {
        matched.push(contact);
        break;
      }
    }

    // Match by email
    if (contact.email) {
      for (const email of page.emails) {
        if (email.toLowerCase() === contact.email.toLowerCase()) {
          if (!matched.includes(contact)) matched.push(contact);
          break;
        }
      }
    }

    // Match by phone
    if (contact.phone) {
      const cleanContactPhone = contact.phone.replace(/\D/g, '');
      for (const phone of page.phones) {
        const cleanPagePhone = phone.replace(/\D/g, '');
        if (cleanContactPhone === cleanPagePhone || cleanContactPhone.endsWith(cleanPagePhone) || cleanPagePhone.endsWith(cleanContactPhone)) {
          if (!matched.includes(contact)) matched.push(contact);
          break;
        }
      }
    }
  }

  return matched.slice(0, 3); // Max 3 matched contacts for context
}

// ── AI Calls ─────────────────────────────────────────────────────────────────

async function analyzePageWithAI(page: PageContent): Promise<RexSuggestion> {
  const matchedContacts = matchContacts(page);
  const cleanedPage = {
    ...page,
    mainText: stripSensitiveData(page.mainText),
    conversations: page.conversations.map(stripSensitiveData),
  };

  const systemPrompt = buildScreenAnalysisPrompt(
    authState.profile?.full_name || '',
    cleanedPage,
    matchedContacts,
  );

  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: REX_MODEL,
      max_tokens: 600,
      system: 'Respond only with valid JSON. No markdown fences.',
      messages: [{ role: 'user', content: systemPrompt }],
    }),
  });

  const json = await res.json();
  const text = json.content?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(text);
    return {
      situation: parsed.situation || 'Could not analyze page.',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      draftResponse: parsed.draftResponse || null,
      followUp: parsed.followUp || null,
      matchedContact: matchedContacts[0] || null,
    };
  } catch {
    // If JSON parsing fails, extract what we can
    return {
      situation: text.slice(0, 200) || 'Analysis complete but response was not structured.',
      suggestions: ['Review the page content manually'],
      draftResponse: null,
      followUp: null,
      matchedContact: matchedContacts[0] || null,
    };
  }
}

async function chatWithRex(userMessage: string): Promise<string> {
  const pageContext = lastPageContent
    ? `Page: ${lastPageContent.title} (${lastPageContent.type})\n${lastPageContent.mainText.slice(0, 1000)}`
    : 'No page scanned yet.';

  const suggestionsContext = lastSuggestions
    ? `Situation: ${lastSuggestions.situation}\nSuggestions: ${lastSuggestions.suggestions.join(', ')}`
    : 'No suggestions yet.';

  const systemPrompt = buildChatPrompt(
    authState.profile?.full_name || '',
    pageContext,
    suggestionsContext,
  );

  chatHistory.push({ role: 'user', content: userMessage });

  // Keep last 10 messages for context
  const recentHistory = chatHistory.slice(-10);

  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: REX_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: recentHistory.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  const json = await res.json();
  const reply = json.content?.[0]?.text ?? 'Rex hit an error. Try again.';

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

  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: REX_MODEL,
      max_tokens: 150,
      system: 'Respond with exactly 3 lines of plain text. No JSON, no markdown.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const json = await res.json();
  return json.content?.[0]?.text ?? 'Could not summarize this contact.';
}

async function analyzeDeepScan(summaries: ContactSummary[]): Promise<DeepScanResult> {
  const prompt = buildDeepScanAnalysisPrompt(
    summaries.map(s => ({ name: s.name, summary: s.summary }))
  );

  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: REX_MODEL,
      max_tokens: 2000,
      system: 'Respond only with valid JSON. No markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const json = await res.json();
  const text = json.content?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(text);
    const contacts: ContactActionPlan[] = Array.isArray(parsed.contacts)
      ? parsed.contacts
      : [];

    return {
      contacts,
      scannedCount: summaries.length,
      totalFound: summaries.length,
    };
  } catch {
    // Fallback: create minimal action plans from summaries
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

async function runDeepScan(tabId: number): Promise<DeepScanResult> {
  isDeepScanning = true;
  deepScanCancelled = false;
  deepScanResults = [];
  const scanStart = Date.now();

  try {
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
      contacts = [];
      chatHistory = [];
      lastPageContent = null;
      lastSuggestions = null;
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
        return { error: 'Rex Lens requires an Elite plan with Rex Lens add-on.' };
      }

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab found.' };

      // Broadcast scanning status
      chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'scanning' } }).catch(() => {});

      // Extract page content from content script
      let pageContent: PageContent;
      try {
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
        const suggestions = await analyzePageWithAI(pageContent);
        lastSuggestions = suggestions;
        chatHistory = []; // Reset chat on new scan

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'ready' } }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'SUGGESTIONS_READY', payload: suggestions }).catch(() => {});

        // Update badge
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#10B981' });

        return { success: true, suggestions };
      } catch (err: any) {
        chrome.runtime.sendMessage({ type: 'STATUS', payload: { status: 'error', message: err.message } }).catch(() => {});
        return { error: `AI analysis failed: ${err.message}` };
      }
    }

    case 'DEEP_SCAN': {
      if (isDeepScanning) return { error: 'Deep scan already in progress.' };
      if (!authState.hasAccess) return { error: 'Rex Lens requires an Elite plan with Rex Lens add-on.' };

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab found.' };

      broadcast({ type: 'STATUS', payload: { status: 'scanning', message: 'Deep scanning...' } });

      try {
        const deepResult = await runDeepScan(tab.id);
        broadcast({ type: 'STATUS', payload: { status: 'ready' } });
        broadcast({ type: 'DEEP_SCAN_COMPLETE', payload: deepResult });

        // Also store as part of suggestions for persistence
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
      if (!authState.hasAccess) return { error: 'Rex Lens requires Elite plan.' };

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

    case 'GET_LAST_SUGGESTIONS': {
      return { suggestions: lastSuggestions, pageContent: lastPageContent };
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
