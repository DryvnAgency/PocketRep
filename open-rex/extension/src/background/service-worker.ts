import type { ScrapePayload, ScrapedCustomer } from '../../../shared/types';

const DEFAULT_BACKEND = 'http://localhost:3000';

async function getConfig(): Promise<{ backendUrl: string; dealerId: string; authSecret: string }> {
  const stored = await chrome.storage.local.get(['backendUrl', 'dealerId', 'authSecret']);
  return {
    backendUrl: stored.backendUrl || DEFAULT_BACKEND,
    dealerId: stored.dealerId || 'unknown-dealer',
    authSecret: stored.authSecret || '',
  };
}

async function scrapeActiveTab(): Promise<{ customers: ScrapedCustomer[]; platform: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('no active tab');

  const host = new URL(tab.url).hostname;
  let platform: ScrapePayload['platform'] = 'vinsolutions';
  if (host.includes('tekion')) platform = 'tekion';
  else if (host.includes('cdk')) platform = 'cdk';
  else if (host.includes('dealersocket')) platform = 'dealersocket';

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
    const { customers, platform } = await scrapeActiveTab();
    if (customers.length === 0) {
      await chrome.action.setBadgeText({ text: '0' });
      return;
    }
    const result = await postToBackend(customers, platform);
    await chrome.action.setBadgeText({ text: String(customers.length) });
    console.log('[open-rex] uploaded', result);
  } catch (err) {
    console.error('[open-rex] scrape flow failed', err);
    await chrome.action.setBadgeText({ text: 'ERR' });
  }
}

chrome.action.onClicked.addListener(runScrapeFlow);
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'scrape-crm') runScrapeFlow();
});
