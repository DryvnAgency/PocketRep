// Cross-deal memory layer for Rex. Persists a rolling summary of the rep's
// recent conversations + actions so future "Hey Rex" calls can reference
// past context (recent deals, recurring patterns, ongoing follow-ups, etc.).
//
// The summary lives in public.rex_memory; raw turns live in public.rex_messages.
// Whenever rex executes an action we append the utterance + action summary to
// rex_messages. Every SUMMARY_EVERY messages we ask the brain to compress
// the recent history into a new summary.

import { supabase } from '@/lib/supabase';

const AI_PROXY_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';
const SUMMARY_EVERY = 8;

export type RexMemoryRow = {
  summary: string;
  message_count: number;
};

export async function getRexMemory(): Promise<RexMemoryRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('rex_memory')
    .select('summary,message_count')
    .eq('user_id', user.id)
    .maybeSingle();
  return data as RexMemoryRow | null;
}

export async function recordRexTurn(
  userText: string,
  rexReply: string,
  contactId?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Insert both sides as separate rows (matches the existing rex_messages
  // schema: role = 'user' | 'assistant')
  await supabase.from('rex_messages').insert([
    { user_id: user.id, contact_id: contactId ?? null, role: 'user', content: userText },
    { user_id: user.id, contact_id: contactId ?? null, role: 'assistant', content: rexReply },
  ]);

  // Bump the memory counter and trigger a summary refresh if we crossed a
  // multiple of SUMMARY_EVERY.
  const { data: mem } = await supabase
    .from('rex_memory')
    .select('summary,message_count')
    .eq('user_id', user.id)
    .maybeSingle();

  const nextCount = (mem?.message_count ?? 0) + 2;
  await supabase
    .from('rex_memory')
    .upsert({
      user_id: user.id,
      summary: mem?.summary ?? '',
      message_count: nextCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (nextCount % SUMMARY_EVERY === 0) {
    // Fire and forget — failure isn't fatal, we'll try again on the next turn.
    refreshSummary(user.id, mem?.summary ?? '').catch(() => undefined);
  }
}

async function refreshSummary(userId: string, currentSummary: string): Promise<void> {
  const { data: recent } = await supabase
    .from('rex_messages')
    .select('role,content,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const turns = (recent ?? []).reverse().map((r: any) => `${r.role === 'user' ? 'Rep' : 'Rex'}: ${r.content}`).join('\n');

  const prompt = `You maintain a rolling memory for a sales rep using PocketRep. Below is the existing memory and the last 20 conversation turns. Produce an UPDATED memory: 4-6 short bullet points (each under 14 words) covering recurring deal patterns, named open follow-ups with dates, customer preferences, and anything the rep has been chasing. Drop anything that's clearly resolved or outdated. No prose preamble — just the bullets.

EXISTING MEMORY:
${currentSummary || '(none)'}

RECENT TURNS:
${turns}

Return only the bullets.`;

  const res = await fetch(`${AI_PROXY_URL}/brain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return;
  const json = await res.json();
  const text = (json.content?.[0]?.text ?? json.text ?? '').trim();
  if (!text) return;

  await supabase
    .from('rex_memory')
    .upsert({
      user_id: userId,
      summary: text,
      message_count: (await supabase
        .from('rex_memory')
        .select('message_count')
        .eq('user_id', userId)
        .maybeSingle()).data?.message_count ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
}
