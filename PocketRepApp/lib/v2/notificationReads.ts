// Per-device read/dismissed state for the notifications inbox.
//
// Notifications are DERIVED from live data (nurture drafts, awaiting replies,
// overdue contacts) — there's no notifications table — so we only need to
// remember which ones the rep has read or dismissed. Keys are UUID-based
// (e.g. "nurture:<id>"), so collisions across users on a shared browser are
// negligible. Stored in localStorage (web); in-memory fallback on native.

import { Platform } from 'react-native';

const READ_KEY = 'pocketrep:v2:notif-read';
const DISMISS_KEY = 'pocketrep:v2:notif-dismissed';
const EVENT_NAME = 'pocketrep:notif-reads-changed';

let memRead: string[] = [];
let memDismiss: string[] = [];

function readList(key: string, mem: string[]): string[] {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  if (key === READ_KEY) memRead = list;
  else memDismiss = list;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(list));
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function getReadSet(): Set<string> {
  return new Set(readList(READ_KEY, memRead));
}

export function getDismissedSet(): Set<string> {
  return new Set(readList(DISMISS_KEY, memDismiss));
}

export function markRead(key: string): void {
  const cur = readList(READ_KEY, memRead);
  if (!cur.includes(key)) writeList(READ_KEY, [...cur, key]);
}

export function markUnread(key: string): void {
  const cur = readList(READ_KEY, memRead);
  if (cur.includes(key)) writeList(READ_KEY, cur.filter(k => k !== key));
}

export function markManyRead(keys: string[]): void {
  const cur = new Set(readList(READ_KEY, memRead));
  const before = cur.size;
  keys.forEach(k => cur.add(k));
  if (cur.size !== before) writeList(READ_KEY, [...cur]);
}

export function dismissNotification(key: string): void {
  const cur = readList(DISMISS_KEY, memDismiss);
  if (!cur.includes(key)) writeList(DISMISS_KEY, [...cur, key]);
}

export function subscribeNotifReads(cb: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
