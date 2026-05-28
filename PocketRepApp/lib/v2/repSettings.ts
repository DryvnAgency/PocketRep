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

let mem: Partial<Record<RepSettingKey, string>> = {};

function readAll(): Partial<Record<RepSettingKey, string>> {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return mem;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function getRepSetting(k: RepSettingKey): string {
  return readAll()[k] ?? DEFAULTS[k];
}

export function setRepSetting(k: RepSettingKey, value: string): void {
  const next = { ...readAll(), [k]: value };
  mem = next;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function subscribeRepSettings(cb: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
