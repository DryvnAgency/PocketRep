import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const DEMO_EMAIL = process.env.EXPO_PUBLIC_V2_DEMO_EMAIL ?? 'demo@pocketrep.pro';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_V2_DEMO_PASSWORD ?? 'PocketRepDemo2026!';

let inflight: Promise<void> | null = null;

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
    if (error) {
      console.warn('[v2] demo sign-in failed:', error.message);
    }
  })();

  try {
    await inflight;
  } finally {
    inflight = null;
  }
}
