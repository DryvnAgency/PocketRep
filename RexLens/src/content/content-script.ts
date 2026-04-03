import type { PageContent, PageType, FormField, ClickableContact } from '../shared/types';
import type { ExtensionMessage } from '../shared/messages';

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

  // Chat platforms
  if (host.includes('messenger') || host.includes('web.whatsapp') ||
      host.includes('slack.com') || host.includes('teams.microsoft')) {
    return 'chat';
  }

  return 'generic';
}

// ── DOM Content Extraction ───────────────────────────────────────────────────

const NOISE_SELECTORS = [
  'nav', 'footer', 'header', '.ad', '.ads', '.advertisement',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  'script', 'style', 'noscript', 'svg', 'iframe',
  '.cookie-banner', '.cookie-consent', '#cookie-notice',
];

function extractText(root: Element | Document = document): string {
  // Clone to avoid mutation
  const clone = root.cloneNode(true) as Element;

  // Remove noise elements
  for (const sel of NOISE_SELECTORS) {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Get text content, collapse whitespace
  const text = clone.textContent || '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 6000); // Hard cap before AI token limit is applied
}

function extractConversations(): string[] {
  const conversations: string[] = [];

  // Email thread messages
  const emailMessages = document.querySelectorAll(
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
  const chatMessages = document.querySelectorAll(
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
  const text = document.body.textContent || '';

  // Email regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(text.match(emailRegex) || [])].slice(0, 10);

  // Phone regex (US format variations)
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = [...new Set(text.match(phoneRegex) || [])].slice(0, 10);

  // Names from common patterns (headings, profile elements, etc.)
  const nameElements = document.querySelectorAll(
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

function extractPageContent(): PageContent {
  const type = detectPageType();
  const contactInfo = extractContactInfo();

  return {
    type,
    title: document.title,
    url: window.location.href,
    mainText: extractText(),
    conversations: extractConversations(),
    formFields: detectFormFields(),
    contactNames: contactInfo.names,
    emails: contactInfo.emails,
    phones: contactInfo.phones,
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

const PLATFORM_CONTACT_SELECTORS = [
  // VinSolutions
  'a.customer-name', 'table a[href*="contact"]', 'table a[href*="customer"]',
  // DealerSocket
  '.contact-link', '.lead-name a',
  // Salesforce
  'a[data-refid]', '.slds-truncate a',
  // HubSpot
  'a.private-link', '.contact-name-link',
  // Gmail
  '.yP', '.gD',
  // LinkedIn
  '.msg-conversation-card__participant-names a',
];

// Supports: John Smith, O'Brien, McDonald, Jean-Pierre, De La Cruz
const NAME_PATTERN = /^[A-Z][a-zA-Z'-]+(?:\s(?:[A-Z][a-zA-Z'-]+|[a-z]{1,3})){1,3}$/;

function findClickableContacts(): ClickableContact[] {
  const results: ClickableContact[] = [];
  const seen = new Set<string>();

  let contactIndex = 0;

  // Try platform-specific selectors first
  for (const sel of PLATFORM_CONTACT_SELECTORS) {
    const elements = document.querySelectorAll<HTMLElement>(sel);
    for (const el of elements) {
      const contact = extractClickableContact(el, contactIndex);
      if (contact && !seen.has(contact.name)) {
        seen.add(contact.name);
        results.push(contact);
        contactIndex++;
      }
    }
  }

  // Generic: <a> inside <table> or [role="row"] with name-like text
  const genericLinks = document.querySelectorAll<HTMLAnchorElement>(
    'table a, [role="row"] a, [role="listitem"] a, .list-item a'
  );
  for (const el of genericLinks) {
    const contact = extractClickableContact(el, contactIndex);
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

  // Must look like a person's name: 2-3 capitalized words, 3-50 chars
  if (text.length < 3 || text.length > 50) return null;
  if (!NAME_PATTERN.test(text)) return null;

  // Must be clickable (link or has click handler)
  const isLink = el.tagName === 'A' && (el as HTMLAnchorElement).href;
  const isClickable = el.getAttribute('role') === 'link' || el.style.cursor === 'pointer'
    || el.onclick !== null || isLink;

  if (!isClickable) return null;

  const selector = buildUniqueSelector(el, index);
  const href = isLink ? (el as HTMLAnchorElement).href : '';

  return { name: text, selector, href };
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

  el.click();

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
  if (window.location.href !== savedUrl) {
    setTimeout(() => { window.location.href = savedUrl; }, 50);
  }

  return content;
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
    // Contenteditable (Gmail, LinkedIn, etc.)
    el.focus();

    // Select all existing content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Insert new text
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
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
        sendResponse(content);
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
        clickAndExtract(selector)
          .then(content => sendResponse({ success: true, content }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        break;
      }
    }

    return true; // Keep message channel open for async response
  }
);

// Let the service worker know the content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {});
