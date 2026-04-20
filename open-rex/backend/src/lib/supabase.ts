import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _server: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (_server) return _server;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  _server = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _server;
}
