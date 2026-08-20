// Fires SMS drafts one-by-one into the native messaging app on the rep's
// phone. On web (PWA on iPhone home screen) this opens the iOS Messages app;
// on Chrome desktop it opens the OS handler if configured. On RN iOS/Android
// Linking.openURL handles it natively.
//
// IMPORTANT: launchSms returns 'opened' when the SMS *composer* opens, NOT when
// the user actually taps Send. There is no callback from the OS for that. Never
// mark a message as "sent" based on this return value — at best it's "opened".
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
  // Demo/tour contact — the send is SIMULATED (never dialed out to a carrier).
  isDemo?: boolean;
};

/** Result of attempting to launch the SMS composer. */
export type SmsLaunchResult = 'opened' | 'no_phone' | 'failed';

/**
 * Opens the native SMS composer pre-filled with the draft message.
 *
 * Returns `'opened'` when the composer was launched — this does NOT mean the
 * message was sent. Returns `'no_phone'` if the contact has no phone number,
 * or `'failed'` if the OS refused to open the sms: URL.
 */
export async function launchSms(draft: SendableDraft): Promise<SmsLaunchResult> {
  // The single guarantee that a demo/tour contact never receives a real carrier
  // SMS: short-circuit BEFORE any sms: intent. The caller records the outbound
  // and schedules the simulated replies. Returns 'opened' so the caller's send
  // loop treats it as delivered.
  if (draft.isDemo) return 'opened';

  const phone = digitsOnly(draft.phone);
  if (!phone) return 'no_phone';
  // iOS prefers `&`, Android `?`. Use the universal pattern that both honor.
  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(draft.message)}`;
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}
