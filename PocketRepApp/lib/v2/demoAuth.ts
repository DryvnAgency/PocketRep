import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Credentials come ONLY from build-time env (EXPO_PUBLIC_* is inlined by Metro).
// No hardcoded fallback: shipping a known demo password in the web bundle is a
// standing credential leak. When these are unset the demo must fail safe (see
// the guard in ensureDemoSession) rather than sign in with a baked-in password.
const DEMO_EMAIL = process.env.EXPO_PUBLIC_V2_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_V2_DEMO_PASSWORD ?? '';

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

    // Fail safe: never fall back to a known/blank password. If the deploy is
    // missing the demo credentials, surface a clear error to the caller instead.
    if (!DEMO_EMAIL || !DEMO_PASSWORD) {
      throw new Error('Live demo is not configured.');
    }

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
