// On-device, push-to-talk dictation for Rex voice input.
//
// This is the DEFAULT + web implementation (Web Speech API). The native
// implementation lives in `sttDictation.native.ts` (iOS Speech framework /
// Android SpeechRecognizer via @react-native-voice/voice) — Metro picks the
// `.native.ts` file on iOS/Android and this `.ts` file on web, so the native
// module never enters the web bundle.
//
// Replaces the old expo-av -> /ai-proxy/whisper path (that route is a 501 stub).
// Recognition runs on-device; no audio leaves the phone/browser.

export type DictationHandlers = {
  // Live interim transcript as the user speaks (best-effort; not all engines).
  onPartial?: (text: string) => void;
  // Final transcript once recognition ends (or stop() is called).
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export type Dictation = { stop: () => void };

function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationAvailable(): boolean {
  return getSpeechRecognition() != null;
}

export async function startDictation(handlers: DictationHandlers): Promise<Dictation> {
  const SR = getSpeechRecognition();
  if (!SR) {
    handlers.onError?.('unsupported');
    handlers.onEnd?.();
    return { stop: () => undefined };
  }

  const recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  let finalText = '';
  let ended = false;

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (interim) handlers.onPartial?.(interim);
  };
  recognition.onerror = (e: any) => {
    if (e?.error === 'no-speech') return; // fires on silence; let onend handle it
    handlers.onError?.(e?.error ?? 'speech-error');
  };
  recognition.onend = () => {
    if (ended) return;
    ended = true;
    const text = finalText.trim();
    if (text) handlers.onFinal(text);
    handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    handlers.onError?.('start-failed');
    handlers.onEnd?.();
  }

  return {
    stop: () => { try { recognition.stop(); } catch { /* ignore */ } },
  };
}
