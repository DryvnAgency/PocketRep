// Local-only settings for the always-listening Hey Rex feature.
// Stored under window.localStorage so each browser remembers independently;
// native paths fall through to in-memory state until we wire SecureStore.

import { Platform } from 'react-native';

const KEY = 'pocketrep:v2:hey-rex-always-on';
const DISCLOSURE_KEY = 'pocketrep:v2:hey-rex-disclosure-seen';
const EVENT_NAME = 'pocketrep:hey-rex-changed';

let mem = false;
let memDisclosure = false;

export function getAlwaysListenEnabled(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem;
  return localStorage.getItem(KEY) === '1';
}

export function setAlwaysListenEnabled(enabled: boolean): void {
  mem = enabled;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    if (enabled) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
  }
}

export function subscribeAlwaysListen(cb: (enabled: boolean) => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => cb((e as CustomEvent).detail?.enabled === true);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function hasSeenDisclosure(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return memDisclosure;
  return localStorage.getItem(DISCLOSURE_KEY) === '1';
}

export function markDisclosureSeen(): void {
  memDisclosure = true;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(DISCLOSURE_KEY, '1');
  }
}
