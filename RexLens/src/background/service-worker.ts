import { getSupabase, SUPABASE_ANON_KEY } from '../shared/supabase';
import { buildPageScanPrompt, buildChatSystemPrompt, buildDeepReviewSummaryPrompt, buildDeepReviewGamePlanPrompt, buildScanBatchPrompt, SCAN_BATCH_SYSTEM, REX_MODEL, HAIKU_MODEL, AI_PROXY_URL, stripSensitiveData } from '../shared/prompts';
import type { Profile, PageContent, AuthState, DeepReviewLead, DeepReviewResult, StructuredTask } from '../shared/types';
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

const AI_TIMEOUT_MS = 60_000; // 60 second timeout — proxy chain (extension → Supabase Edge → Anthropic) needs headroom

async function callAIProxy(body: Record<string, unknown>): Promise<string> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('AI request timed out (30s). Try again.');
    throw err;
  }
  clearTimeout(timer);

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

let haikuScanAbort: AbortController | null = null;

async function extractPageContext(): Promise<PageContent | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    await ensureContentScript(tab.id);
    const content: PageContent = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE' });
    if (content && content.mainText) {
      cachedPageContent = content;
      // Abort any in-flight Haiku scan from a previous page
      if (haikuScanAbort) haikuScanAbort.abort();
      haikuScanAbort = new AbortController();
      // Run Haiku pre-scan in background — don't block the UI
      runHaikuPageScan(content, haikuScanAbort.signal).catch(() => {});
    }
    return content;
  } catch {
    return null;
  }
}

// Page types worth scanning with Haiku (costs money — don't scan random browsing)
const SCANNABLE_TYPES = new Set(['crm', 'email', 'chat', 'linkedin']);

/** Use Haiku to create a compact page summary. Cheap (~$0.003) and fast. */
async function runHaikuPageScan(page: PageContent, signal?: AbortSignal): Promise<void> {
  if (!authState.hasAccess) return;
  if (page.mainText.length < 50) return;
  if (!SCANNABLE_TYPES.has(page.type)) return; // Don't burn credits on random pages

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
    // Only update if this scan wasn't aborted (user navigated away)
    if (!signal?.aborted) {
      cachedPageSummary = summary;
    }
  } catch {
    if (!signal?.aborted) {
      cachedPageSummary = null;
    }
  }
}

// ── Chat ────────────────────────────────────────────────────────────────────

async function chatWithRex(userMessage: string): Promise<string> {
  // If Haiku pre-scan hasn't finished yet, use raw page text as fallback
  const pageContext = cachedPageSummary
    || (cachedPageContent ? `[Page: ${cachedPageContent.title}]\n${stripSensitiveData(cachedPageContent.mainText).slice(0, 2000)}` : null);

  const systemPrompt = buildChatSystemPrompt(
    authState.profile?.full_name || '',
    pageContext,
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
  /\bdeep\s*review\b/i,
  /\breview\s+(my|the|this)\s+(worklist|leads|pipeline)\b/i,
  /\bclick\s+(into|through)\s+(each|every|all|my)\s+(lead|contact)/i,
  /\bgo\s+through\s+(each|every|all|my)\s+(lead|contact|worklist)\b/i,
  /\bbuild\s+(my|a|the)\s+game\s*plan\b/i,
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
    await ensureContentScript(tabId);

    // Trigger adapter preparation (e.g. VinSolutions clicks "All" view to load all grids)
    try { await sendToContentScript(tabId, { type: 'PREPARE_ADAPTER' }); } catch {}

    // Extract page content (adapter may provide structured tasks)
    if (!cachedPageContent || cachedPageContent.mainText.length < 50) {
      await extractPageContext();
    }

    if (!cachedPageContent || cachedPageContent.mainText.length < 50) {
      throw new Error('No page content to review. Navigate to a worklist first.');
    }

    // ── Identify leads ────────────────────────────────────────────────────
    // When adapter provides structured tasks, use them directly (skip Haiku)
    const hasStructuredData = cachedPageContent.structuredTasks && cachedPageContent.structuredTasks.length > 0;

    interface LeadInfo {
      name: string;
      vehicle?: string;
      status?: string;
      source?: string;
      taskDescription?: string;
      section?: string;
    }

    let identifiedLeads: LeadInfo[] = [];

    if (hasStructuredData) {
      // Fast path: leads already known from DOM scraping
      identifiedLeads = cachedPageContent.structuredTasks!.map(t => ({
        name: t.customerName,
        vehicle: t.vehicle,
        status: t.status,
        source: t.source,
        taskDescription: t.taskDescription,
        section: t.section,
      }));
    } else {
      // Slow path: ask Haiku to identify leads from raw text
      const cleanedText = stripSensitiveData(cachedPageContent.mainText);
      const leadIdentification = await callAIProxy({
        model: HAIKU_MODEL,
        max_tokens: 1500,
        system: 'Respond only with valid JSON. No markdown fences.',
        messages: [{ role: 'user', content: `Identify every person/contact/lead name visible in this page content. Return JSON: { "leads": [{ "name": "First Last" }] }\n\nPage content:\n${cleanedText.slice(0, 5000)}` }],
      });

      const cleaned = leadIdentification.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        identifiedLeads = Array.isArray(parsed.leads) ? parsed.leads : [];
      } catch {
        throw new Error('Could not identify leads on this page. Try a worklist page.');
      }
    }

    if (identifiedLeads.length === 0) {
      throw new Error('No leads found on this page. Navigate to a CRM worklist and try again.');
    }

    const leadsToReview = identifiedLeads.slice(0, MAX_DEEP_REVIEW_LEADS);
    const total = leadsToReview.length;
    const summaries: { name: string; summary: string; skipped?: boolean; vehicle?: string; status?: string; source?: string; taskDescription?: string }[] = [];

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

        let clickResult = await sendToContentScript(tabId, {
          type: 'CLICK_ELEMENT',
          payload: clickPayload,
        });

        // Retry once after 3s if first click fails
        if (!clickResult?.success) {
          await new Promise(r => setTimeout(r, 3000));
          clickResult = await sendToContentScript(tabId, {
            type: 'CLICK_ELEMENT',
            payload: clickPayload,
          });
        }

        if (!clickResult?.success) {
          // Fallback: generate summary from worklist data alone instead of skipping
          const fallbackInfo = [lead.vehicle, lead.status, lead.source, lead.taskDescription].filter(Boolean).join(', ');
          summaries.push({
            name: lead.name,
            summary: fallbackInfo ? `Worklist info only: ${fallbackInfo}. Could not access detail page.` : `Could not click into lead: ${clickResult?.error || 'unknown'}.`,
            skipped: !fallbackInfo, // Only mark as skipped if we have zero info
            vehicle: lead.vehicle, status: lead.status, source: lead.source, taskDescription: lead.taskDescription,
          });
          continue;
        }

        const pageContent: PageContent | undefined = clickResult.content;

        if (!pageContent || !pageContent.mainText || pageContent.mainText.length < 20) {
          summaries.push({
            name: lead.name, summary: 'Page loaded but content too thin.', skipped: true,
            vehicle: lead.vehicle, status: lead.status, source: lead.source, taskDescription: lead.taskDescription,
          });
          try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        if (deepReviewCancelled) break;

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

        summaries.push({
          name: lead.name, summary,
          vehicle: lead.vehicle, status: lead.status, source: lead.source, taskDescription: lead.taskDescription,
        });

        try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
        await new Promise(r => setTimeout(r, 1500));

      } catch (err: any) {
        summaries.push({
          name: lead.name, summary: `Extraction failed: ${err.message || 'unknown'}.`, skipped: true,
          vehicle: lead.vehicle, status: lead.status, source: lead.source, taskDescription: lead.taskDescription,
        });
        try { await sendToContentScript(tabId, { type: 'GO_BACK' }); } catch {}
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Generate game plan with Sonnet
    broadcast({ type: 'DEEP_REVIEW_PROGRESS', payload: { current: total, total, name: 'Building game plan...' } });

    // Pass structured metadata through to game plan prompt when available
    const allSummaries = summaries.map(s => ({
      name: s.name, summary: s.summary,
      vehicle: s.vehicle, status: s.status, source: s.source, taskDescription: s.taskDescription,
    }));

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
        product: s.vehicle || '',
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
      if (isDeepReviewIntent(userMessage) && isDeepReviewing) {
        return { reply: 'Deep review is already running. You can cancel it or wait for it to finish.' };
      }

      if (isDeepReviewIntent(userMessage)) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return { error: 'No active tab found.' };

        // Add user message to chat history
        chatHistory.push({ role: 'user', content: userMessage });
        chatHistory.push({ role: 'assistant', content: 'On it. I\'ll click into each lead and build your game plan. Hang tight...' });

        broadcast({ type: 'STATUS', payload: { status: 'deep_review' } });

        // Run deep review in background — DON'T await, return reply immediately
        runDeepReview(tab.id).then(reviewResult => {
          broadcast({ type: 'DEEP_REVIEW_COMPLETE', payload: reviewResult });
          const gamePlanSummary = `Game plan ready — ${reviewResult.leads.length} leads analyzed (${reviewResult.reviewedCount} reviewed, ${reviewResult.totalFound - reviewResult.reviewedCount} skipped).`;
          chatHistory.push({ role: 'assistant', content: gamePlanSummary });
        }).catch(err => {
          broadcast({ type: 'DEEP_REVIEW_COMPLETE', payload: { leads: [], reviewedCount: 0, totalFound: 0 } });
          chatHistory.push({ role: 'assistant', content: `Deep review failed: ${err.message}` });
        });

        return { reply: 'On it. I\'ll click into each lead and build your game plan. Hang tight...', deepReview: true };
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

    // ── Scan (Panel) ──────────────────────────────────────────────────────

    case 'SCAN_PAGE': {
      if (!authState.hasAccess) return { error: 'Sign in to Rex Lens to use this feature.' };
      // Get the tab that sent this message (content script panel)
      const tabId = sender.tab?.id;
      if (!tabId) {
        // Fallback: use active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return { error: 'No active tab found.' };
        return await scanPageForTab(tab.id);
      }
      return await scanPageForTab(tabId);
    }

    case 'SCAN_BATCH': {
      if (!authState.hasAccess) return { error: 'Sign in to Rex Lens to use this feature.' };
      const { tasks, rawText } = message.payload as { tasks: StructuredTask[]; rawText: string };
      try {
        // Get rep name and dealership from storage (set by landing page signup)
        const storageData = await chrome.storage.sync.get(['repName', 'dealershipName']);
        const repName = storageData.repName || authState.profile?.full_name || 'admin';
        const dealershipName = storageData.dealershipName || 'the dealership';

        const prompt = buildScanBatchPrompt(tasks, rawText);
        const system = SCAN_BATCH_SYSTEM
          + `\n\nThe rep's name is ${repName} and they work at ${dealershipName}. Use their actual name in scripts instead of placeholders.`;
        const reply = await callAIProxy({
          model: REX_MODEL,
          max_tokens: 8000,
          system,
          messages: [{ role: 'user', content: prompt }],
        });
        return { reply };
      } catch (err: any) {
        return { error: `Scan failed: ${err.message}` };
      }
    }

    default:
      return {};
  }
}

async function scanPageForTab(tabId: number): Promise<any> {
  try {
    await ensureContentScript(tabId);
    // Prepare adapter (e.g. VinSolutions clicks "All" view)
    try { await sendToContentScript(tabId, { type: 'PREPARE_ADAPTER' }); } catch {}
    // Wait for adapter prepare to settle
    await new Promise(r => setTimeout(r, 500));
    // Extract page content (adapter provides structured tasks)
    const content: PageContent = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
    return {
      tasks: content.structuredTasks || [],
      rawText: content.mainText || '',
      platform: content.adapterPlatform || 'generic',
    };
  } catch (err: any) {
    return { error: `Could not scan page: ${err.message}` };
  }
}

// ── Auto-extract on tab navigation ──────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    // Don't auto-extract during deep review — it navigates tabs and would thrash the cache
    if (isDeepReviewing) return;

    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab?.id === tabId) {
        extractPageContext();
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
