// Always-on "Hey Rex" wake-word listener for the v2 web surface.
// Uses the Web Speech API (Chrome/Edge/Safari iOS 14.5+); on unsupported
// platforms start() resolves with `supported: false` and the orb stays
// push-to-talk only.
//
// State machine:
//   IDLE       → continuous interim listen; scan for "hey rex"
//   AWAKE      → user said "hey rex", accumulate their command. Each new
//                interim chunk resets a 4s silence timer.
//   PROCESSING → silence timer fired → emit utterance, caller decides
//                what to do next; we stay paused until caller .resume()s.

import { Platform } from 'react-native';

export type RexListenerState = 'idle' | 'awake' | 'processing' | 'denied' | 'unsupported';

export type RexListenerEvent =
  | { type: 'state'; state: RexListenerState }
  | { type: 'wake'; afterText: string }
  | { type: 'partial'; text: string }
  | { type: 'utterance'; text: string }
  | { type: 'error'; message: string };

type Options = {
  onEvent: (e: RexListenerEvent) => void;
  silenceMs?: number;
};

const WAKE_PATTERNS = [/\bhey\s*rex\b/i, /\bhi\s*rex\b/i, /\bok\s*rex\b/i];

function stripWake(text: string): string {
  let out = text;
  for (const p of WAKE_PATTERNS) out = out.replace(p, '');
  return out.trim().replace(/^[,.\s]+/, '');
}

function hasWake(text: string): boolean {
  return WAKE_PATTERNS.some(p => p.test(text));
}

function getSpeechRecognition(): any {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createHeyRexListener(opts: Options) {
  const silenceMs = opts.silenceMs ?? 4000;
  let recognition: any = null;
  let state: RexListenerState = 'idle';
  let awakeBuffer = ''; // text accumulated since wake
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let wantRunning = false;
  let restartAfterEnd = false;

  const setState = (s: RexListenerState) => {
    if (state === s) return;
    state = s;
    opts.onEvent({ type: 'state', state: s });
  };

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const scheduleSilence = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      const text = awakeBuffer.trim();
      awakeBuffer = '';
      if (text.length > 0) {
        setState('processing');
        opts.onEvent({ type: 'utterance', text });
      } else {
        setState('idle');
      }
    }, silenceMs);
  };

  const handleResult = (event: any) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const heard = (finalText + ' ' + interim).trim();
    if (!heard) return;

    if (state === 'idle') {
      if (hasWake(heard)) {
        const after = stripWake(heard);
        setState('awake');
        opts.onEvent({ type: 'wake', afterText: after });
        awakeBuffer = after;
        if (after) opts.onEvent({ type: 'partial', text: after });
        scheduleSilence();
      }
      return;
    }

    if (state === 'awake') {
      // While awake, keep latest interim/final as the buffer
      const cleaned = stripWake(heard);
      awakeBuffer = cleaned;
      opts.onEvent({ type: 'partial', text: cleaned });
      scheduleSilence();
    }
  };

  const start = async (): Promise<void> => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setState('unsupported');
      return;
    }
    if (Platform.OS === 'web') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the tracks — SpeechRecognition owns the mic itself,
        // we only requested permission.
        stream.getTracks().forEach(t => t.stop());
      } catch {
        setState('denied');
        return;
      }
    }

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = handleResult;
    recognition.onerror = (e: any) => {
      // 'no-speech' fires constantly during silence; ignore.
      if (e?.error === 'no-speech') return;
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setState('denied');
        wantRunning = false;
        return;
      }
      opts.onEvent({ type: 'error', message: e?.error ?? 'speech-error' });
    };
    recognition.onend = () => {
      // Chrome stops every few seconds when there's silence; auto-restart while
      // the caller still wants us running and we're not processing.
      if (wantRunning && state !== 'processing' && state !== 'denied' && state !== 'unsupported') {
        restartAfterEnd = true;
        try { recognition.start(); } catch { restartAfterEnd = false; }
      } else {
        restartAfterEnd = false;
      }
    };

    wantRunning = true;
    setState('idle');
    try { recognition.start(); } catch {
      // already started — fine
    }
  };

  const stop = () => {
    wantRunning = false;
    clearSilenceTimer();
    if (recognition) {
      try { recognition.stop(); } catch { /* ignore */ }
      recognition = null;
    }
    setState('idle');
  };

  // Caller can resume after handling an utterance to return to idle scanning.
  const resume = () => {
    awakeBuffer = '';
    clearSilenceTimer();
    if (!wantRunning) return;
    if (!recognition) { start(); return; }
    setState('idle');
    try { recognition.start(); } catch { /* already running */ }
  };

  return { start, stop, resume, getState: () => state };
}
