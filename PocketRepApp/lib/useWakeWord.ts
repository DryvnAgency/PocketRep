import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';

// ── useWakeWord ───────────────────────────────────────────────────────────────
// Cross-platform "Hey Rex" wake word detection.
//
// Native (iOS + Android): @react-native-voice/voice
//   • iOS: SFSpeechRecognizer — on-device, no network
//   • Android: android.speech.SpeechRecognizer — typically network
//   • Restart loop handles iOS 60-second limit + Android silence timeout
//
// Web: window.SpeechRecognition continuous mode with restart on end
//
// Fuzzy matching catches phonetic mishearings:
//   "hey rex", "hay rex", "hey wrecks", "okay rex", "ok rex", etc.

const isWeb = Platform.OS === 'web';

// Lazy-load to avoid crashing if native module not linked yet
let Voice: any = null;
try {
  Voice = require('@react-native-voice/voice').default;
} catch {}

// ── Fuzzy "Hey Rex" matcher ───────────────────────────────────────────────────
function isHeyRex(text: string): boolean {
  const t = text.toLowerCase().trim();
  // Primary: (hey|hay|ok|okay) + (rex|wrecks|racks|recks|recs|rx)
  if (/\b(hey|hay|ok|okay)\s+(rex|wrecks|racks|recks|recs|rx)\b/.test(t)) return true;
  // Fallback: starts with hey/hay + anything sounding like rex
  if (/^(hey|hay)\s+r[aeiou]?[xkcs]s?\b/.test(t)) return true;
  return false;
}

// ── Hook interface ────────────────────────────────────────────────────────────
interface UseWakeWordOptions {
  enabled: boolean;
  onDetected: () => void;
}

interface UseWakeWordResult {
  isListening: boolean;
  reset: () => void;
  stop: () => Promise<void>;
}

export function useWakeWord({ enabled, onDetected }: UseWakeWordOptions): UseWakeWordResult {
  const [isListening, setIsListening] = useState(false);
  const activeRef = useRef(false);       // true while recognition is running
  const detectedRef = useRef(false);     // guard: fire onDetected only once per session
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function clearRestartTimer() {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function fireDetected() {
    if (detectedRef.current) return; // already fired
    detectedRef.current = true;
    activeRef.current = false;
    setIsListening(false);
    clearRestartTimer();
    onDetectedRef.current();
  }

  // ── Web implementation ───────────────────────────────────────────────────────

  const webRecognitionRef = useRef<any>(null);

  function startWeb() {
    if (!isWeb) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (isHeyRex(text)) { fireDetected(); return; }
      }
    };

    r.onend = () => {
      if (!activeRef.current) return;
      // Restart after a brief gap
      restartTimerRef.current = setTimeout(() => {
        if (activeRef.current) startWeb();
      }, 200);
    };

    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        activeRef.current = false;
        setIsListening(false);
        return;
      }
      // Transient errors — restart
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startWeb();
        }, 500);
      }
    };

    webRecognitionRef.current = r;
    try {
      r.start();
      setIsListening(true);
    } catch {}
  }

  function stopWeb() {
    try { webRecognitionRef.current?.stop(); } catch {}
    webRecognitionRef.current = null;
    setIsListening(false);
  }

  // ── Native implementation ────────────────────────────────────────────────────

  function startNative() {
    if (!Voice) return;
    Voice.start('en-US').catch(() => {
      // If start fails (e.g. mic busy), retry after a short delay
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startNative();
        }, 800);
      }
    });
  }

  // Partial results fire continuously — best for catching "hey rex" fast
  function onPartialResults(e: any) {
    const parts: string[] = e?.value ?? [];
    for (const p of parts) {
      if (isHeyRex(p)) { fireDetected(); return; }
    }
  }

  function onResults(e: any) {
    const parts: string[] = e?.value ?? [];
    for (const p of parts) {
      if (isHeyRex(p)) { fireDetected(); return; }
    }
  }

  // Recognition stopped (silence timeout or iOS 60s) — restart if still active
  function onSpeechEnd() {
    if (!activeRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      if (activeRef.current) startNative();
    }, 150);
  }

  function onSpeechError(e: any) {
    if (!activeRef.current) return;
    // "no-speech" is normal silence — restart immediately
    // Other errors: short backoff
    const delay = e?.error?.code === '7' ? 150 : 600;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      if (activeRef.current) startNative();
    }, delay);
  }

  async function stopNative() {
    clearRestartTimer();
    try { await Voice.stop(); } catch {}
    try { await Voice.destroy(); } catch {}
    setIsListening(false);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      // Tear down
      activeRef.current = false;
      detectedRef.current = false;
      clearRestartTimer();
      if (isWeb) {
        stopWeb();
      } else if (Voice) {
        stopNative();
      }
      return;
    }

    // Start up
    activeRef.current = true;
    detectedRef.current = false;

    if (isWeb) {
      startWeb();
    } else if (Voice) {
      Voice.onSpeechPartialResults = onPartialResults;
      Voice.onSpeechResults = onResults;
      Voice.onSpeechEnd = onSpeechEnd;
      Voice.onSpeechError = onSpeechError;
      startNative();
      setIsListening(true);
    }

    return () => {
      activeRef.current = false;
      clearRestartTimer();
      if (isWeb) {
        stopWeb();
      } else if (Voice) {
        // Detach listeners; don't await to avoid async cleanup issues
        Voice.onSpeechPartialResults = null;
        Voice.onSpeechResults = null;
        Voice.onSpeechEnd = null;
        Voice.onSpeechError = null;
        Voice.stop().catch(() => {});
        Voice.destroy().catch(() => {});
      }
    };
  }, [enabled]);

  // ── Public API ───────────────────────────────────────────────────────────────

  // reset() — call after the recording session ends to restart listening
  const reset = useCallback(() => {
    if (!enabled) return;
    detectedRef.current = false;
    activeRef.current = true;
    clearRestartTimer();
    if (isWeb) {
      stopWeb();
      setTimeout(startWeb, 100);
    } else if (Voice) {
      Voice.onSpeechPartialResults = onPartialResults;
      Voice.onSpeechResults = onResults;
      Voice.onSpeechEnd = onSpeechEnd;
      Voice.onSpeechError = onSpeechError;
      Voice.stop().catch(() => {}).finally(() => {
        if (activeRef.current) startNative();
      });
      setIsListening(true);
    }
  }, [enabled]);

  // stop() — call before expo-av takes the mic
  const stop = useCallback(async () => {
    activeRef.current = false;
    detectedRef.current = false;
    clearRestartTimer();
    if (isWeb) {
      stopWeb();
    } else if (Voice) {
      await stopNative();
    }
  }, []);

  return { isListening, reset, stop };
}
