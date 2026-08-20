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

// Onboarding completion — primary source of truth is profiles.onboarding_complete
// (follows the user across devices); localStorage is just a fast read-through
// cache so the disclosure modal doesn't flash on every load.
import { supabase } from '@/lib/supabase';

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
