import { getSupabase } from '../shared/supabase';
import { buildScreenAnalysisPrompt, buildChatPrompt, REX_MODEL, ANTHROPIC_API_URL, stripSensitiveData } from '../shared/prompts';
import type { Contact, Profile, PageContent, RexSuggestion, AuthState } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';

// ── State ────────────────────────────────────────────────────────────────────

let authState: AuthState = { authenticated: false, profile: null, hasAccess: false };
let contacts: Contact[] = [];
let lastPageContent: PageContent | null = null;
let lastSuggestions: RexSuggestion | null = null;
let chatHistory: { role: string; content: string }[] = [];
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 10_000; // 10 second minimum between scans
let anthropicKey = '';

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Load API key from storage
  const stored = await chrome.storage.local.get(['anthropic_key']);
  anthropicKey = stored.anthropic_key || '';

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

  const hasAccess = profile?.plan === 'elite' && (profile?.rex_lens_active !== false);

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

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
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

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: REX_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: recentHistory.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  const json = await res.json();
  const reply = json.content?.[0]?.text ?? 'Rex hit an error. Check your API key.';

  chatHistory.push({ role: 'assistant', content: reply });

  return reply;
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

    case 'SET_API_KEY': {
      anthropicKey = message.payload.key;
      await chrome.storage.local.set({ anthropic_key: anthropicKey });
      return { success: true };
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

      if (!anthropicKey) {
        return { error: 'API key not configured. Set it in Rex Lens settings.' };
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

    case 'CHAT_MESSAGE': {
      if (!authState.hasAccess) return { error: 'Rex Lens requires Elite plan.' };
      if (!anthropicKey) return { error: 'API key not configured.' };

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
