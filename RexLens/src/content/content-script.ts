import type { PageContent, PageType, FormField, ClickableContact } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';
import type { AdapterHelpers } from './adapters/types';
import { getAdapter } from './adapters/registry';

// ── Page Type Detection ──────────────────────────────────────────────────────

function detectPageType(): PageType {
  const host = window.location.hostname.toLowerCase();

  // Email providers
  if (host.includes('mail.google') || host.includes('outlook.live') ||
      host.includes('outlook.office') || host.includes('mail.yahoo')) {
    return 'email';
  }

  // LinkedIn
  if (host.includes('linkedin.com')) return 'linkedin';

  // Known CRM platforms
  if (host.includes('vinsolutions') || host.includes('dealersocket') ||
      host.includes('salesforce') || host.includes('hubspot') ||
      host.includes('dealercentric') || host.includes('tekion') ||
      host.includes('cdk') || host.includes('elead')) {
    return 'crm';
  }

  // Chat / texting platforms
  if (host.includes('messenger') || host.includes('web.whatsapp') ||
      host.includes('slack.com') || host.includes('teams.microsoft') ||
      host.includes('podium.com') || host.includes('kenect.com') ||
      host.includes('matador.ai')) {
    return 'chat';
  }

  return 'generic';
}

// ── DOM Content Extraction ───────────────────────────────────────────────────

const NOISE_SELECTORS = [
  'nav', 'footer', 'header', '.ad', '.ads', '.advertisement',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  'script', 'style', 'noscript', 'svg',
  '.cookie-banner', '.cookie-consent', '#cookie-notice',
];

function extractText(root: Element | Document = document): string {
  // Clone to avoid mutation
  const clone = root.cloneNode(true) as Element;

  // Remove noise elements (but keep iframes — we read them separately)
  for (const sel of NOISE_SELECTORS) {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Get text content from this frame, collapse whitespace
  let text = (clone.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Also read text from all same-origin iframes
  const iframeText = extractIframeText();
  if (iframeText) {
    text = text + '\n\n' + iframeText;
  }

  return text.slice(0, 8000); // Increased cap for iframe-heavy pages
}

/** Recursively extract text from all accessible (same-origin) iframes */
function extractIframeText(): string {
  const parts: string[] = [];
  collectIframeText(document, parts, 0);
  return parts.join('\n\n').slice(0, 6000);
}

/** Walk same-origin iframes up to 4 levels deep, collecting cleaned text */
function collectIframeText(root: Document, parts: string[], depth: number): void {
  if (depth > 4) return;
  const iframes = root.querySelectorAll('iframe');

  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.body) continue; // Cross-origin or not loaded — skip

      const clone = doc.body.cloneNode(true) as HTMLElement;
      for (const sel of NOISE_SELECTORS) {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      }

      const text = (clone.textContent || '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      if (text.length > 20) {
        parts.push(text);
      }

      // Recurse into nested iframes inside this iframe
      collectIframeText(doc, parts, depth + 1);
    } catch {
      // Cross-origin iframe — skip gracefully
    }
  }
}

/** querySelectorAll across the main doc + all same-origin iframes (recursive) */
function querySelectorAllDeep(selector: string): Element[] {
  const results: Element[] = [...document.querySelectorAll(selector)];
  collectFromIframes(document, selector, results, 0);
  return results;
}

function collectFromIframes(root: Document, selector: string, results: Element[], depth: number): void {
  if (depth > 4) return;
  for (const iframe of root.querySelectorAll('iframe')) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) continue;
      results.push(...doc.querySelectorAll(selector));
      collectFromIframes(doc, selector, results, depth + 1);
    } catch { /* cross-origin */ }
  }
}

function extractConversations(): string[] {
  const conversations: string[] = [];

  // Email thread messages
  const emailMessages = querySelectorAllDeep(
    '.adn, .h7, [role="listitem"], .message-body, .email-content, ' +
    '.ii.gt, [data-message-id], .ConversationItem'
  );
  emailMessages.forEach(el => {
    const text = (el.textContent || '').trim();
    if (text.length > 20 && text.length < 3000) {
      conversations.push(text.slice(0, 1000));
    }
  });

  // Chat messages
  const chatMessages = querySelectorAllDeep(
    '[class*="message"], [class*="chat"], [data-testid*="message"], ' +
    '.msg-s-event-listitem, .msg-s-message-list-content'
  );
  chatMessages.forEach(el => {
    const text = (el.textContent || '').trim();
    if (text.length > 5 && text.length < 1000) {
      conversations.push(text.slice(0, 500));
    }
  });

  // Deduplicate and limit
  return [...new Set(conversations)].slice(0, 10);
}

function extractContactInfo(): { names: string[]; emails: string[]; phones: string[] } {
  // Gather text from main frame + all accessible iframes
  let text = document.body.textContent || '';
  for (const iframe of document.querySelectorAll('iframe')) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.body) text += ' ' + (doc.body.textContent || '');
    } catch { /* cross-origin — skip this iframe */ }
  }

  // Email regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(text.match(emailRegex) || [])].slice(0, 10);

  // Phone regex (US format variations)
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = [...new Set(text.match(phoneRegex) || [])].slice(0, 10);

  // Names from common patterns (headings, profile elements, etc.) — search iframes too
  const nameElements = querySelectorAllDeep(
    'h1, h2, h3, [class*="name"], [class*="Name"], [data-testid*="name"], ' +
    '.profile-name, .contact-name, .customer-name, .pv-top-card--list li:first-child'
  );
  const names: string[] = [];
  nameElements.forEach(el => {
    const t = (el.textContent || '').trim();
    // Heuristic: 2-4 words, starts with uppercase, no special chars
    if (t.length > 2 && t.length < 60 && /^[A-Z]/.test(t) && !/[<>{}]/.test(t)) {
      names.push(t);
    }
  });

  return {
    names: [...new Set(names)].slice(0, 10),
    emails,
    phones,
  };
}

function getAdapterHelpers(): AdapterHelpers {
  return { querySelectorAllDeep, extractText, cspSafeClick, buildUniqueSelector };
}

/** Extract VinConnect-specific vehicle/trade detail from a contact detail page */
function extractVehicleDetail(): string {
  const host = window.location.hostname.toLowerCase();
  if (!host.includes('vinsolutions')) return '';

  const parts: string[] = [];

  // Look for VOI (Vehicle of Interest), trade info, equity in iframes
  const vehicleSelectors = [
    '[class*="vehicle"], [class*="Vehicle"], [id*="vehicle"], [id*="Vehicle"]',
    '[class*="trade"], [class*="Trade"], [id*="trade"], [id*="Trade"]',
    '[class*="equity"], [class*="Equity"]',
    '[class*="interest"], [class*="Interest"]',
  ];

  for (const sel of vehicleSelectors) {
    const els = querySelectorAllDeep(sel);
    for (const el of els) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 5 && text.length < 500) {
        parts.push(text);
      }
    }
  }

  // Also look for service appointment info
  const serviceEls = querySelectorAllDeep(
    '[class*="service"], [class*="Service"], [id*="service"], [id*="Service"], ' +
    '[class*="appointment"], [class*="Appointment"]'
  );
  for (const el of serviceEls) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 10 && text.length < 500) {
      parts.push(text);
    }
  }

  return [...new Set(parts)].join('\n').slice(0, 3000);
}

function extractPageContent(): PageContent {
  const type = detectPageType();
  const contactInfo = extractContactInfo();
  const hostname = window.location.hostname.toLowerCase();

  // Run platform adapter for structured extraction
  const adapter = getAdapter(hostname);
  const helpers = getAdapterHelpers();
  const adapterResult = adapter.extract(helpers);

  // On VinConnect detail pages, append vehicle/trade detail
  let mainText = adapterResult.tasks.length > 0 ? adapterResult.rawText : extractText();
  const vehicleDetail = extractVehicleDetail();
  if (vehicleDetail) {
    mainText += '\n\nVehicle/Trade Details:\n' + vehicleDetail;
  }

  return {
    type,
    title: document.title,
    url: window.location.href,
    mainText,
    conversations: extractConversations(),
    formFields: detectFormFields(),
    contactNames: contactInfo.names,
    emails: contactInfo.emails,
    phones: contactInfo.phones,
    structuredTasks: adapterResult.tasks.length > 0 ? adapterResult.tasks : undefined,
    adapterPlatform: adapter.id,
  };
}

// ── Form Field Detection ─────────────────────────────────────────────────────

function detectFormFields(): FormField[] {
  const fields: FormField[] = [];

  // Text inputs and textareas
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[type="text"], input[type="email"], input:not([type]), textarea'
  );
  inputs.forEach((el, i) => {
    if (!isVisible(el)) return;
    const label = getFieldLabel(el);
    const selector = buildUniqueSelector(el, i);
    fields.push({
      selector,
      label,
      type: el.tagName === 'TEXTAREA' ? 'textarea' : 'input',
      currentValue: el.value,
    });
  });

  // Contenteditable divs (Gmail compose, LinkedIn messages, etc.)
  const editables = document.querySelectorAll<HTMLElement>(
    '[contenteditable="true"], [contenteditable=""], [role="textbox"]'
  );
  editables.forEach((el, i) => {
    if (!isVisible(el)) return;
    const label = getFieldLabel(el) || 'Compose field';
    const selector = buildUniqueSelector(el, inputs.length + i);
    fields.push({
      selector,
      label,
      type: 'contenteditable',
      currentValue: el.textContent || '',
    });
  });

  return fields.slice(0, 10);
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function getFieldLabel(el: HTMLElement): string {
  // Try aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Try associated label
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  // Try placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  // Try parent label
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';

  // Try nearby text
  const prev = el.previousElementSibling;
  if (prev && prev.textContent && prev.textContent.trim().length < 50) {
    return prev.textContent.trim();
  }

  return el.getAttribute('name') || el.tagName.toLowerCase();
}

function buildUniqueSelector(el: HTMLElement, index: number): string {
  // Try ID first
  if (el.id) return `#${CSS.escape(el.id)}`;

  // Try data attributes
  const dataTestId = el.getAttribute('data-testid');
  if (dataTestId) return `[data-testid="${CSS.escape(dataTestId)}"]`;

  // Try name attribute
  const name = el.getAttribute('name');
  if (name) return `[name="${CSS.escape(name)}"]`;

  // Try aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

  // Fallback to nth-of-type with class
  const tag = el.tagName.toLowerCase();
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.split(/\s+/)[0];
    if (cls) return `${tag}.${CSS.escape(cls)}`;
  }

  return `[data-rex-field="${index}"]`;
}

// ── Deep Scan: Find Clickable Contacts ──────────────────────────────────────

const CRM_CONTACT_SELECTORS = [
  // VinSolutions
  'a.customer-name', 'table a[href*="contact"]', 'table a[href*="customer"]',
  // DealerSocket
  '.contact-link', '.lead-name a',
  // Salesforce
  'a[data-refid]', '.slds-truncate a',
  // HubSpot
  'a.private-link', '.contact-name-link',
  // LinkedIn
  '.msg-conversation-card__participant-names a',
];

// Platform-specific conversation selectors for email/texting Deep Scan
const CONVERSATION_SELECTORS: Record<string, string[]> = {
  'mail.google.com': ['.zA', 'tr[role="row"]'],
  'outlook.live.com': ['[role="option"]', '[role="listitem"]'],
  'outlook.office365.com': ['[role="option"]', '[role="listitem"]'],
  'outlook.office.com': ['[role="option"]', '[role="listitem"]'],
  'app.podium.com': ['[data-testid*="conversation"]', '[class*="conversation"]', '[class*="inbox"] li', '[class*="thread"]'],
  'app.kenect.com': ['[data-testid*="conversation"]', '[class*="conversation"]', '[class*="inbox"] li', '[class*="thread"]'],
  'app.matador.ai': ['[data-testid*="conversation"]', '[class*="conversation"]', '[class*="inbox"] li', '[class*="thread"]'],
};

// Supports: John Smith, O'Brien, McDonald, Jean-Pierre, De La Cruz
const NAME_PATTERN = /^[A-Z][a-zA-Z'-]+(?:\s(?:[A-Z][a-zA-Z'-]+|[a-z]{1,3})){1,3}$/;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function findClickableContacts(): ClickableContact[] {
  // Prefer adapter-specific clickable detection (e.g. VinSolutions a.viewitemlink)
  const hostname = window.location.hostname.toLowerCase();
  const adapter = getAdapter(hostname);
  if (adapter.findClickables) {
    const helpers = getAdapterHelpers();
    const adapterResults = adapter.findClickables(helpers);
    if (adapterResults.length > 0) return adapterResults;
  }

  // Fall back to generic detection
  const pageType = detectPageType();
  if (pageType === 'email' || pageType === 'chat') {
    const convResults = findClickableConversations();
    if (convResults.length > 0) return convResults;
  }

  return findClickableCRMContacts();
}

// ── CRM name-link detection (original approach) ────────────────────────────

function findClickableCRMContacts(): ClickableContact[] {
  const results: ClickableContact[] = [];
  const seen = new Set<string>();
  let contactIndex = 0;

  // Use querySelectorAllDeep so we find leads inside iframes (e.g. VinSolutions frameset)
  for (const sel of CRM_CONTACT_SELECTORS) {
    const elements = querySelectorAllDeep(sel);
    for (const el of elements) {
      const contact = extractClickableContact(el as HTMLElement, contactIndex);
      if (contact && !seen.has(contact.name)) {
        seen.add(contact.name);
        results.push(contact);
        contactIndex++;
      }
    }
  }

  const genericLinks = querySelectorAllDeep(
    'table a, [role="row"] a, [role="listitem"] a, .list-item a'
  );
  for (const el of genericLinks) {
    const contact = extractClickableContact(el as HTMLElement, contactIndex);
    if (contact && !seen.has(contact.name)) {
      seen.add(contact.name);
      results.push(contact);
      contactIndex++;
    }
  }

  return results.slice(0, 30);
}

function extractClickableContact(el: HTMLElement, index: number): ClickableContact | null {
  const text = (el.textContent || '').trim();

  if (text.length < 3 || text.length > 50) return null;
  if (!NAME_PATTERN.test(text)) return null;

  const isLink = el.tagName === 'A' && (el as HTMLAnchorElement).href;
  const isClickable = el.getAttribute('role') === 'link' || el.style.cursor === 'pointer'
    || el.onclick !== null || isLink;

  if (!isClickable) return null;

  const selector = buildUniqueSelector(el, index);
  const href = isLink ? (el as HTMLAnchorElement).href : '';

  return { name: text, selector, href };
}

// ── Conversation/thread detection (email + texting platforms) ───────────────

function findClickableConversations(): ClickableContact[] {
  const host = window.location.hostname;
  const results: ClickableContact[] = [];
  const seen = new Set<string>();
  let index = 0;

  // Try platform-specific selectors (search iframes too)
  for (const [domain, selectors] of Object.entries(CONVERSATION_SELECTORS)) {
    if (!host.includes(domain)) continue;
    for (const sel of selectors) {
      const items = querySelectorAllDeep(sel);
      for (const item of items) {
        const contact = extractConversationItem(item as HTMLElement, index);
        if (contact && !seen.has(contact.name)) {
          seen.add(contact.name);
          results.push(contact);
          index++;
        }
      }
    }
  }

  // Generic fallback: repeated clickable items in a list/sidebar (search iframes too)
  if (results.length === 0) {
    const listItems = querySelectorAllDeep(
      '[role="listitem"], [role="option"], [class*="inbox"] li, ' +
      '[class*="conversation"], [class*="thread-item"], [class*="message-item"]'
    );
    for (const item of listItems) {
      const contact = extractConversationItem(item as HTMLElement, index);
      if (contact && !seen.has(contact.name)) {
        seen.add(contact.name);
        results.push(contact);
        index++;
      }
    }
  }

  return results.slice(0, 30);
}

function extractConversationItem(el: HTMLElement, index: number): ClickableContact | null {
  const text = (el.textContent || '').trim();
  if (text.length < 3 || text.length > 500) return null;

  // Gmail sender extraction: look for .yP or .bqe inside the element
  const gmailSender = el.querySelector('.yP, .zF');
  if (gmailSender) {
    const senderName = (gmailSender.getAttribute('name') || gmailSender.textContent || '').trim();
    if (senderName) {
      return { name: senderName, selector: buildUniqueSelector(el, index), href: '' };
    }
  }

  // Try to find a name, phone number, or email in the element's text
  let identifier = '';

  // Check for a name pattern
  const nameMatch = text.match(/([A-Z][a-zA-Z'-]+(?:\s(?:[A-Z][a-zA-Z'-]+|[a-z]{1,3})){1,3})/);
  if (nameMatch) {
    identifier = nameMatch[1];
  }

  // Check for phone number
  if (!identifier) {
    const phoneMatch = text.match(PHONE_PATTERN);
    if (phoneMatch) identifier = phoneMatch[0];
  }

  // Check for email
  if (!identifier) {
    const emailMatch = text.match(EMAIL_PATTERN);
    if (emailMatch) identifier = emailMatch[0];
  }

  if (!identifier) return null;

  // Element must be clickable
  const isClickable = el.tagName === 'A' || el.tagName === 'TR' || el.tagName === 'LI'
    || el.getAttribute('role') === 'option' || el.getAttribute('role') === 'listitem'
    || el.getAttribute('role') === 'row' || el.getAttribute('role') === 'link'
    || el.style.cursor === 'pointer' || el.onclick !== null
    || el.closest('[role="list"]') !== null;

  if (!isClickable) return null;

  return { name: identifier, selector: buildUniqueSelector(el, index), href: '' };
}

// ── CSP-Safe Click Helper ────────────────────────────────────────────────
// VinSolutions and other CRMs use <a href="javascript:..."> links.
// Calling el.click() on those triggers the javascript: URL execution,
// which is blocked by strict CSP (script-src 'self'). Instead, dispatch
// a synthetic MouseEvent — this triggers the element's click/mousedown
// listeners without executing the javascript: href.

function cspSafeClick(el: HTMLElement): void {
  const jsLink = el.tagName === 'A' && (el as HTMLAnchorElement).href?.startsWith('javascript:')
    ? el as HTMLAnchorElement
    : el.closest('a[href^="javascript:"]') as HTMLAnchorElement | null;

  if (jsLink) {
    // Temporarily strip the javascript: href so the browser can't execute it,
    // then dispatch synthetic events to trigger the CRM's click handlers.
    const savedHref = jsLink.href;
    jsLink.removeAttribute('href');

    const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window };
    jsLink.dispatchEvent(new MouseEvent('mousedown', opts));
    jsLink.dispatchEvent(new MouseEvent('mouseup', opts));
    jsLink.dispatchEvent(new MouseEvent('click', opts));

    // Restore href after a tick so the DOM stays consistent
    requestAnimationFrame(() => { jsLink.setAttribute('href', savedHref); });
  } else {
    el.click();
  }
}

// ── Deep Scan: Detect if page is SPA conversation view ─────────────────────

function isSPAConversationView(): boolean {
  const host = window.location.hostname;
  // Email and texting platforms are SPAs — clicking loads content in a panel
  return Object.keys(CONVERSATION_SELECTORS).some(domain => host.includes(domain))
    || host.includes('linkedin.com');
}

// ── Deep Scan: Click and Extract ────────────────────────────────────────────

function waitForPageChange(timeout = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    const startUrl = window.location.href;
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearInterval(urlCheck);
      clearTimeout(timer);
      resolve();
    };

    // Watch for significant DOM changes
    let mutationCount = 0;
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
      if (mutationCount > 20) done();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Watch for URL changes (SPA navigation)
    const urlCheck = setInterval(() => {
      if (window.location.href !== startUrl) done();
    }, 100);

    // Timeout fallback
    const timer = setTimeout(done, timeout);
  });
}

async function clickAndExtract(selector: string): Promise<PageContent> {
  const savedUrl = window.location.href;
  const savedScroll = window.scrollY;

  // Find and click the element
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`Element not found: ${selector}`);

  cspSafeClick(el);

  // Wait for navigation/content change
  await waitForPageChange();
  // Small extra delay for rendering
  await new Promise(r => setTimeout(r, 300));

  // Extract the detail page content
  tagFields();
  const content = extractPageContent();

  // Navigate back
  if (window.location.href !== savedUrl) {
    history.back();
    // Wait for back navigation to complete
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (window.location.href === savedUrl || document.readyState === 'complete') {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });
  } else {
    // SPA may have changed DOM without URL change — try back anyway
    history.back();
    await new Promise(r => setTimeout(r, 1000));
  }

  // Restore scroll position (best-effort, may be on wrong page)
  window.scrollTo({ top: savedScroll, behavior: 'instant' });

  // Fallback: if still not on original URL, hard navigate
  // Do this AFTER returning content since hard navigate destroys this script context
  // Guard: never assign a javascript: URL to location.href (CSP violation)
  if (window.location.href !== savedUrl && !savedUrl.startsWith('javascript:')) {
    setTimeout(() => { window.location.href = savedUrl; }, 50);
  }

  return content;
}

// ── Deep Scan: SPA Click and Extract (no back-navigation) ──────────────────

async function clickAndExtractSPA(selector: string): Promise<PageContent> {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`Element not found: ${selector}`);

  cspSafeClick(el);

  // Wait for conversation/message pane to update
  await waitForPageChange(3000);
  await new Promise(r => setTimeout(r, 300));

  // Extract from the reading/message pane
  // The conversation list stays visible — no back-navigation needed
  tagFields();
  return extractPageContent();
}

// ── Text Insertion ───────────────────────────────────────────────────────────

function insertTextIntoField(selector: string, text: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // Standard form fields
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    // Contenteditable (Gmail, LinkedIn, etc.) — CSP-safe insertion
    el.focus();

    // Select all existing content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Delete selected content, then insert new text node directly (no execCommand)
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor to end
    const endRange = document.createRange();
    endRange.selectNodeContents(el);
    endRange.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(endRange);

    // Fire InputEvent so frameworks (React, Vue, etc.) pick up the change
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }

  return false;
}

function highlightField(selector: string, highlight: boolean): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;

  if (highlight) {
    el.style.outline = '3px solid #4F46E5';
    el.style.outlineOffset = '2px';
    el.style.transition = 'outline 0.2s ease';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }
}

// ── Scroll Controls ──────────────────────────────────────────────────────────

function scrollPage(direction: 'up' | 'down'): void {
  const amount = window.innerHeight * 0.8;
  window.scrollBy({
    top: direction === 'down' ? amount : -amount,
    behavior: 'smooth',
  });
}

// ── Tag fields for fallback selectors ────────────────────────────────────────

function tagFields(): void {
  const fields = document.querySelectorAll(
    'input[type="text"], input[type="email"], input:not([type]), textarea, ' +
    '[contenteditable="true"], [contenteditable=""], [role="textbox"]'
  );
  fields.forEach((el, i) => {
    if (!el.getAttribute('data-rex-field')) {
      el.setAttribute('data-rex-field', String(i));
    }
  });
}

// ── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'EXTRACT_PAGE': {
        tagFields();
        const content = extractPageContent();

        // If content is nearly empty (< 200 chars), dynamic content may not have loaded yet.
        // Wait 2s and retry once — covers CRMs like VinSolutions that load data async.
        if (content.mainText.length < 200) {
          setTimeout(() => {
            tagFields();
            const retryContent = extractPageContent();
            sendResponse(retryContent);
          }, 2000);
        } else {
          sendResponse(content);
        }
        break;
      }

      case 'DETECT_FIELDS': {
        tagFields();
        const fields = detectFormFields();
        sendResponse(fields);
        break;
      }

      case 'INSERT_TEXT': {
        const { selector, text } = message.payload;
        const success = insertTextIntoField(selector, text);
        sendResponse({ success });
        break;
      }

      case 'HIGHLIGHT_FIELD': {
        highlightField(message.payload.selector, message.payload.highlight);
        sendResponse({ ok: true });
        break;
      }

      case 'SCROLL': {
        scrollPage(message.payload.direction);
        sendResponse({ ok: true });
        break;
      }

      case 'FIND_CLICKABLE': {
        const contacts = findClickableContacts();
        sendResponse(contacts);
        break;
      }

      case 'CLICK_AND_EXTRACT': {
        const { selector } = message.payload;
        const extractFn = isSPAConversationView() ? clickAndExtractSPA : clickAndExtract;
        extractFn(selector)
          .then(content => sendResponse({ success: true, content }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        break;
      }

      case 'CLICK_ELEMENT': {
        const { selector, text } = message.payload;
        let responded = false;
        const respond = (value: any) => { if (!responded) { responded = true; sendResponse(value); } };

        try {
          let el: HTMLElement | null = null;

          // Try selector first
          if (selector) {
            el = querySelectorAllDeep(selector)[0] as HTMLElement | null;
          }

          // Fallback: find by text content (for CRMs where selectors may not match)
          if (!el && text) {
            const textLower = text.toLowerCase();
            const candidates = querySelectorAllDeep('a, span, td, button, [role="link"], [role="row"]');
            let exactMatch: HTMLElement | null = null;
            let substringMatch: HTMLElement | null = null;

            for (const candidate of candidates) {
              const t = (candidate.textContent || '').trim();
              if (!t || t.length > 80) continue;
              const tLower = t.toLowerCase();

              const isExact = tLower === textLower;
              const isSubstring = !isExact && tLower.includes(textLower);
              if (!isExact && !isSubstring) continue;

              const htmlEl = candidate as HTMLElement;
              const isClickable = htmlEl.tagName === 'A' || htmlEl.onclick
                  || htmlEl.getAttribute('role') === 'link'
                  || htmlEl.style.cursor === 'pointer' || htmlEl.closest('a');

              const resolved = isClickable
                ? (htmlEl.closest('a') as HTMLElement || htmlEl)
                : htmlEl;

              if (isExact && isClickable) {
                exactMatch = resolved;
                break; // Best possible match — stop searching
              }
              if (isExact && !exactMatch) exactMatch = resolved;
              if (isSubstring && isClickable && !substringMatch) substringMatch = resolved;
              if (isSubstring && !substringMatch) substringMatch = resolved;
            }

            el = exactMatch || substringMatch;
          }

          if (!el) {
            respond({ success: false, error: `Element not found: ${selector || text}` });
            break;
          }

          cspSafeClick(el);

          // Wait 6s for iframe/page navigation to complete (VinConnect is slow)
          setTimeout(() => {
            try {
              tagFields();
              const content = extractPageContent();

              // If first extraction is thin, wait 3 more seconds and retry (iframe may still be loading)
              if (content.mainText.length < 50) {
                setTimeout(() => {
                  try {
                    tagFields();
                    const retryContent = extractPageContent();
                    respond({ success: true, content: retryContent });
                  } catch { respond({ success: false, error: 'Retry extraction failed' }); }
                }, 3000);
              } else {
                respond({ success: true, content });
              }
            } catch (e: any) {
              respond({ success: false, error: `Extraction after click failed: ${e.message}` });
            }
          }, 6000);

        } catch (err: any) {
          respond({ success: false, error: err.message });
        }
        break;
      }

      case 'WAIT_AND_EXTRACT': {
        // Wait 5s for dynamic content to load (CRM detail pages with iframes)
        setTimeout(() => {
          tagFields();
          const content = extractPageContent();

          // If first extraction is thin, wait 2 more seconds and retry
          if (content.mainText.length < 50) {
            setTimeout(() => {
              tagFields();
              const retryContent = extractPageContent();
              sendResponse(retryContent);
            }, 2000);
          } else {
            sendResponse(content);
          }
        }, 5000);
        break;
      }

      case 'CONTENT_SCRIPT_READY': {
        sendResponse({ ok: true });
        break;
      }

      case 'GO_BACK': {
        const startUrl = window.location.href;
        history.back();

        // Wait for navigation to complete (URL change or DOM mutations)
        let resolved = false;
        let mutationCount = 0;
        const observer = new MutationObserver((mutations) => {
          mutationCount += mutations.length;
          if (mutationCount > 20 && !resolved) {
            resolved = true;
            observer.disconnect();
            clearInterval(urlCheck);
            clearTimeout(timer);
            sendResponse({ success: true });
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        const urlCheck = setInterval(() => {
          if (window.location.href !== startUrl && !resolved) {
            resolved = true;
            observer.disconnect();
            clearInterval(urlCheck);
            clearTimeout(timer);
            sendResponse({ success: true });
          }
        }, 100);

        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            clearInterval(urlCheck);
            sendResponse({ success: true });
          }
        }, 3000);
        break;
      }

      case 'PREPARE_ADAPTER': {
        const hostname = window.location.hostname.toLowerCase();
        const adapter = getAdapter(hostname);
        if (adapter.prepare) {
          const helpers = getAdapterHelpers();
          adapter.prepare(helpers).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: true }));
        } else {
          sendResponse({ ok: true });
        }
        break;
      }
    }

    return true; // Keep message channel open for async response
  }
);

// Let the service worker know the content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {});

// ── Initialize Panel ────────────────────────────────────────────────────────

import { initPanel } from './panel';
initPanel();
