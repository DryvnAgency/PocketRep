// Clears every per-user localStorage cache on sign-out (P0-1 audit fix, HIGH).
// AppShell forces a full page reload on sign-out to wipe in-memory state, but a
// reload does NOT touch localStorage — and several per-user preferences live
// there: always-listen mic consent + the Hey Rex disclosure-seen flag
// (rexSettings.ts), onboarding-seen (rexSettings.ts), the Rex coach chat log +
// day summary (coachLog.ts), rep profile settings (repSettings.ts), and
// notification read/dismiss state (notificationReads.ts). On a shared/kiosk
// browser, the next person to sign in would silently inherit the previous
// rep's flags — most seriously, skipping the mic-consent disclosure for
// someone who never saw or agreed to it, and enabling always-listening for
// them without consent.
//
// Swept by PREFIX rather than a hand-maintained key list, so a future
// `pocketrep:v2:*` localStorage key is covered automatically — nobody has to
// remember to add it here when they add a new local cache.

import { Platform } from 'react-native';

const PREFIX = 'pocketrep:v2:';

export function clearLocalSessionState(): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  // Collect keys before removing — mutating localStorage mid-iteration shifts
  // its live index and can skip entries.
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
}
