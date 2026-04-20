import * as vinsolutions from '../adapters/vinsolutions';
import type { ScrapedCustomer } from '../../../shared/types';

function pickAdapter() {
  const host = location.hostname;
  if (vinsolutions.matches(host)) return vinsolutions;
  return null;
}

async function scrape(): Promise<ScrapedCustomer[]> {
  const adapter = pickAdapter();
  if (!adapter) return [];
  await adapter.prepare();
  return adapter.extract();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'open-rex:scrape') {
    scrape()
      .then((customers) => sendResponse({ ok: true, customers }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
