// Local-only settings for the always-listening Hey Rex feature.
// Stored under window.localStorage so each browser remembers independently;
// native paths fall through to in-memory state until we wire SecureStore.

import { Platform } from 'react-native';

const KEY = 'pocketrep:v2:hey-rex-always-on';

export function getAlwaysListenEnabled(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(KEY) === '1';
}

export function setAlwaysListenEnabled(enabled: boolean): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  if (enabled) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
}

const DISCLOSURE_KEY = 'pocketrep:v2:hey-rex-disclosure-seen';

export function hasSeenDisclosure(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DISCLOSURE_KEY) === '1';
}

export function markDisclosureSeen(): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  localStorage.setItem(DISCLOSURE_KEY, '1');
}
