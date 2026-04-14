import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';

// ── useWakeWord ───────────────────────────────────────────────────────────────
// Cross-platform "Hey Rex" wake word detection.
//
// Native (iOS + Android): expo-speech-recognition
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
let ExpoSR: any = null;
try {
  ExpoSR = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {}

// ── Fuzzy "Hey Rex" matcher ───────────────────────────────────────────────────
function isHeyRex(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/\b(hey|hay|ok|okay)\s+(rex|wrecks|racks|recks|recs|rx)\b/.test(t)) return true;
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function clearRestartTimer() {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function fireDetected() {
    if (detectedRef.current) return;
    detectedRef.current = true;
    activeRef.current = false;
    setIsListening(false);
    clearRestartTimer();
    if (!isWeb) ExpoSR?.stop();
    onDetectedRef.current();
  }

  // ── Native (expo-speech-recognition) ─────────────────────────────────────────

  function startNative() {
    if (!ExpoSR) return;
    try {
      ExpoSR.start({ lang: 'en-US', continuous: true, interimResults: true });
      setIsListening(true);
    } catch {
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startNative();
        }, 800);
      }
    }
  }

  function stopNative() {
    clearRestartTimer();
    try { ExpoSR?.stop(); } catch {}
    setIsListening(false);
  }

  // ── Web (window.SpeechRecognition) ───────────────────────────────────────────

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
        if (isHeyRex(e.results[i][0].transcript)) { fireDetected(); return; }
      }
    };
    r.onend = () => {
      if (!activeRef.current) return;
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
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startWeb();
        }, 500);
      }
    };

    webRecognitionRef.current = r;
    try { r.start(); setIsListening(true); } catch {}
  }

  function stopWeb() {
    try { webRecognitionRef.current?.stop(); } catch {}
    webRecognitionRef.current = null;
    setIsListening(false);
  }

  // ── Native event subscriptions (registered once, guarded by activeRef) ────────

  useEffect(() => {
    if (isWeb || !ExpoSR) return;

    const subs = [
      ExpoSR.addListener('result', (e: any) => {
        if (!activeRef.current) return;
        const results: Array<{ transcript: string }> = e.results ?? [];
        for (const r of results) {
          if (isHeyRex(r.transcript ?? '')) { fireDetected(); return; }
        }
      }),
      ExpoSR.addListener('end', () => {
        if (!activeRef.current) return;
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startNative();
        }, 150);
      }),
      ExpoSR.addListener('error', (e: any) => {
        if (!activeRef.current) return;
        // 'no-speech' is normal silence — restart fast; other errors: short backoff
        const delay = e.error === 'no-speech' ? 150 : 600;
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) startNative();
        }, delay);
      }),
    ];

    return () => { subs.forEach((s) => s.remove()); };
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      detectedRef.current = false;
      clearRestartTimer();
      if (isWeb) stopWeb();
      else stopNative();
      return;
    }

    activeRef.current = true;
    detectedRef.current = false;
    if (isWeb) startWeb();
    else startNative();

    return () => {
      activeRef.current = false;
      clearRestartTimer();
      if (isWeb) stopWeb();
      else stopNative();
    };
  }, [enabled]);

  // ── Public API ────────────────────────────────────────────────────────────────

  // reset() — call after the recording session ends to restart listening
  const reset = useCallback(() => {
    if (!enabled) return;
    detectedRef.current = false;
    activeRef.current = true;
    clearRestartTimer();
    if (isWeb) { stopWeb(); setTimeout(startWeb, 100); }
    else { stopNative(); setTimeout(startNative, 100); }
  }, [enabled]);

  // stop() — call before expo-av takes the mic
  const stop = useCallback(async () => {
    activeRef.current = false;
    detectedRef.current = false;
    clearRestartTimer();
    if (isWeb) stopWeb();
    else stopNative();
  }, []);

  return { isListening, reset, stop };
}
