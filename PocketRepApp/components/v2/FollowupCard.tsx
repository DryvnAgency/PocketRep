// P2 demo feature: the per-contact "Rex follow-up" card shown in ContactDetail
// (flag-gated via isRexFollowupEnabled). Drives the recap -> 14-day, rep-sent
// sequence: Rex AI drafts each message, the rep edits, and "Send message" opens the
// rep's own composer (onSendMessage routes to the native sms:/mailto: path). It
// NEVER sends anything itself — it only advances local sequence state after the rep
// taps send. Inert (renders an error/empty state) until the rex_followups migration
// is applied.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import type { V2Contact } from '@/lib/v2/useContacts';
import {
  loadFollowup, startRecap, updateRecapDraft, markRecapSent,
  setDayDraft, markDaySent, skipDay, setStatus,
  generateRecapDraft, generateFollowupDraft,
  dayLabelFor, type Followup,
} from '@/lib/v2/followupSequence';

export default function FollowupCard({
  contact, onSendMessage,
}: {
  contact: V2Contact;
  onSendMessage: (body: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<Followup | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genRef = useRef('');

  const recapInput = { name: contact.name, vehicle: contact.vehicle, note: contact.notes };

  const reload = useCallback(async () => {
    const next = await loadFollowup(contact.id);
    setF(next);
    setLoading(false);
    return next;
  }, [contact.id]);

  useEffect(() => { setLoading(true); genRef.current = ''; reload(); }, [reload]);

  // Keep the editable buffer in sync with whatever message is currently actionable.
  useEffect(() => {
    if (!f) { setDraft(''); return; }
    if (f.status === 'draft') setDraft(f.recapDraft);
    else if (f.status === 'active') setDraft(f.days.find(d => d.day === f.currentDay)?.draft ?? '');
  }, [f]);

  const priorDrafts = (seq: Followup) =>
    [seq.recapDraft, ...seq.days.map(d => d.draft)].filter(Boolean);

  const draftToday = useCallback(async (seq: Followup) => {
    setBusy(true); setError(null);
    try {
      const text = await generateFollowupDraft({
        name: contact.name, vehicle: contact.vehicle, note: contact.notes,
        day: seq.currentDay, totalDays: seq.totalDays, priorDrafts: priorDrafts(seq),
      });
      await setDayDraft(seq.id, seq.currentDay, text);
      setDraft(text);
      await reload();
    } catch {
      setError('Couldn’t draft this one. Tap “Re-draft” to retry.');
    } finally { setBusy(false); }
  }, [contact, reload]);

  // Once the recap is sent, auto-draft the current day's message so it's ready for
  // review — once per day per contact (guarded so it can't loop).
  useEffect(() => {
    if (!f || f.status !== 'active' || busy) return;
    const has = f.days.find(d => d.day === f.currentDay)?.draft;
    const key = `${contact.id}:${f.currentDay}`;
    if (!has && genRef.current !== key) { genRef.current = key; draftToday(f); }
  }, [f, busy, contact.id, draftToday]);

  const startFollowup = async () => {
    setBusy(true); setError(null);
    try {
      const text = await generateRecapDraft(recapInput);
      const created = await startRecap(contact.id, text || 'hey, great meeting you today, let me know if I can help with anything');
      setF(created);
    } catch {
      setError('Couldn’t start the follow-up. The feature may not be enabled yet.');
    } finally { setBusy(false); }
  };

  const persistDraft = async () => {
    if (!f) return;
    try {
      if (f.status === 'draft') await updateRecapDraft(f.id, draft);
      else if (f.status === 'active') await setDayDraft(f.id, f.currentDay, draft);
    } catch { /* best effort */ }
  };

  const send = async () => {
    if (!f || !draft.trim()) return;
    setBusy(true); setError(null);
    try {
      await persistDraft();
      onSendMessage(draft); // opens the rep's own composer — app never sends
      if (f.status === 'draft') await markRecapSent(f.id);
      else if (f.status === 'active') await markDaySent(f.id, f.currentDay, f.totalDays);
      await reload();
    } catch {
      setError('Sent from your app, but couldn’t advance the sequence.');
    } finally { setBusy(false); }
  };

  const doSkip = async () => { if (!f) return; setBusy(true); try { await skipDay(f.id, f.currentDay, f.totalDays); await reload(); } finally { setBusy(false); } };
  const setS = async (s: Followup['status']) => { if (!f) return; setBusy(true); try { await setStatus(f.id, s); await reload(); } finally { setBusy(false); } };

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>REX FOLLOW-UP</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  // No sequence yet — offer to start one.
  if (!f) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>REX FOLLOW-UP</Text>
        <Text style={styles.body}>Start a 14-day follow-up. Rex drafts each message; you review and send from your own phone.</Text>
        <Pressable onPress={startFollowup} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
          <Text style={styles.primaryBtnText}>{busy ? 'Drafting…' : '✨ Draft a recap'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (f.status === 'stopped' || f.status === 'completed') {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>REX FOLLOW-UP</Text>
        <Text style={styles.muted}>{f.status === 'completed' ? `Completed all ${f.totalDays} days.` : 'Follow-up stopped.'}</Text>
        <Pressable onPress={() => setS('active')} disabled={busy} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Restart</Text>
        </Pressable>
      </View>
    );
  }

  const isRecap = f.status === 'draft';
  const paused = f.status === 'paused';
  const label = isRecap ? 'RECAP · not sent yet' : dayLabelFor(f.currentDay, f.totalDays);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker}>REX FOLLOW-UP</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.status, paused && { color: colors.orange }]}>{paused ? 'PAUSED' : label}</Text>
      </View>

      {paused ? (
        <>
          <Text style={styles.muted}>Paused on {dayLabelFor(f.currentDay, f.totalDays)}. No messages are drafted while paused.</Text>
          <View style={styles.row}>
            <Pressable onPress={() => setS('active')} disabled={busy} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Resume</Text>
            </Pressable>
            <Pressable onPress={() => setS('stopped')} disabled={busy} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>Stop</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {busy && !draft ? (
            <Text style={styles.muted}>Rex is drafting…</Text>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={persistDraft}
              multiline
              placeholder={isRecap ? 'Recap message…' : `Day ${f.currentDay} message…`}
              placeholderTextColor={colors.grey}
              style={styles.draftInput}
            />
          )}

          <View style={styles.row}>
            <Pressable onPress={send} disabled={busy || !draft.trim()} style={[styles.primaryBtn, (busy || !draft.trim()) && { opacity: 0.5 }]}>
              <Text style={styles.primaryBtnText}>{isRecap ? 'Send recap' : 'Send message'}</Text>
            </Pressable>
            {!isRecap ? (
              <Pressable onPress={doSkip} disabled={busy} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Skip</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.subRow}>
            <Pressable onPress={() => draftToday(f)} disabled={busy || isRecap} hitSlop={6}>
              <Text style={[styles.link, (busy || isRecap) && { opacity: 0.4 }]}>↻ Re-draft</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {!isRecap ? (
              <Pressable onPress={() => setS('paused')} disabled={busy} hitSlop={6}>
                <Text style={styles.link}>Pause</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setS('stopped')} disabled={busy} hitSlop={6}>
              <Text style={[styles.link, { color: colors.grey2 }]}>Stop</Text>
            </Pressable>
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.foot}>Rex never sends for you — tapping send opens your own messages app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    padding: 14, marginHorizontal: 14, marginTop: 8,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  kicker: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.2 },
  status: { fontSize: 10, fontWeight: '800', color: colors.gold2, letterSpacing: 0.6 },
  body: { fontSize: 13, color: colors.grey3, lineHeight: 19 },
  muted: { fontSize: 13, color: colors.grey2 },
  draftInput: {
    minHeight: 84, textAlignVertical: 'top' as any,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md,
    padding: 12, color: colors.white, fontSize: 14, lineHeight: 20,
  } as any,
  row: { flexDirection: 'row', gap: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  primaryBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  ghostBtn: {
    height: 44, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { color: colors.grey2, fontSize: 13, fontWeight: '700' },
  link: { fontSize: 12, fontWeight: '700', color: colors.gold },
  error: { color: colors.red, fontSize: 12 },
  foot: { fontSize: 10, color: colors.grey, lineHeight: 14 },
});
