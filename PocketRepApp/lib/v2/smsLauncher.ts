// Fires SMS drafts one-by-one into the native messaging app on the rep's
// phone. On web (PWA on iPhone home screen) this opens the iOS Messages app;
// on Chrome desktop it opens the OS handler if configured. On RN iOS/Android
// Linking.openURL handles it natively.
//
// We can't batch on web (each sms: URL is a separate user gesture), so the
// caller drives the loop with a small confirm-each pattern.

import { Linking, Platform } from 'react-native';

function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^\d]/g, '');
}

export type SendableDraft = {
  contact_id: string;
  contact_name: string;
  phone: string | null;
  message: string;
};

export async function launchSms(draft: SendableDraft): Promise<boolean> {
  const phone = digitsOnly(draft.phone);
  if (!phone) return false;
  // iOS prefers `&`, Android `?`. Use the universal pattern that both honor.
  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(draft.message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
