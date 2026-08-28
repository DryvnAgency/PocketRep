// Per-rep send-time preferences, stored on public.profiles (timezone, send_hour).
// These feed the nurture scheduler so it can (once wired — MASTER_PLAN P2-A7)
// deliver each rep's daily outreach at their local send hour instead of one
// global UTC time. Writes go through the rep's own authenticated session, so the
// existing owner-scoped RLS on profiles applies (no service role, no new grants).

import { supabase } from '@/lib/supabase';

export const DEFAULT_SEND_HOUR = 8;

export type SendTime = { timezone: string | null; send_hour: number };

// Clamp any value to a valid 0-23 hour (mirrors the DB check constraint).
export function clampHour(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_SEND_HOUR;
  return Math.min(23, Math.max(0, Math.round(h)));
}

// "8:00 AM" / "5:00 PM" — friendly label for a 0-23 hour.
export function formatHour(h: number): string {
  const hr = clampHour(h);
  const period = hr < 12 ? 'AM' : 'PM';
  const display = hr % 12 === 0 ? 12 : hr % 12;
  return `${display}:00 ${period}`;
}

// The device's IANA timezone (e.g. "America/New_York"), or null if unavailable
// (older native runtimes without full Intl support).
export function deviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && typeof tz === 'string' ? tz : null;
  } catch {
    return null;
  }
}

// Best-effort: record the rep's device timezone on their profile. Only writes
// when it actually changed, so it's cheap to call on every app launch. Never
// throws into the caller.
export async function captureTimezone(): Promise<void> {
  try {
    const tz = deviceTimezone();
    if (!tz) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    if (data && (data as { timezone: string | null }).timezone === tz) return;
    await supabase.from('profiles').update({ timezone: tz }).eq('id', user.id);
  } catch {
    /* best-effort */
  }
}

// Read the rep's stored send time, falling back to the device timezone + the
// default hour when unset.
export async function loadSendTime(): Promise<SendTime> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { timezone: deviceTimezone(), send_hour: DEFAULT_SEND_HOUR };
    const { data } = await supabase
      .from('profiles')
      .select('timezone,send_hour')
      .eq('id', user.id)
      .maybeSingle();
    const row = data as { timezone: string | null; send_hour: number | null } | null;
    return {
      timezone: row?.timezone ?? deviceTimezone(),
      send_hour: clampHour(row?.send_hour ?? DEFAULT_SEND_HOUR),
    };
  } catch {
    return { timezone: deviceTimezone(), send_hour: DEFAULT_SEND_HOUR };
  }
}

// Persist the rep's preferred daily send hour (0-23).
export async function setSendHour(hour: number): Promise<void> {
  const h = clampHour(hour);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ send_hour: h }).eq('id', user.id);
}
