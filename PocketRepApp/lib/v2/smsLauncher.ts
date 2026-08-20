import { Alert, AppState, Linking, Platform } from 'react-native';
import { recordSmsOpened, markSmsSent, markSmsNotSent, recordSmsFailure, type SmsActionSource } from '@/lib/v2/smsActions';

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
  source?: SmsActionSource;
};

/**
 * Result of an SMS action.
 *
 * `confirmed_sent` means the native composer opened AND the rep explicitly
 * confirmed they tapped Send. `not_sent` means the rep returned without
 * sending. PocketRep never claims carrier delivery because the native
 * Messages app does not expose that information to us.
 */
export type SmsLaunchResult = 'confirmed_sent' | 'not_sent' | 'no_phone' | 'failed';

function confirmSent(contactName: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(`Did you send the text to ${contactName}?`));
  }

  return new Promise(resolve => {
    Alert.alert(
      'Text confirmation',
      `Did you send the text to ${contactName}?`,
      [
        { text: 'Not Sent', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Yes, I Sent It', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

/**
 * Opens the native SMS composer pre-filled with the draft message.
 *
 * There is no OS callback telling PocketRep whether the rep tapped Send.
 * Therefore this records the composer opening, waits for the rep to return to
 * PocketRep, asks for explicit confirmation, and only then marks the outbound
 * action as `sent` or `not_sent`.
 */
export async function launchSms(draft: SendableDraft): Promise<SmsLaunchResult> {
  if (draft.isDemo) return 'confirmed_sent';

  const phone = digitsOnly(draft.phone);
  if (!phone) {
    await recordSmsFailure({
      contactId: draft.contact_id,
      message: draft.message,
      status: 'no_phone',
      source: draft.source,
    }).catch(() => undefined);
    return 'no_phone';
  }

  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(draft.message)}`;
  let actionId: string | null = null;
  try {
    await Linking.openURL(url);
    actionId = await recordSmsOpened({
      contactId: draft.contact_id,
      message: draft.message,
      source: draft.source ?? 'manual',
    });
  } catch {
    await recordSmsFailure({
      contactId: draft.contact_id,
      message: draft.message,
      status: 'failed',
      source: draft.source,
    }).catch(() => undefined);
    return 'failed';
  }

  // Wait for the app to return from Messages. On native this is the AppState
  // background → active transition. Some web/browser handoffs do not emit the
  // background event, so a short fallback prevents the flow from hanging.
  await new Promise<void>(resolve => {
    let sawBackground = false;
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      subscription.remove();
      resolve();
    };

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        sawBackground = true;
      } else if (next === 'active' && sawBackground) {
        setTimeout(finish, 150);
      }
    });

    fallbackTimer = setTimeout(() => {
      if (!sawBackground) finish();
    }, 1500);
  });

  const sent = await confirmSent(draft.contact_name);
  if (actionId) {
    if (sent) {
      await markSmsSent(actionId).catch(() => undefined);
    } else {
      await markSmsNotSent(actionId).catch(() => undefined);
    }
  }
  return sent ? 'confirmed_sent' : 'not_sent';
}
