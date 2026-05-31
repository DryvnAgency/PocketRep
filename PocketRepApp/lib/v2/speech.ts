// Text-to-speech for the Hey Rex voice assistant — the piece that makes Rex
// feel like Siri (it talks back instead of just printing). The voice flow runs
// on web (Web Speech API), so this uses the browser's SpeechSynthesis and
// no-ops elsewhere. Safe to call anywhere.
//
// Web Speech speaks whole utterances (no token-level streaming), so the
// streaming helpers below approximate it: as Rex's reply streams in, we enqueue
// each *completed sentence* the moment it lands — so the voice starts before
// the full reply is ready, the way Siri does.

import { Platform } from 'react-native';

function pickVoiceLang(text: string): string {
  // Crude heuristic so Spanish drafts are spoken in a Spanish voice.
  return /[¿¡]|(?:\b(hola|gracias|carro|nomás|qué onda|avísame)\b)/i.test(text) ? 'es-MX' : 'en-US';
}

function getSynth(): SpeechSynthesis | undefined {
  if (Platform.OS !== 'web') return undefined;
  return typeof window !== 'undefined' ? window.speechSynthesis : undefined;
}

function utter(synth: SpeechSynthesis, text: string, lang?: string): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? pickVoiceLang(text);
  u.rate = 1.02;
  u.pitch = 1.0;
  synth.speak(u);
}

// One-shot: interrupt anything in flight and speak the whole line at once.
export function speak(text: string, lang?: string): void {
  const synth = getSynth();
  if (!synth) return;
  const clean = (text ?? '').trim();
  if (!clean) return;
  try {
    synth.cancel(); // interrupt any in-flight utterance, like Siri does
    spokenLen = 0;
    utter(synth, clean, lang);
  } catch {
    /* speech unsupported — silent */
  }
}

// --- Streaming TTS ---------------------------------------------------------
// `speakStreaming` is called repeatedly with the *cumulative* reply text. It
// enqueues any complete sentence it hasn't spoken yet (without cancelling the
// queue, so sentences play back-to-back). `finishStreaming` flushes the final
// fragment once the stream ends.
let spokenLen = 0;

export function speakStreaming(fullText: string, lang?: string): void {
  const synth = getSynth();
  if (!synth) return;
  const text = fullText ?? '';
  if (text.length <= spokenLen) return;
  const pending = text.slice(spokenLen);
  // Enqueue each complete sentence (ending in . ! ? …) in the new tail.
  const re = /[\s\S]*?[.!?…](?=\s|$)/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  try {
    while ((m = re.exec(pending)) !== null) {
      const sentence = m[0].trim();
      consumed = re.lastIndex;
      if (sentence) utter(synth, sentence, lang);
    }
  } catch {
    /* silent */
  }
  spokenLen += consumed;
}

export function finishStreaming(fullText: string, lang?: string): void {
  const synth = getSynth();
  if (!synth) return;
  const text = fullText ?? '';
  const tail = text.slice(spokenLen).trim();
  spokenLen = text.length;
  if (!tail) return;
  try {
    utter(synth, tail, lang);
  } catch {
    /* silent */
  }
}

export function isSpeaking(): boolean {
  const synth = getSynth();
  try {
    return !!(synth && (synth.speaking || synth.pending));
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  spokenLen = 0;
  const synth = getSynth();
  if (!synth) return;
  try { synth.cancel(); } catch { /* silent */ }
}
