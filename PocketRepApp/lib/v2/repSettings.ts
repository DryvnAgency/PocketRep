// Lightweight, per-device rep preferences for the Profile screen settings rows
// that don't have a dedicated backend yet (dealership, title, voice & tone,
// etc.). Stored in localStorage on web (in-memory fallback on native), mirroring
// the rexSettings.ts pattern. The canonical name lives on profiles.full_name and
// is handled separately in ProfileTab.

import { Platform } from 'react-native';

export type RepSettingKey =
  | 'dealership'
  | 'title'
  | 'voiceTone'
  | 'dataSources'
  | 'customPrompts'
  | 'phone'
  | 'security'
  | 'inventoryFeed';

const KEY = 'pocketrep:v2:rep-settings';
const EVENT = 'pocketrep:rep-settings-changed';

// Defaults match what the screen used to show hard-coded, so nothing looks empty.
const DEFAULTS: Record<RepSettingKey, string> = {
  dealership: 'BMW of Pleasanton',
  title: 'Senior Advisor',
  voiceTone: 'Direct',
  dataSources: '3 connected',
  customPrompts: '7 saved',
  phone: '(925) ••• 4421',
  security: 'Face ID',
  inventoryFeed: 'Synced recently',
};

// One localStorage blob holds every rep setting. The typed string settings above
// live alongside a few non-string preferences (referral asks), so the store is a
// plain string map under the hood and the typed getters layer on top.
let mem: Record<string, string> = {};

function readRaw(): Record<string, string> {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeRaw(next: Record<string, string>): void {
  mem = next;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function getRepSetting(k: RepSettingKey): string {
  return readRaw()[k] ?? DEFAULTS[k];
}

export function setRepSetting(k: RepSettingKey, value: string): void {
  writeRaw({ ...readRaw(), [k]: value });
}

export function subscribeRepSettings(cb: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// --- Referral asks ------------------------------------------------------------
// The post-sale "ask for a referral" automation. On/off is a per-device client
// preference; the delay (days after a logged deal) is mirrored to
// profiles.referral_ask_delay_days so it survives across devices and is readable
// server-side. dealLogger reads both of these when a deal is logged.

const REFERRAL_ENABLED_KEY = 'referralAsksEnabled';
const REFERRAL_DELAY_KEY = 'referralAskDelayDays';
export const REFERRAL_ASK_DELAY_DEFAULT = 3;
export const REFERRAL_ASK_DELAY_MIN = 1;
export const REFERRAL_ASK_DELAY_MAX = 14;

export function clampReferralAskDelay(days: number): number {
  if (!Number.isFinite(days)) return REFERRAL_ASK_DELAY_DEFAULT;
  return Math.min(REFERRAL_ASK_DELAY_MAX, Math.max(REFERRAL_ASK_DELAY_MIN, Math.round(days)));
}

// Default ON: matches the existing nurture convention (drafts are auto-queued,
// never auto-sent). A logged deal queues a referral-ask reminder; the rep still
// reviews and sends the resulting draft by hand.
export function getReferralAsksEnabled(): boolean {
  const v = readRaw()[REFERRAL_ENABLED_KEY];
  return v == null ? true : v === '1';
}

export function setReferralAsksEnabled(on: boolean): void {
  writeRaw({ ...readRaw(), [REFERRAL_ENABLED_KEY]: on ? '1' : '0' });
}

export function getReferralAskDelayDays(): number {
  return clampReferralAskDelay(parseInt(readRaw()[REFERRAL_DELAY_KEY] ?? '', 10));
}

export function setReferralAskDelayDays(days: number): void {
  writeRaw({ ...readRaw(), [REFERRAL_DELAY_KEY]: String(clampReferralAskDelay(days)) });
}
