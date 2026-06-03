import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label, Avatar } from './atoms';
import LanguageToggle from './LanguageToggle';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { BlastDraft, DraftedStep } from '@/lib/v2/blastSequences';
import {
  copyRuleViolations,
  markBlastApproved,
  markBlastCancelled,
  recordSentBlast,
  translateBlastMessage,
} from '@/lib/v2/blastSequences';
import { launchSms, type SendableDraft } from '@/lib/v2/smsLauncher';

type StepState = DraftedStep & {
  skipped: boolean;
  sent: boolean;
  editing: boolean;
  translating: boolean;
};

export default function BlastSequenceDrafter({
  open,
  draft,
  contacts,
  onClose,
  onSent,
}: {
  open: boolean;
  draft: BlastDraft | null;
  contacts: V2Contact[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [steps, setSteps] = useState<StepState[]>(() =>
    (draft?.drafted_steps ?? []).map(s => ({ ...s, skipped: false, sent: false, editing: false, translating: false }))
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactById = useMemo(() => {
    const m = new Map<string, V2Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  // Re-seed steps when the draft prop swaps.
  useMemo(() => {
    if (!draft) return;
    setSteps(draft.drafted_steps.map(s => ({ ...s, skipped: false, sent: false, editing: false, translating: false })));
    setError(null);
    setSending(false);
  }, [draft?.sequence_id]);

  if (!open || !draft) return null;

  const toSend = steps.filter(s => !s.skipped && !s.sent);
  const anyTranslating = steps.some(s => s.translating);

  const updateStep = (id: string, patch: Partial<StepState>) =>
    setSteps(prev => prev.map(s => (s.contact_id === id ? { ...s, ...patch } : s)));

  // Flipping the EN/ES toggle actually rewrites the message in the target
  // language (ES = real Mexican Spanish, not literal). Optimistically flip the
  // label, show a spinner on the card, then swap in the rewrite; revert the
  // label if the brain call fails so the toggle never strands a half-changed row.
  const retranslateStep = async (step: StepState, next: 'en' | 'es') => {
    if (next === step.language || step.translating) return;
    updateStep(step.contact_id, { language: next, translating: true });
    try {
      const translated = await translateBlastMessage({ message: step.message, targetLang: next });
      updateStep(step.contact_id, {
        message: translated,
        char_count: translated.length,
        translating: false,
      });
    } catch {
      updateStep(step.contact_id, { language: step.language, translating: false });
    }
  };

  const handleSendAll = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      for (const s of toSend) {
        const c = contactById.get(s.contact_id);
        const sendable: SendableDraft = {
          contact_id: s.contact_id,
          contact_name: s.contact_name,
          phone: c?.phone ?? null,
          message: s.message,
        };
        const opened = await launchSms(sendable);
        if (opened) {
          recordSentBlast({
            contactId: s.contact_id,
            message: s.message,
            language: s.language,
            hookUsed: s.hook_used,
          }).catch(() => undefined);
          updateStep(s.contact_id, { sent: true });
        }
      }
      await markBlastApproved(draft.sequence_id);
      onSent();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (draft.sequence_id) {
      await markBlastCancelled(draft.sequence_id).catch(() => undefined);
    }
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={handleCancel} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>BLAST DRAFT · {steps.length}</Text>
            <Text style={styles.headerTitle}>{draft.filter_summary || 'Review drafts'}</Text>
          </View>
          <Pressable
            onPress={handleSendAll}
            disabled={sending || anyTranslating || toSend.length === 0}
            style={[styles.headerBtn, (toSend.length === 0 || sending || anyTranslating) ? styles.headerBtnDisabled : styles.headerBtnPrimary]}
          >
            <Text style={[
              styles.headerBtnText,
              (toSend.length === 0 || sending || anyTranslating) ? { color: colors.grey } : { color: colors.ink },
            ]}>
              {sending ? 'Sending…' : anyTranslating ? 'Translating…' : `Send ${toSend.length}`}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {steps.length === 0 ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.emptyText}>Drafting…</Text>
            </View>
          ) : steps.map(step => {
            const c = contactById.get(step.contact_id);
            const violations = copyRuleViolations(step.message);
            return (
              <View key={step.contact_id} style={[
                styles.card,
                step.sent && styles.cardSent,
                step.skipped && styles.cardSkipped,
              ]}>
                <View style={styles.cardHead}>
                  <Avatar name={step.contact_name} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{step.contact_name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {step.hook_used.replace('_', ' ')} · {step.char_count}c
                    </Text>
                  </View>
                  <LanguageToggle
                    value={step.language}
                    onChange={(next) => retranslateStep(step, next)}
                  />
                </View>

                {step.translating ? (
                  <View style={styles.translating}>
                    <ActivityIndicator color={colors.gold} size="small" />
                    <Text style={styles.translatingText}>
                      Translating to {step.language === 'es' ? 'Spanish' : 'English'}…
                    </Text>
                  </View>
                ) : step.editing ? (
                  <TextInput
                    value={step.message}
                    onChangeText={(t) => updateStep(step.contact_id, { message: t, char_count: t.length })}
                    multiline
                    autoFocus
                    style={styles.input}
                  />
                ) : (
                  <Text style={styles.message}>{step.message}</Text>
                )}

                {step.game_plan ? (
                  <Text style={styles.gamePlan}>{step.game_plan}</Text>
                ) : null}

                {violations.length > 0 ? (
                  <Text style={styles.warn}>
                    ⚠ copy rule: {violations.join(', ')}
                  </Text>
                ) : null}

                {step.sent ? (
                  <View style={styles.sentBadge}>
                    <Text style={styles.sentText}>✓ SENT</Text>
                  </View>
                ) : (
                  <View style={styles.cardActions}>
                    {step.editing ? (
                      <Pressable
                        onPress={() => updateStep(step.contact_id, { editing: false })}
                        style={styles.cardBtn}
                      >
                        <Text style={styles.cardBtnText}>Done</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => updateStep(step.contact_id, { editing: true })}
                        style={styles.cardBtn}
                      >
                        <Text style={styles.cardBtnText}>Edit</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => updateStep(step.contact_id, { skipped: !step.skipped })}
                      style={[styles.cardBtn, step.skipped && { backgroundColor: colors.ink4 }]}
                    >
                      <Text style={styles.cardBtnText}>
                        {step.skipped ? 'Skipped — undo' : 'Skip'}
                      </Text>
                    </Pressable>
                    {!c?.phone ? (
                      <Text style={[styles.cardBtnText, { color: colors.red, alignSelf: 'center' }]}>
                        no phone
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.75)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '6%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  handle: {
    alignSelf: 'center',
    width: 42, height: 4, borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 84, alignItems: 'center',
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4 },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { padding: 14, gap: 12 },
  empty: { padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { color: colors.grey2, fontSize: 13 },

  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 8,
  },
  cardSent: { borderColor: colors.green, opacity: 0.9 },
  cardSkipped: { opacity: 0.5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.white },
  cardMeta: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  input: {
    minHeight: 90,
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top' as any,
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.md,
    padding: 10,
  } as any,
  message: { fontSize: 14, color: colors.white, lineHeight: 20 },
  translating: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  translatingText: { fontSize: 13, color: colors.gold, fontWeight: '600' },
  gamePlan: { fontSize: 11, color: colors.gold, fontStyle: 'italic' },
  warn: { fontSize: 11, color: colors.red, fontWeight: '600' },

  cardActions: { flexDirection: 'row', gap: 6 },
  cardBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  cardBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey3, letterSpacing: 0.3 },

  sentBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.greenBg,
    borderWidth: 1, borderColor: colors.greenBorder,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  sentText: { fontSize: 10, fontWeight: '800', color: colors.green, letterSpacing: 1.0 },

  error: { color: colors.red, fontSize: 13, paddingHorizontal: 4 },
});
