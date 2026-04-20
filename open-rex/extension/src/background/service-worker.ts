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

  // Ensure content script is injected (handles tabs open before extension install)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['dist/content-script.js'],
    });
  } catch (_) {
    // Already injected — ignore "cannot inject" errors
  }

  // Small delay to let the newly-injected script register its listener
  await new Promise((r) => setTimeout(r, 100));

  const response = await chrome.tabs.sendMessage(tab.id, { type: 'open-rex:scrape' });
  if (!response?.ok) throw new Error(response?.error || 'scrape failed');
  return { customers: response.customers as ScrapedCustomer[], platform };
}

async function uploadScrape(
  customers: ScrapedCustomer[],
  platform: ScrapePayload['platform'],
): Promise<{ customerIds: string[] }> {
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
  if (!res.ok) throw new Error(`scrape responded ${res.status}`);
  const json = (await res.json()) as { customerIds?: string[] };
  return { customerIds: json.customerIds ?? [] };
}

async function generateDrafts(customerIds: string[]): Promise<{ generated: number }> {
  const { backendUrl, authSecret } = await getConfig();
  const res = await fetch(`${backendUrl}/api/drafts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authSecret}`,
    },
    body: JSON.stringify({ customerIds }),
  });
  if (!res.ok) throw new Error(`drafts responded ${res.status}`);
  const json = (await res.json()) as { generated?: number };
  return { generated: json.generated ?? 0 };
}

async function runScrapeFlow() {
  try {
    const { customers, platform } = await scrapeTab();
    if (customers.length === 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#5e6472' });
      await chrome.action.setBadgeText({ text: '0' });
      return;
    }
    const { customerIds } = await uploadScrape(customers, platform);
    // Chain: bespoke, angle-rotated drafts are queued immediately after upload.
    const { generated } = await generateDrafts(customerIds);
    await chrome.action.setBadgeBackgroundColor({ color: '#7a4dff' });
    await chrome.action.setBadgeText({ text: `${generated}d` });
    console.log('[open-rex] scrape + drafts complete', { scraped: customers.length, generated });
  } catch (err) {
    console.error('[open-rex] flow failed', err);
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
