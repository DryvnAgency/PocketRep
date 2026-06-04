// NEW 6 — Rex coach daily activity log + midnight rollover summary.
//
// The coach thread is otherwise in-memory (RexCoach reseeds on every open). This
// persists the current calendar day's commands/actions + conversational turns so
// they're restored when the rep reopens the coach, and at the day boundary
// collapses the prior day into a one-line SUMMARY that carries over (the raw
// thread is cleared). Per-device, localStorage on web (in-memory fallback on
// native) — same pattern as notificationReads. Pure persistence/summary: it
// grants no new write powers.

import { Platform } from 'react-native';
import { callBrain } from './aiProxy';

export type CoachEntry = { role: 'user' | 'rex'; text: string; time: string };

const LOG_KEY = 'pocketrep:v2:coach-log';
const SUMMARY_KEY = 'pocketrep:v2:coach-summary';
const MAX_ENTRIES = 100;

type CoachDay = { date: string; entries: CoachEntry[] };
type CoachSummary = { date: string; text: string };

let memLog: CoachDay | null = null;
let memSummary: CoachSummary | null = null;

// Local calendar date (NOT UTC) so the reset happens at the rep's local midnight.
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readJSON<T>(key: string, mem: T | null): T | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeLog(val: CoachDay): void {
  memLog = val;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(val)); } catch { /* ignore */ }
  }
}

function writeSummary(val: CoachSummary): void {
  memSummary = val;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(val)); } catch { /* ignore */ }
  }
}

function readLog(): CoachDay {
  return readJSON<CoachDay>(LOG_KEY, memLog) ?? { date: localDate(), entries: [] };
}

// Today's restored entries (empty if the stored log is from a prior day — the
// stale-guard means a missed rollover never shows yesterday's thread as today's).
export function getTodayLog(): CoachEntry[] {
  const log = readLog();
  return log.date === localDate() ? log.entries : [];
}

export function appendCoachEntry(entry: CoachEntry): void {
  const today = localDate();
  let log = readLog();
  if (log.date !== today) log = { date: today, entries: [] };
  writeLog({ date: today, entries: [...log.entries, entry].slice(-MAX_ENTRIES) });
}

// The carried-over recap of the most recently completed day (or null).
export function getCarrySummary(): string | null {
  const s = readJSON<CoachSummary>(SUMMARY_KEY, memSummary);
  return s?.text?.trim() || null;
}

async function summarizeDay(entries: CoachEntry[]): Promise<string> {
  const transcript = entries
    .map(e => `${e.role === 'user' ? 'Rep' : 'Rex'}: ${e.text}`)
    .join('\n')
    .slice(0, 6000);
  const prompt = `Summarize this rep's day with their Rex assistant into ONE tight recap line. Count the concrete actions taken (contacts added, reminders set, deals logged, follow-ups scheduled, tier changes) and name the main things discussed. Example: "Today: added 2 contacts, set 1 reminder, logged 1 deal, worked an X5 payment objection." Return only the one line, no preamble.

${transcript}`;
  const raw = await callBrain({ maxTokens: 200, messages: [{ role: 'user', content: prompt }] });
  return (raw ?? '').trim();
}

// Run on app open. If the stored log is from a previous calendar day, summarize
// it into the carry summary and start today fresh. Idempotent (returns early on
// the same day) and best-effort (a failed summary just clears the day).
export async function rolloverCoachLog(): Promise<void> {
  const today = localDate();
  const log = readLog();
  if (log.date === today) return;
  if (log.entries.length > 0) {
    try {
      const text = await summarizeDay(log.entries);
      if (text) writeSummary({ date: log.date, text });
    } catch {
      /* best-effort — still clear below so the new day starts clean */
    }
  }
  writeLog({ date: today, entries: [] });
}
