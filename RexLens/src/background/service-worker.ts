import { getSupabase, SUPABASE_ANON_KEY } from '../shared/supabase';
import { buildPageScanPrompt, buildChatSystemPrompt, buildDeepReviewSummaryPrompt, buildDeepReviewGamePlanPrompt, REX_MODEL, HAIKU_MODEL, AI_PROXY_URL, stripSensitiveData } from '../shared/prompts';
import type { Profile, PageContent, AuthState, DeepReviewLead, DeepReviewResult } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';

// ── State ────────────────────────────────────────────────────────────────────

let authState: AuthState = { authenticated: false, profile: null, hasAccess: false };
let cachedPageContent: PageContent | null = null;
let cachedPageSummary: string | null = null; // Haiku-generated compact summary
let chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];

// Deep review (agent mode) state
let isDeepReviewing = false;
let deepReviewCancelled = false;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await loadProfile(session.user.id);
  }

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
  const hasAccess = true;
  authState = { authenticated: true, profile, hasAccess };
}

function broadcastAuthState() {
  chrome.runtime.sendMessage({ type: 'AUTH_STATE', payload: authState }).catch(() => {});
}

// ── Content Script Injection Fallback ────────────────────────────────────────

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_SCRIPT_READY' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content-script.js'],
    });
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

async function callAIProxy(body: Record<string, unknown>): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`AI proxy returned ${res.status} with non-JSON response`);
  }

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

// ── Silent Page Context Extraction + Haiku Pre-Scan ─────────────────────────

async function extractPageContext(): Promise<PageContent | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    await ensureContentScript(tab.id);
    const content: PageContent = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE' });
    if (content && content.mainText) {
      cachedPageContent = content;
      // Run Haiku pre-scan in background — don't block the UI
      runHaikuPageScan(content).catch(() => {});
    }
    return content;
  } catch {
    return null;
  }
}

/** Use Haiku to create a compact page summary. Cheap (~$0.003) and fast. */
async function runHaikuPageScan(page: PageContent): Promise<void> {
  if (!authState.hasAccess) return;
  if (page.mainText.length < 50) return;

  const cleanedPage: PageContent = {
    ...page,
    mainText: stripSensitiveData(page.mainText),
    conversations: page.conversations.map(stripSensitiveData),
  };

  try {
    const summary = await callAIProxy({
      model: HAIKU_MODEL,
      max_tokens: 1000,
      system: 'Respond with concise plain text. No JSON, no markdown fences.',
      messages: [{ role: 'user', content: buildPageScanPrompt(cleanedPage) }],
    });
    cachedPageSummary = summary;
  } catch {
    // Scan failed — Sonnet will work without it, just with less context
    cachedPageSummary = null;
  }
}

// ── Chat ────────────────────────────────────────────────────────────────────

async function chatWithRex(userMessage: string): Promise<string> {
  // Use the Haiku pre-scan summary for Sonnet context (much cheaper than raw page text)
  const systemPrompt = buildChatSystemPrompt(
    authState.profile?.full_name || '',
    cachedPageSummary,
  );

  chatHistory.push({ role: 'user', content: userMessage });
  const recentHistory = chatHistory.slice(-20);

  let reply: string;
  try {
    reply = await callAIProxy({
      model: REX_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: recentHistory.map(m => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    chatHistory.pop();
    throw err;
  }

  chatHistory.push({ role: 'assistant', content: reply });
  return reply;
}

// ── Deep Review Intent Detection ────────────────────────────────────────────

const DEEP_REVIEW_PATTERNS = [
  /\b(deep\s*review|game\s*plan|review\s*(my|the|this)?\s*worklist|review\s*(my|the|this)?\s*leads|analyze\s*(my|the|this)?\s*(worklist|leads|pipeline))\b/i,
  /\b(click\s*into\s*(each|every|all)\s*(lead|contact)|go\s*through\s*(my|the|each)\s*(leads|contacts|worklist))\b/i,
];

function isDeepReviewIntent(message: string): boolean {
  return DEEP_REVIEW_PATTERNS.some(p => p.test(message));
}

// ── Deep Review (Agent Mode) ────────────────────────────────────────────────

const MAX_DEEP_REVIEW_LEADS = 30;

async function sendToContentScript(tabId: number, message: any): Promise<any> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content-script.js'],
    });
    await new Promise(r => setTimeout(r, 500));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function runDeepReview(tabId: number): Promise<DeepReviewResult> {
  isDeepReviewing = true;
  deepReviewCancelled = false;

  try {
    // First, do a quick page analysis with Haiku to identify leads
    if (!cachedPageContent || cachedPageContent.mainText.length < 50) {
      await extractPageContext();
    }

    if (!cachedPageContent || cachedPageContent.mainText.length < 50) {
      throw new Error('No page content to review. Navigate to a worklist first.');
    }

    // Ask Haiku to identify the leads on the page
    const cleanedText = stripSensitiveData(cachedPageContent.mainText);
    const leadIdentification = await callAIProxy({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: 'Respond only with valid JSON. No markdown fences.',
      messages: [{ role: 'user', content: `Identify every person/contact/lead name visible in this page content. Return JSON: { "leads": [{ "name": "First Last" }] }\n\nPage content:\n${cleanedText.slice(0, 5000)}` }],
    });

    const cleaned = leadIdentification.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let identifiedLeads: { name: string }[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      identifiedLeads = Array.isArray(parsed.leads) ? parsed.leads : [];
    } catch {
      throw new Error('Could not identify leads on this page. Try a worklist page.');
    }

    if (identifiedLeads.length === 0) {
      throw new Error('No leads found on this page. Navigate to a CRM worklist and try again.');
    }

    const leadsToReview = identifiedLeads.slice(0, MAX_DEEP_REVIEW_LEADS);
    const total = leadsToReview.length;
    const summaries: { name: string; summary: string; skipped?: boolean }[] = [];

    await ensureContentScript(tabId);

    // Get clickable contacts
    let clickableContacts: any[] = [];
    try {
      clickableContacts = await sendToContentScript(tabId, { type: 'FIND_CLICKABLE' });
      if (!Array.isArray(clickableContacts)) clickableContacts = [];
    } catch { clickableContacts = []; }

    for (let i = 0; i < total; i++) {
      if (deepReviewCancelled) break;

      const lead = leadsToReview[i];
      broadcast({ type: 'DEEP_REVIEW_PROGRESS', payload: { current: i + 1, total, name: lead.name } });

      try {
        const nameLower = lead.name.toLowerCase();
        const matchedContact = clickableContacts.find((c: any) =>
          c.name.toLowerCase().includes(nameLower) || nameLower.includes(c.name.toLowerCase())
        );

        const clickPayload = matchedContact
          ? { selector: matchedContact.selector, text: lead.name }
          : { selector: '', text: lead.name };

        const clickResult = await sendToContentScript(tabId, {
          type: 'CLICK_ELEMENT',
          payload: clickPayload,
        });

        if (!clickResult?.success) {
          summaries.push({ name: lead.name, summary: `Could not click into lead: ${clickResult?.error || 'unknown'}.`, skipped: true });
          continue;
        }

        const pageContent: PageContent | undefined = clickResult.content;

        if (!pageContent || !pageContent.mainText || pageContent.mainText.length < 20) {
          summaries.push({ name: lead.name, summary: 'Page loaded but content too thin.', skipped: true });
          try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        const cleanedLeadText = stripSensitiveData(pageContent.mainText) +
          (pageContent.conversations.length > 0
            ? '\n\nConversations:\n' + pageContent.conversations.map(stripSensitiveData).join('\n---\n')
            : '');
        const prompt = buildDeepReviewSummaryPrompt(cleanedLeadText);

        const summary = await callAIProxy({
          model: HAIKU_MODEL,
          max_tokens: 200,
          system: 'Respond with 2-3 sentences of plain text. No JSON, no markdown.',
          messages: [{ role: 'user', content: prompt }],
        });

        summaries.push({ name: lead.name, summary });

        try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
        await new Promise(r => setTimeout(r, 1500));

      } catch (err: any) {
        summaries.push({ name: lead.name, summary: `Extraction failed: ${err.message || 'unknown'}.`, skipped: true });
        try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Generate game plan with Sonnet
    broadcast({ type: 'DEEP_REVIEW_PROGRESS', payload: { current: total, total, name: 'Building game plan...' } });

    const allSummaries = summaries.map(s => ({ name: s.name, summary: s.summary }));

    const gamePlanText = await callAIProxy({
      model: REX_MODEL,
      max_tokens: 3000,
      system: 'Respond only with valid JSON. No markdown fences.',
      messages: [{
        role: 'user',
        content: buildDeepReviewGamePlanPrompt(
          authState.profile?.full_name || '',
          allSummaries,
        ),
      }],
    });

    const gamePlanCleaned = gamePlanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let leads: DeepReviewLead[] = [];
    try {
      const parsed = JSON.parse(gamePlanCleaned);
      leads = Array.isArray(parsed.leads) ? parsed.leads : [];
    } catch {
      leads = summaries.map(s => ({
        name: s.name,
        priority: 'WARM' as const,
        lastInteraction: s.summary,
        play: s.skipped ? 'Could not access — review manually.' : 'Review manually — game plan generation failed.',
        taskType: 'phone',
        script: '',
        product: '',
        skipped: s.skipped,
      }));
    }

    for (const lead of leads) {
      const matchedSummary = summaries.find(s => s.name.toLowerCase() === lead.name.toLowerCase());
      if (matchedSummary?.skipped) lead.skipped = true;
    }

    const reviewedCount = summaries.filter(s => !s.skipped).length;
    return { leads, reviewedCount, totalFound: total };

  } finally {
    isDeepReviewing = false;
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
    return true;
  }
);

async function handleMessage(message: any, _sender: chrome.runtime.MessageSender): Promise<any> {
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
      cachedPageContent = null;
      cachedPageSummary = null;
      broadcastAuthState();
      return { success: true };
    }

    case 'GET_AUTH_STATE': {
      return authState;
    }

    case 'EXTRACT_PAGE_CONTEXT': {
      const content = await extractPageContext();
      return { success: !!content, hasContent: !!(content && content.mainText.length > 50) };
    }

    case 'CHAT_MESSAGE': {
      if (!authState.hasAccess) return { error: 'Sign in to Rex Lens to use this feature.' };

      const userMessage = message.payload.content;

      // Check for deep review intent
      if (isDeepReviewIntent(userMessage) && !isDeepReviewing) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return { error: 'No active tab found.' };

        // Add user message to chat history
        chatHistory.push({ role: 'user', content: userMessage });
        chatHistory.push({ role: 'assistant', content: 'On it. I\'ll click into each lead and build your game plan. Hang tight...' });

        broadcast({ type: 'STATUS', payload: { status: 'deep_review' } });

        try {
          const reviewResult = await runDeepReview(tab.id);
          broadcast({ type: 'DEEP_REVIEW_COMPLETE', payload: reviewResult });

          // Add game plan summary to chat history
          const gamePlanSummary = `Game plan ready — ${reviewResult.leads.length} leads analyzed (${reviewResult.reviewedCount} reviewed, ${reviewResult.totalFound - reviewResult.reviewedCount} skipped).`;
          chatHistory.push({ role: 'assistant', content: gamePlanSummary });

          return { reply: 'On it. I\'ll click into each lead and build your game plan. Hang tight...', deepReview: true };
        } catch (err: any) {
          broadcast({ type: 'STATUS', payload: { status: 'error', message: err.message } });
          return { reply: 'On it. I\'ll click into each lead and build your game plan. Hang tight...', deepReview: true, error: err.message };
        }
      }

      // Normal chat
      try {
        const reply = await chatWithRex(userMessage);
        return { reply };
      } catch (err: any) {
        return { error: `Chat failed: ${err.message}` };
      }
    }

    case 'CANCEL_DEEP_REVIEW': {
      deepReviewCancelled = true;
      return { ok: true };
    }

    case 'CONFIRM_INSERT': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab.' };
      try {
        return await chrome.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', payload: message.payload });
      } catch {
        return { error: 'Could not insert text. Try refreshing the page.' };
      }
    }

    case 'HIGHLIGHT_FIELD': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { error: 'No active tab.' };
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_FIELD', payload: message.payload });
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

    case 'CONTENT_SCRIPT_READY': {
      return { ok: true };
    }

    default:
      return {};
  }
}

// ── Auto-extract on tab navigation ──────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab?.id === tabId) {
        // Silently re-extract page content when the active tab finishes loading
        extractPageContext();
        // Notify side panel that page changed
        broadcast({ type: 'PAGE_CHANGED' });
      }
    });
  }
});

// ── Side Panel Behavior ──────────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Init on install / startup ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => { init(); });
chrome.runtime.onStartup.addListener(() => { init(); });
init();
