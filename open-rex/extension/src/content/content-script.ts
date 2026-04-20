import * as vinsolutions from '../adapters/vinsolutions';
import type { ScrapedCustomer } from '../../../shared/types';

// Guard: if the content script was already loaded (either via manifest
// declaration OR a prior executeScript injection), bail out so we don't
// register duplicate onMessage listeners. Sets a flag on window that
// subsequent injections will see.
declare global {
  interface Window {
    __openRexLoaded?: boolean;
  }
}

if (!window.__openRexLoaded) {
  window.__openRexLoaded = true;

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
}
