// Durable cross-device thread for Rex chat (EXPO_PUBLIC_REX_CHAT). Turns are
// written to public.rex_messages via rexMemory.recordRexTurn; this module reads
// today's turns back so the thread survives a device/browser switch. Voice-path
// turns land in the same table, so the restored thread is Rex's ONE memory —
// chat and voice share it deliberately.
//
// Everything here is best-effort: any failure returns null/defaults and the
// chat silently falls back to the local day-log cache (coachLog). Nothing in
// this module may ever block or break the chat.

import { supabase } from '@/lib/supabase';
import { getRepSetting } from './repSettings';
import type { RepIdentity } from './coachBrain';

export type ThreadTurn = { from: 'rex' | 'user'; text: string; time: string };

// Pure: one rex_messages row -> a chat turn (exported for the mirror test).
export function rowToTurn(row: {
  role?: string | null;
  content?: string | null;
  created_at?: string | null;
}): ThreadTurn {
  const d = row.created_at ? new Date(row.created_at) : new Date();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    from: row.role === 'assistant' ? 'rex' : 'user',
    text: String(row.content ?? ''),
    time,
  };
}

// Pure: local-midnight cutoff for "today's thread" (exported for the mirror test).
export function localDayStartIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

// Pure: server-vs-local pick — the server thread wins whenever it has turns,
// because it's the cross-device source of truth; otherwise keep the local cache.
export function pickThread<T>(server: T[] | null, local: T[]): T[] {
  return server && server.length > 0 ? server : local;
}

// Today's chat turns from rex_messages, oldest first. null = unavailable.
export async function loadTodayServerThread(cap = 100): Promise<ThreadTurn[] | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('rex_messages')
      .select('role,content,created_at')
      .eq('user_id', user.id)
      .gte('created_at', localDayStartIso())
      .order('created_at', { ascending: true })
      .limit(cap);
    if (error) return null;
    return (data ?? [])
      .filter((r: any) => String(r?.content ?? '').trim())
      .map((r: any) => rowToTurn(r));
  } catch {
    return null;
  }
}

// Who Rex works for: canonical first name from profiles.full_name, dealership
// from the device rep-settings. Blank fields fall back inside the prompt
// (Eddie / Nissan of Omaha — the shared demo account IS Eddie's book).
export async function loadRepIdentity(): Promise<RepIdentity> {
  let name: string | undefined;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const full = String((data as any)?.full_name ?? '').trim();
      if (full) name = full.split(/\s+/)[0];
    }
  } catch {
    // fall through to defaults
  }
  let dealership: string | undefined;
  try {
    const d = getRepSetting('dealership').trim();
    if (d) dealership = d;
  } catch {
    // fall through to defaults
  }
  return { name, dealership };
}
