// NQ-MTF v3.4 — Background Service Worker
// Receives forwarded WS data from content script.
// Future: cross-tab sync, price alerts, storage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WS_DATA') {
    sendResponse({ ok: true });
  }
  return false;
});

console.log('[NQ-MTF] Background service worker active.');
