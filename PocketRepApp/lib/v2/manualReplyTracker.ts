// V1 reply tracking. The rep marks nurture replies by hand from the contact
// card or the NurtureReviewer; a future Twilio webhook will auto-classify.
//
// Reply routing per spec:
//   positive  → bump heat +20, set rep_decision='active', cancel pending
//               nurture for next 60 days
//   negative  → set do_not_contact=true (or 6-month pause via reply_sentiment)
//   neutral   → mark reply_received=true, schedule next nurture for next
//               holiday only (no quarterly during this period)
//   later     → +10 heat, schedule reminder N days out, pause nurture
//               until reminder

import { supabase } from '@/lib/supabase';

export type ReplyKind = 'positive' | 'negative' | 'neutral' | 'later';

export async function markNurtureReply({
  nurtureMessageId,
  contactId,
  kind,
  replyText,
  followUpInDays,
}: {
  nurtureMessageId: string;
  contactId: string;
  kind: ReplyKind;
  replyText?: string;
  followUpInDays?: number;
}): Promise<void> {
  const sentiment =
    kind === 'positive' ? 'positive' :
    kind === 'negative' ? 'negative' :
    kind === 'neutral'  ? 'neutral'  :
    null;

  await supabase
    .from('nurture_messages')
    .update({
      reply_received: true,
      reply_text: replyText ?? null,
      reply_sentiment: sentiment,
    })
    .eq('id', nurtureMessageId);

  // Side effects on the contact + the pipeline
  const now = new Date().toISOString();
  if (kind === 'positive') {
    const { data } = await supabase
      .from('contacts')
      .select('heat_score')
      .eq('id', contactId)
      .maybeSingle();
    const next = Math.min(100, Number(data?.heat_score ?? 0) + 20);
    await supabase
      .from('contacts')
      .update({
        heat_score: next,
        rep_decision: 'active',
        last_contact_date: now.slice(0, 10),
        updated_at: now,
      })
      .eq('id', contactId);
  } else if (kind === 'negative') {
    await supabase
      .from('contacts')
      .update({
        do_not_contact: true,
        rep_decision: 'do_not_nurture',
        updated_at: now,
      })
      .eq('id', contactId);
  } else if (kind === 'later') {
    const days = Math.max(1, Number(followUpInDays ?? 7));
    const target = new Date();
    target.setDate(target.getDate() + days);
    const iso = target.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('contacts')
      .select('heat_score')
      .eq('id', contactId)
      .maybeSingle();
    const next = Math.min(100, Number(data?.heat_score ?? 0) + 10);
    await supabase
      .from('contacts')
      .update({
        heat_score: next,
        next_followup_date: iso,
        updated_at: now,
      })
      .eq('id', contactId);
  }
  // neutral: no contact-level mutation; the nurture row already carries the flag.
}
