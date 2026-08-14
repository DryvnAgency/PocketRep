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
import { supabase } from '@/lib/supabase';

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

// The robust sign-out behind every "Sign Out" control (v2 ProfileTab + the
// lockout screen, and the legacy v1 More tab). Fixes two failure modes that
// left users unable to log out:
//   1. The default signOut() uses scope:'global' — a NETWORK revoke round-trip.
//      If it hangs or fails (offline, slow, or an already-invalid session) the
//      promise never resolves, so a caller awaiting it is stuck (the ProfileTab
//      spinner spins forever) AND the SIGNED_OUT event that drives the reload
//      never fires. scope:'local' clears the session from storage immediately
//      with no network dependency.
//   2. Teardown is forced in a finally, independent of the auth event — so even
//      if signOut throws, per-user localStorage prefs are swept and (on web) the
//      page hard-reloads, guaranteeing the next rep on a shared device starts
//      from genuinely empty state. (The AppShell SIGNED_OUT listener still runs
//      the same teardown for sign-outs triggered by other means, e.g. session
//      expiry — belt and suspenders.)
export async function signOutAndReset(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* fall through — force teardown regardless of a signOut error */
  } finally {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      clearLocalSessionState();
      window.location.reload();
    }
  }
}
