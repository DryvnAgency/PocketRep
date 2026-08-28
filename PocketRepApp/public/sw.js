/**
 * PocketRep PWA service worker — minimal offline app-shell.
 *
 * Goal: an installed PWA launched offline should open the app shell (and show
 * the app's own retry/error states) instead of the browser's "No Internet"
 * page, and repeat launches should be fast.
 *
 * Strategy (deliberately conservative for launch):
 *   - Navigations (the SPA document): NETWORK-FIRST, falling back to the cached
 *     shell only when the network fails. Online users therefore ALWAYS get the
 *     freshest HTML — no stale-shell lock-in.
 *   - Hashed, immutable build assets (/_expo/*, /assets/*): cache-first.
 *   - Everything else — Supabase, ai-proxy, OpenRouter, Expo push, any
 *     cross-origin request — is passed straight through and NEVER cached, so
 *     auth/data/API traffic is untouched.
 *
 * Bump CACHE to invalidate the precache on a breaking shell change.
 */
const CACHE = 'pocketrep-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  // Only handle same-origin GETs — never intercept API/auth/cross-origin.
  if (url.origin !== self.location.origin) return;

  // SPA navigations → network-first, cached shell as the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Hashed, immutable build assets → cache-first, then populate the cache.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
  }
});
