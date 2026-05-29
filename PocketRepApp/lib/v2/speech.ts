// Text-to-speech for the Hey Rex voice assistant — the piece that makes Rex
// feel like Siri (it talks back instead of just printing). The voice flow runs
// on web (Web Speech API), so this uses the browser's SpeechSynthesis and
// no-ops elsewhere. Safe to call anywhere.

import { Platform } from 'react-native';

function pickVoiceLang(text: string): string {
  // Crude heuristic so Spanish drafts are spoken in a Spanish voice.
  return /[¿¡]|(?:\b(hola|gracias|carro|nomás|qué onda|avísame)\b)/i.test(text) ? 'es-MX' : 'en-US';
}

export function speak(text: string, lang?: string): void {
  if (Platform.OS !== 'web') return;
  const clean = (text ?? '').trim();
  if (!clean) return;
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  try {
    synth.cancel(); // interrupt any in-flight utterance, like Siri does
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang ?? pickVoiceLang(clean);
    u.rate = 1.02;
    u.pitch = 1.0;
    synth.speak(u);
  } catch {
    /* speech unsupported — silent */
  }
}

export function stopSpeaking(): void {
  if (Platform.OS !== 'web') return;
  try { window.speechSynthesis?.cancel(); } catch { /* silent */ }
}
