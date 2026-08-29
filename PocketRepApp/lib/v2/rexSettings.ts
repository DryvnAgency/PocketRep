// V1 Rex settings.
//
// VOICE IS HARD-DISABLED IN V1. PocketRep ships text-only until V2 implements
// speech-to-text and text-to-speech as one deliberate experience. Keeping the
// old storage key here lets us actively clear stale browser state from earlier
// previews so an existing user cannot accidentally re-enable the old robotic
// browser voice.

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const KEY = 'pocketrep:v2:hey-rex-always-on';
const DISCLOSURE_KEY = 'pocketrep:v2:hey-rex-disclosure-seen';
const EVENT_NAME = 'pocketrep:hey-rex-changed';

let mem = false;

function clearLegacyVoiceState(): void {
  mem = false;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}

/** V1 invariant: Hey Rex listening is never enabled. */
export function getAlwaysListenEnabled(): boolean {
  clearLegacyVoiceState();
  return false;
}

/**
 * Retained for compatibility with existing callers, but V1 never accepts an
 * enable request. V2 can replace this hard lock when STT + TTS ship together.
 */
export function setAlwaysListenEnabled(_enabled: boolean): void {
  clearLegacyVoiceState();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled: false } }));
  }
}

/** V1 invariant: subscribers can only observe voice as disabled. */
export function subscribeAlwaysListen(cb: (enabled: boolean) => void): () => void {
  clearLegacyVoiceState();
  cb(false);
  return () => undefined;
}

/**
 * The disclosure is exclusively for the deferred always-listening microphone
 * feature, so V1 treats it as already handled and never renders it.
 */
export function hasSeenDisclosure(): boolean {
  clearLegacyVoiceState();
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(DISCLOSURE_KEY); } catch { /* ignore */ }
  }
  return true;
}

/** Compatibility no-op while voice is unavailable in V1. */
export function markDisclosureSeen(): void {
  clearLegacyVoiceState();
}

// Onboarding completion — primary source of truth is profiles.onboarding_complete
// (follows the user across devices); localStorage is just a fast read-through
// cache so onboarding does not flash again after completion.
const ONBOARDING_KEY = 'pocketrep:v2:onboarding-complete';
let memOnboarding = false;

export function hasCompletedOnboarding(): boolean {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return memOnboarding;
  return localStorage.getItem(ONBOARDING_KEY) === '1';
}

export async function markOnboardingComplete(): Promise<void> {
  // Persist to DB first — only cache locally after DB succeeds, so a failed
  // write doesn't permanently hide onboarding behind a stale localStorage flag.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', user.id);
    if (error) throw error;
  } catch {
    // DB write failed — don't cache. Onboarding will re-appear next session
    // so the rep doesn't lose their setup.
    return;
  }
  memOnboarding = true;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(ONBOARDING_KEY, '1');
  }
}

// Called on app boot — pulls the profile flag and seeds the localStorage
// cache so future hasCompletedOnboarding() reads are fast + accurate even
// after fresh installs.
export async function syncOnboardingFromProfile(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.onboarding_complete) {
      memOnboarding = true;
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(ONBOARDING_KEY, '1');
      }
    }
  } catch {
    /* silent */
  }
}
