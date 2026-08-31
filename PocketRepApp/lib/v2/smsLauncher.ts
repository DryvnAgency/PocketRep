import { Alert, AppState, Linking, Platform } from 'react-native';
import { recordSmsOpened, markSmsSent, markSmsNotSent, recordSmsFailure, type SmsActionSource } from '@/lib/v2/smsActions';
import { isCurrentWebRuntimeSmsCapable } from '@/lib/v2/smsCapability';

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
 * `opened` is a legacy return name retained for existing callers. It means
 * the composer opened AND the rep explicitly confirmed they tapped Send.
 * The database status is `sent`; composer-open alone is never treated as sent.
 * `not_sent` means the rep returned without sending.
 */
export type SmsLaunchResult = 'opened' | 'not_sent' | 'no_phone' | 'unsupported' | 'failed';

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

function waitForComposerReturn(): Promise<void> {
  return new Promise(resolve => {
    let sawBackground = false;
    let settled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        sawBackground = true;
      } else if (next === 'active' && sawBackground) {
        setTimeout(finish, 150);
      }
    });

    function finish() {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      subscription.remove();
      resolve();
    }

    // Web/browser handoffs may not emit AppState transitions. On native, the
    // listener is installed BEFORE openURL, so the fallback cannot race ahead
    // of a background event that was emitted during the handoff.
    fallbackTimer = setTimeout(() => {
      if (!sawBackground) finish();
    }, 1500);
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
  if (draft.isDemo) return 'opened';

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

  if (Platform.OS === 'web' && !isCurrentWebRuntimeSmsCapable()) {
    await recordSmsFailure({
      contactId: draft.contact_id,
      message: draft.message,
      status: 'failed',
      source: draft.source,
    }).catch(() => undefined);
    return 'unsupported';
  }

  const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(draft.message)}`;
  let actionId: string | null = null;
  const returnPromise = waitForComposerReturn();
  try {
    if (Platform.OS === 'web') {
      // Mobile browsers can suspend JavaScript while Messages is open, leaving
      // the Linking promise unsettled until the rep returns. Treat that handoff
      // as opened after a short grace period; explicit confirmation below is
      // still required before anything is recorded as sent.
      await Promise.race([
        Linking.openURL(url),
        new Promise<void>(resolve => setTimeout(resolve, 1500)),
      ]);
    } else {
      await Linking.openURL(url);
    }
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

  await returnPromise;

  const sent = await confirmSent(draft.contact_name);
  if (actionId) {
    if (sent) {
      await markSmsSent(actionId).catch(() => undefined);
    } else {
      await markSmsNotSent(actionId).catch(() => undefined);
    }
  }
  return sent ? 'opened' : 'not_sent';
}
