import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Values are injected at build time via esbuild's `define` (reads from
// process.env at build time — see esbuild.config.mjs). They never live in
// source. Rotating the anon key means updating the env and rebuilding,
// not editing this file.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[rex-lens] SUPABASE_URL or SUPABASE_ANON_KEY missing at build time. ' +
    'Set them in RexLens/.env before running `npm run build`.'
  );
}

const chromeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: chromeStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _supabase;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
