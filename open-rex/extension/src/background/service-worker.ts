import type { ScrapePayload, ScrapedCustomer } from '../../../shared/types';

const DEFAULT_BACKEND = 'http://localhost:3000';
const CRM_PATTERNS = ['vinsolutions', 'tekion', 'cdk', 'dealersocket'] as const;

class UnsupportedHostError extends Error {
  constructor(host: string) {
    super(`Not a supported CRM page (${host}). Navigate to VinSolutions, Tekion, CDK, or DealerSocket first.`);
    this.name = 'UnsupportedHostError';
  }
}

async function getConfig(): Promise<{ backendUrl: string; dealerId: string; authSecret: string }> {
  const stored = await chrome.storage.local.get(['backendUrl', 'dealerId', 'authSecret']);
  return {
    backendUrl: stored.backendUrl || DEFAULT_BACKEND,
    dealerId: stored.dealerId || 'unknown-dealer',
    authSecret: stored.authSecret || '',
  };
}

async function scrapeTab(): Promise<{ customers: ScrapedCustomer[]; platform: ScrapePayload['platform'] }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('no active tab');

  const hostname = new URL(tab.url).hostname;
  const platform = CRM_PATTERNS.find((p) => hostname.includes(p)) as ScrapePayload['platform'] | undefined;
  if (!platform) throw new UnsupportedHostError(hostname);

  // Inject the content script on demand. Handles the two failure modes
  // of the manifest-declared injection:
  //   1) tab was loaded before the extension was installed/reloaded
  //   2) user clicks the icon on a tab that was never matched at load time
  // executeScript is idempotent from the user's view — double injection
  // is guarded by window.__openRexLoaded inside the content script.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['dist/content-script.js'],
    });
  } catch (_) {
    // Swallow: the script may already be present, or host_permissions
    // may not cover this tab. sendMessage will surface the real error.
  }

  // Small delay so the freshly-injected listener is registered before
  // sendMessage. 100 ms is enough in practice; keeps things snappy.
  await new Promise((r) => setTimeout(r, 100));

  const response = await chrome.tabs.sendMessage(tab.id, { type: 'open-rex:scrape' });
  if (!response?.ok) throw new Error(response?.error || 'scrape failed');
  return { customers: response.customers as ScrapedCustomer[], platform };
}

async function postToBackend(customers: ScrapedCustomer[], platform: ScrapePayload['platform']) {
  const { backendUrl, dealerId, authSecret } = await getConfig();
  const payload: ScrapePayload = {
    dealerId,
    platform,
    scrapedAt: new Date().toISOString(),
    customers,
  };
  const res = await fetch(`${backendUrl}/api/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authSecret}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`backend responded ${res.status}`);
  return res.json();
}

async function runScrapeFlow() {
  try {
    const { customers, platform } = await scrapeTab();
    if (customers.length === 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#5e6472' });
      await chrome.action.setBadgeText({ text: '0' });
      return;
    }
    const result = await postToBackend(customers, platform);
    await chrome.action.setBadgeBackgroundColor({ color: '#7a4dff' });
    await chrome.action.setBadgeText({ text: String(customers.length) });
    console.log('[open-rex] uploaded', result);
  } catch (err) {
    console.error('[open-rex] scrape flow failed', err);
    if (err instanceof UnsupportedHostError) {
      await chrome.action.setBadgeBackgroundColor({ color: '#5e6472' });
      await chrome.action.setBadgeText({ text: 'N/A' });
    } else {
      await chrome.action.setBadgeBackgroundColor({ color: '#e05252' });
      await chrome.action.setBadgeText({ text: 'ERR' });
    }
  }
}

chrome.action.onClicked.addListener(runScrapeFlow);
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'scrape-crm') runScrapeFlow();
});
