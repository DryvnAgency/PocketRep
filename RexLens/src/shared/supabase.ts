import { createClient, SupabaseClient } from '@supabase/supabase-js';

// These match the PocketRep mobile app's Supabase project.
// In production, inject via build-time env vars.
const SUPABASE_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Chrome extension storage adapter for Supabase auth persistence
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
