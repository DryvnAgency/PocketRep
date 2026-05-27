// Expo Push registration. Fetches the device's Expo push token (iOS,
// Android) and stores it in public.user_push_tokens so the send-push
// and nurture-scheduler edge functions can fan-out to it.
//
// Web push tokens via Expo SDK aren't supported on every runtime; if the
// device doesn't support push or permission is denied, we silently no-op.
// Failure is never user-facing here.

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const FUNCTIONS_BASE = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1';

let lastRegisteredToken: string | null = null;

function loadNotifications(): any {
  // Static require so Metro can do dependency analysis. If the module isn't
  // installed (or throws on web), the try/catch returns null and we no-op.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications');
  } catch {
    return null;
  }
}

export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const Notifications = loadNotifications();
  if (!Notifications) return null;

  let token: string | null = null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID as string | undefined;
    const opts = projectId ? { projectId } : undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(opts);
    token = tokenData?.data ?? null;
  } catch {
    return null;
  }

  if (!token) return null;
  if (token === lastRegisteredToken) return token;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase
    .from('user_push_tokens')
    .upsert(
      {
        user_id: user.id,
        expo_token: token,
        platform: Platform.OS as 'ios' | 'android',
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_token' },
    );

  lastRegisteredToken = token;
  return token;
}

// Manual push trigger — used by Profile → "Send a test push".
export async function sendTestPush(): Promise<{ ok: boolean; reason?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: 'not signed in' };
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/send-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test push from Rex',
        body: 'If you got this, push is wired up.',
        data: { route: 'profile' },
      }),
    });
    if (!res.ok) return { ok: false, reason: `send-push ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'fetch failed' };
  }
}
