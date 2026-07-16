import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const DEMO_EMAIL = process.env.EXPO_PUBLIC_V2_DEMO_EMAIL ?? 'demo@pocketrep.pro';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_V2_DEMO_PASSWORD ?? 'PocketRepDemo2026!';

let inflight: Promise<void> | null = null;

// P0-1: now called ONLY from an explicit "Try the demo" tap (AppShell's
// handleTryDemo), not automatically on every mount — so a failure here must
// reach the caller as a real error (AuthScreen shows it inline) instead of the
// button silently doing nothing. Was previously console.warn-and-swallow, which
// was fine when this ran unattended at boot; it isn't fine for a user action.
export async function ensureDemoSession(): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return;

    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) throw error;
  })();

  try {
    await inflight;
  } finally {
    inflight = null;
  }
}
