import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import {
  generateQueue,
  markSentAndLog,
  markSkipped,
  loadPendingSequenceClassifications,
  classifyAndBranchSequence,
  assertContactActionAllowed,
  type QueueItem,
  type PendingSequenceClassification,
  type SequenceClassification,
} from '@/lib/messageQueue';
import { launchSms } from '@/lib/v2/smsLauncher';
import { isCurrentWebRuntimeNativeProtocolCapable } from '@/lib/v2/smsCapability';
import { formatSequenceTemplateTokens } from '@/lib/v2/sequenceTemplates';
import { supabase } from '@/lib/supabase';
import type { CallOutcome } from '@/lib/v2/updateContact';

function channelLabel(channel: QueueItem['channel']) {
  if (channel === 'text') return 'TEXT';
  if (channel === 'call') return 'CALL';
  return 'EMAIL';
}

type LaunchResult = 'confirmed' | 'opened' | 'not_sent' | 'unsupported' | 'failed';

async function launchChannel(item: QueueItem): Promise<LaunchResult> {
  if (item.isDemo) return 'confirmed';
  if (item.channel === 'text') {
    const result = await launchSms({
      contact_id: item.contact_id,
      contact_name: item.contact_name,
      phone: item.phone,
      message: item.message,
      isDemo: item.isDemo,
      source: 'sequence',
    });
    if (result === 'unsupported') return 'unsupported';
    if (result === 'not_sent') return 'not_sent';
    return result === 'opened' ? 'confirmed' : 'failed';
  }

  if (item.channel === 'email') {
    const email = (item.email ?? '').trim();
    if (!email) return 'failed';
    try {
      await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(`Follow-up with ${item.contact_name}`)}&body=${encodeURIComponent(item.message)}`);
      return 'opened';
    } catch {
      return 'failed';
    }
  }

  const digits = (item.phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return 'failed';
  if (Platform.OS === 'web' && !isCurrentWebRuntimeNativeProtocolCapable()) return 'unsupported';
  try {
    await Linking.openURL(`tel:${digits}`);
    return 'opened';
  } catch {
    return 'failed';
  }
}

export default function FollowUpQueue() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [pendingClassifications, setPendingClassifications] = useState<PendingSequenceClassification[]>([]);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setItems([]); return; }
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
      const plan = String(profile?.plan ?? 'pro');
      const [next, classifications] = await Promise.all([
        generateQueue(user.id, plan),
        loadPendingSequenceClassifications(user.id),
      ]);
      setItems(next);
      setPendingClassifications(classifications);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load follow-ups.');
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (
    item: QueueItem,
    action: 'work' | 'complete' | 'skip',
    callOutcome?: CallOutcome,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const key = `${item.contact_id}:${item.sequence_id}:${item.step_number}`;
    setBusyKey(key);
    setError(null);
    try {
      if (action === 'work') {
        await assertContactActionAllowed(item.contact_id);
        if (item.unresolved_tokens?.length) {
          throw new Error(`Add values for ${formatSequenceTemplateTokens(item.unresolved_tokens)} before working this follow-up.`);
        }
        const result = await launchChannel(item);
        if (result === 'unsupported') {
          throw new Error(
            item.channel === 'call'
              ? 'Call from your phone, then mark this follow-up complete. The browser did not open a dialer.'
              : 'Open PocketRep on your phone to launch Messages. This follow-up is still waiting.',
          );
        }
        if (result === 'not_sent') {
          throw new Error('Text was not marked sent. This follow-up is still waiting.');
        }
        if (result === 'failed') throw new Error(`Couldn't open ${item.channel}. Check the contact's ${item.channel === 'email' ? 'email address' : 'phone number'}.`);
        // Texts return confirmed only after the rep says they tapped Send.
        // Calls and emails have no reliable OS send/completion callback, so
        // keep the step in the queue until the rep explicitly completes it.
        if (result === 'opened') {
          setOpenedKey(key);
          return;
        }
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You are signed out.');
      if (action === 'complete' && item.channel === 'call' && !callOutcome) {
        throw new Error('Pick the call outcome before completing this step.');
      }
      const result = action === 'skip'
        ? await markSkipped(item, user.id)
        : await markSentAndLog(item, user.id, callOutcome);
      setOpenedKey(null);
      setItems(prev => (prev ?? []).filter(x => x !== item));
      if (result.requiresClassification) {
        const classifications = await loadPendingSequenceClassifications(user.id);
        setPendingClassifications(classifications);
      }
    } catch (e: any) {
      setError(e?.message ?? 'That follow-up could not be completed.');
    } finally {
      busyRef.current = false;
      setBusyKey(null);
    }
  };

  const classify = async (
    pending: PendingSequenceClassification,
    classification: SequenceClassification,
  ) => {
    if (classifyingId) return;
    setClassifyingId(pending.enrollment_id);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You are signed out.');
      await classifyAndBranchSequence(pending, classification, user.id);
      setPendingClassifications(prev => prev.filter(row => row.enrollment_id !== pending.enrollment_id));
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save that sequence outcome.');
    } finally {
      setClassifyingId(null);
    }
  };

  if (items === null) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SEQUENCE FOLLOW-UPS</Text>
          <Text style={styles.title}>{items.length ? `${items.length} ready to work` : 'You’re caught up'}</Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refresh} accessibilityRole="button" accessibilityLabel="Refresh follow-ups">
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

      {pendingClassifications.map(pending => {
        const busy = classifyingId === pending.enrollment_id;
        return (
          <View key={pending.enrollment_id} style={styles.classifyCard}>
            <Text style={styles.classifyKicker}>FRESH UP · 14 DAYS COMPLETE</Text>
            <Text style={styles.classifyTitle}>What happened with {pending.contact_name}?</Text>
            <Text style={styles.classifyBody}>You decide the outcome. PocketRep will move them into the right long-term sequence.</Text>
            <View style={styles.classifyActions}>
              <Pressable disabled={busy} onPress={() => void classify(pending, 'sold')} style={[styles.classifyBtn, styles.classifyPrimary]}>
                <Text style={styles.classifyPrimaryText}>SOLD</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void classify(pending, 'still_shopping')} style={styles.classifyBtn}>
                <Text style={styles.classifyText}>STILL SHOPPING</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void classify(pending, 'no_response')} style={styles.classifyBtn}>
                <Text style={styles.classifyText}>NO RESPONSE</Text>
              </Pressable>
            </View>
            {busy ? <Text style={styles.classifySaving}>Saving outcome…</Text> : null}
          </View>
        );
      })}

      {items.length === 0 ? (
        <Text style={styles.empty}>Enroll customers in a sequence and their due steps will appear here.</Text>
      ) : (
        items.map(item => {
          const key = `${item.contact_id}:${item.sequence_id}:${item.step_number}`;
          const busy = busyKey === key;
          return (
            <View key={key} style={styles.card}>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{item.contact_name || 'Unnamed customer'}</Text>
                    {item.isDemo ? <Text style={styles.demo}>DEMO</Text> : null}
                  </View>
                  <Text style={styles.meta}>STEP {item.step_number} · {channelLabel(item.channel)} · DUE {item.due_date}</Text>
                </View>
              </View>
              <Text style={styles.message} numberOfLines={4}>
                {item.unresolved_tokens?.length
                  ? `Needs setup: ${formatSequenceTemplateTokens(item.unresolved_tokens)}`
                  : item.message || 'No message template — work this step manually.'}
              </Text>
              <View style={styles.actions}>
                <Pressable disabled={busy} onPress={() => void act(item, 'skip')} style={styles.skip} accessibilityRole="button" accessibilityLabel={`Skip follow-up for ${item.contact_name}`}>
                  <Text style={styles.skipText}>Skip</Text>
                </Pressable>
                {openedKey === key && item.channel === 'call' ? (
                  <View style={styles.callOpened}>
                    <Text style={styles.callOpenedText}>CALL OPENED · RECORD OUTCOME</Text>
                  </View>
                ) : (
                  <Pressable
                    disabled={busy}
                    onPress={() => void act(item, openedKey === key ? 'complete' : 'work')}
                    style={styles.work}
                    accessibilityRole="button"
                    accessibilityLabel={openedKey === key ? `Mark follow-up complete for ${item.contact_name}` : `Work ${item.channel} follow-up for ${item.contact_name}`}
                  >
                    <Text style={styles.workText}>{busy ? 'Working…' : openedKey === key ? (item.channel === 'text' ? 'MARK SENT ✓' : 'MARK COMPLETE ✓') : item.isDemo ? 'Simulate' : `Work ${channelLabel(item.channel)}`}</Text>
                  </Pressable>
                )}
              </View>
              {openedKey === key && item.channel === 'call' ? (
                <View style={styles.callOutcomes}>
                  {([
                    ['answered', 'Answered'],
                    ['no-answer', 'No answer'],
                    ['voicemail', 'Left VM'],
                    ['wrong-number', 'Wrong #'],
                  ] as Array<[CallOutcome, string]>).map(([value, label]) => (
                    <Pressable
                      key={value}
                      disabled={busy}
                      onPress={() => void act(item, 'complete', value)}
                      style={styles.callOutcomeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Record ${label} for ${item.contact_name}`}
                    >
                      <Text style={styles.callOutcomeText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : openedKey === key ? (
                <Text style={styles.openedHint}>Finish the {item.channel}, then mark this step sent.</Text>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 14, marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 17, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  refresh: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.gold, fontSize: 20, fontWeight: '700' },
  error: { color: colors.red, fontSize: 11, marginBottom: 8 },
  classifyCard: {
    marginBottom: 10, padding: 14, borderRadius: radius.md,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  classifyKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.0 },
  classifyTitle: { color: colors.white, fontSize: 15, fontWeight: '800', marginTop: 5 },
  classifyBody: { color: colors.grey3, fontSize: 11, lineHeight: 16, marginTop: 5 },
  classifyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  classifyBtn: {
    minHeight: 38, paddingHorizontal: 12, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  classifyPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  classifyPrimaryText: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  classifyText: { color: colors.grey3, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  classifySaving: { color: colors.gold, fontSize: 10, fontWeight: '700', marginTop: 8 },
  empty: { color: colors.grey2, fontSize: 12, lineHeight: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, padding: 14 },
  card: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, padding: 14, marginBottom: 7 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  demo: { color: colors.gold, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  meta: { color: colors.grey, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, marginTop: 4 },
  message: { color: colors.grey2, fontSize: 12, lineHeight: 18, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  skip: { borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9 },
  skipText: { color: colors.grey2, fontSize: 12, fontWeight: '700' },
  work: { flex: 1, backgroundColor: colors.gold, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  workText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  callOpened: {
    flex: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  callOpenedText: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  callOutcomes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'flex-end' },
  callOutcomeBtn: {
    minHeight: 34, paddingHorizontal: 10, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2,
    alignItems: 'center', justifyContent: 'center',
  },
  callOutcomeText: { color: colors.grey3, fontSize: 10, fontWeight: '800' },
  openedHint: { color: colors.gold, fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: 'right' },
});
