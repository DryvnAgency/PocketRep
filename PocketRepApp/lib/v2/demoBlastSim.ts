// Demo-blast simulation. Demo/tour contacts never send a real SMS (see
// smsLauncher.launchSms) — instead, when the rep "sends" a blast to the 3 demo
// customers, we schedule realistic inbound replies so the tour shows a live
// conversation without touching a carrier.
//
// Each reply, when due, is written exactly like a real inbound reply:
//   • logInteraction(contactId,'text',reply)  → activity timeline + Daily Check-In
//   • markNurtureReply(positive)              → flips the blast row's reply cols,
//                                               bumps heat +20 + last_contact=today
//                                               so the demo jumps on the Heat Sheet
//
// Persistence + dedup: one localStorage entry per (blast message) keyed by the
// nurture_messages row id, with a `responded` flag. `materializeDueResponses()`
// runs on app mount and on a short timer; a reply fires at most once even across
// refresh/reload (offsets already past simply fire on the next tick).
// Per-device, localStorage on web + in-memory fallback on native — same pattern
// as coachLog.ts. Grants no new powers; only replays simulated demo activity.

import { Platform } from 'react-native';
import { logInteraction } from './interactions';
import { markNurtureReply } from './manualReplyTracker';

const KEY = 'pocketrep:v2:demo-blast-sim';

// Activation should show the payoff quickly. The first demo reply lands fast
// enough to create the aha moment; later replies keep the book feeling alive.
const OFFSETS_MS = [5_000, 18_000, 40_000];

// Realistic, positive-leaning replies — obviously a warm demo, not cartoonish.
const REPLIES = [
  "hey yeah I'm definitely still interested, what can you do on the numbers?",
  "perfect timing, I was just thinking about this. when could I come take a look?",
  "appreciate you reaching out. what do you have available right now?",
];

type SimEntry = {
  contactId: string;
  nurtureMessageId: string;
  sentAt: number;
  offsetMs: number;
  replyText: string;
  responded: boolean;
};
type SimStore = { entries: SimEntry[] };

let mem: SimStore | null = null;

function read(): SimStore {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem ?? { entries: [] };
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as SimStore) : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function write(val: SimStore): void {
  mem = val;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(KEY, JSON.stringify(val)); } catch { /* ignore quota */ }
  }
}

export function registerDemoSend(contactId: string, nurtureMessageId: string, index: number): void {
  if (!nurtureMessageId) return;
  const store = read();
  if (store.entries.some(e => e.nurtureMessageId === nurtureMessageId)) return;
  const i = Math.min(Math.max(index, 0), OFFSETS_MS.length - 1);
  store.entries.push({
    contactId,
    nurtureMessageId,
    sentAt: Date.now(),
    offsetMs: OFFSETS_MS[i],
    replyText: REPLIES[i % REPLIES.length],
    responded: false,
  });
  write(store);
}

export function hasPendingDemoResponses(): boolean {
  return read().entries.some(e => !e.responded);
}

let materializing = false;

export async function materializeDueResponses(): Promise<number> {
  if (materializing) return 0;
  materializing = true;
  let fired = 0;
  try {
    const store = read();
    const now = Date.now();
    for (const e of store.entries) {
      if (e.responded) continue;
      if (now - e.sentAt < e.offsetMs) continue;
      try {
        await logInteraction(e.contactId, 'text', e.replyText);
        await markNurtureReply({
          nurtureMessageId: e.nurtureMessageId,
          contactId: e.contactId,
          kind: 'positive',
          replyText: e.replyText,
        });
        e.responded = true;
        write(store);
        fired++;
      } catch {
        // leave unresponded — retried on the next tick
      }
    }
  } finally {
    materializing = false;
  }
  return fired;
}

export function clearDemoSim(): void {
  write({ entries: [] });
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}

export function dueEntries(store: SimStore, now: number): SimEntry[] {
  return store.entries.filter(e => !e.responded && now - e.sentAt >= e.offsetMs);
}
