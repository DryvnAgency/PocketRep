// Opens real SMS for real contacts and simulates the same send action for
// built-in demo contacts. Demo contacts are intentionally full-featured so a
// new rep can experience PocketRep end-to-end, but their fictional numbers
// must never reach the device's real messaging app.

import { Linking, Platform } from 'react-native';

function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^\d]/g, '');
}

export type SendableDraft = {
  contact_id: string;
  contact_name: string;
  phone: string | null;
  message: string;
  is_demo?: boolean;
};

export type SmsLaunchResult = {
  ok: boolean;
  simulated: boolean;
};

export async function launchSms(draft: SendableDraft): Promise<SmsLaunchResult> {
  // Demo contacts are deliberately allowed through the complete workflow.
  // Their "send" is simulated so the demo can never open a real SMS composer.
  if (draft.is_demo) return { ok: true, simulated: true };

  const phone = digitsOnly(draft.phone);
  if (!phone) return { ok: false, simulated: false };
  // iOS prefers `&`, Android `?`. Use the universal pattern that both honor.
  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(draft.message)}`;
  try {
    await Linking.openURL(url);
    return { ok: true, simulated: false };
  } catch {
    return { ok: false, simulated: false };
  }
}