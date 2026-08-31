// Lightweight, per-device rep preferences for the Profile screen settings rows
// that don't have a dedicated backend yet (dealership, title, voice & tone,
// etc.). Stored in localStorage on web and AsyncStorage on native. The canonical
// name lives on profiles.full_name and is handled separately in ProfileTab.

import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Empty by default. The Profile screen renders an empty-state CTA ("Add",
// "Not set", …) when a value isn't set, rather than showing fabricated data.
// `voiceTone` keeps a real default since it's a genuine preset, not a metric.
const DEFAULTS: Record<RepSettingKey, string> = {
  dealership: '',
  title: '',
  voiceTone: 'Sharp',
  dataSources: '',
  customPrompts: '',
  phone: '',
  security: '',
  inventoryFeed: '',
};

let mem: Partial<Record<RepSettingKey, string>> = {};
let hydration: Promise<void> | null = null;
let pendingNativeWrite: Promise<void> = Promise.resolve();

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

// AppShell awaits this before rendering an authenticated native session so the
// first frame never falls back to defaults and then changes underneath the rep.
export function hydrateRepSettings(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (hydration) return hydration;
  hydration = pendingNativeWrite
    .catch(() => undefined)
    .then(async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        mem = parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        // Corrupt/missing preferences are non-fatal. Start from honest defaults.
        mem = {};
      }
    });
  return hydration;
}

export async function setRepSetting(k: RepSettingKey, value: string): Promise<void> {
  const next = { ...readAll(), [k]: value };
  mem = next;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next));
  } else if (Platform.OS !== 'web') {
    // Serialize writes so quick onboarding edits cannot finish out of order.
    pendingNativeWrite = pendingNativeWrite
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
    await pendingNativeWrite;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

// Sign-out waits for any in-flight preference write before AsyncStorage is
// swept, preventing a late write from resurrecting the previous rep's data.
export async function resetRepSettingsCache(): Promise<void> {
  const writesToFinish = pendingNativeWrite;
  // Hide the previous rep's values synchronously; the await only protects the
  // subsequent device-storage sweep from an already-started late write.
  mem = {};
  hydration = null;
  await writesToFinish.catch(() => undefined);
}

export function subscribeRepSettings(cb: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
