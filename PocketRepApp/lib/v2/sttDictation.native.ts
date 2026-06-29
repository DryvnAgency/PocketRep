// Native (iOS/Android) implementation of the dictation API declared in
// sttDictation.ts. Uses @react-native-voice/voice → iOS Speech framework /
// Android SpeechRecognizer (fully on-device; no cloud STT vendor).
//
// Metro resolves this `.native.ts` on iOS/Android and the plain `.ts` on web,
// so @react-native-voice/voice never enters the web bundle. Requires a native
// dev/EAS build (the module is not available in Expo Go).

import Voice from '@react-native-voice/voice';
import type { DictationHandlers, Dictation } from './sttDictation';

export type { DictationHandlers, Dictation } from './sttDictation';

export function isDictationAvailable(): boolean {
  return !!Voice && typeof Voice.start === 'function';
}

export async function startDictation(handlers: DictationHandlers): Promise<Dictation> {
  let finalText = '';
  let ended = false;

  const cleanup = () => {
    try { Voice.removeAllListeners(); } catch { /* ignore */ }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    const text = finalText.trim();
    if (text) handlers.onFinal(text);
    cleanup();
    handlers.onEnd?.();
  };

  Voice.onSpeechPartialResults = (e: any) => {
    const t = e?.value?.[0] ?? '';
    if (t) { finalText = t; handlers.onPartial?.(t); }
  };
  Voice.onSpeechResults = (e: any) => {
    const t = e?.value?.[0] ?? '';
    if (t) finalText = t;
  };
  Voice.onSpeechError = (e: any) => {
    handlers.onError?.(e?.error?.message ?? e?.error?.code ?? 'speech-error');
    finish();
  };
  Voice.onSpeechEnd = () => finish();

  try {
    await Voice.start('en-US');
  } catch (e: any) {
    handlers.onError?.(e?.message ?? 'start-failed');
    finish();
  }

  return {
    stop: () => { Voice.stop().catch(() => undefined); },
  };
}
