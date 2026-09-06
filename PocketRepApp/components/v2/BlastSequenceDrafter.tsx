import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label, Avatar } from './atoms';
import LanguageToggle from './LanguageToggle';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { BlastDraft, DraftedStep } from '@/lib/v2/blastSequences';
import {
  copyRuleViolations,
  enforceUniqueness,
  markBlastApproved,
  markBlastCancelled,
  recordSentBlast,
  translateBlastMessage,
} from '@/lib/v2/blastSequences';
import { launchSms, type SendableDraft } from '@/lib/v2/smsLauncher';
import { registerDemoSend } from '@/lib/v2/demoBlastSim';

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
  const startBlocked = sending || anyTranslating || toSend.length === 0;

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
    const uniqueness = enforceUniqueness(toSend);
    const copyIssues = toSend.flatMap(step =>
      copyRuleViolations(step.message).map(issue => `${step.contact_name}: ${issue}`)
    );
    if (!uniqueness.passed || copyIssues.length > 0) {
      setError([
        ...uniqueness.violations,
        ...copyIssues,
      ].join(' · '));
      return;
    }
    setSending(true);
    setError(null);
    try {
      let demoIndex = 0; // staggers demo replies at 15s / 30s / 60s by send order
      let confirmedCount = 0;
      for (const s of toSend) {
        const c = contactById.get(s.contact_id);
        const sendable: SendableDraft = {
          contact_id: s.contact_id,
          contact_name: s.contact_name,
          phone: c?.phone ?? null,
          message: s.message,
          isDemo: c?.isDemo,
          source: 'blast',
        };
        // For real contacts, launchSms is the single authoritative outbound
        // action. It records composer_opened, waits for the rep to return, and
        // changes that same row to sent/not_sent. Do not create a second SMS
        // action in recordSentBlast for a real contact.
        const result = await launchSms(sendable);
        if (result === 'unsupported') {
          throw new Error('Open PocketRep on your phone to launch Messages. Unsent drafts remain available.');
        }
        if (result === 'opened') {
          confirmedCount++;
          if (c?.isDemo) {
            // Demo send: launchSms is intentionally simulated, so record the
            // demo history row and schedule the simulated reply.
            const msgId = await recordSentBlast({
              contactId: s.contact_id,
              message: s.message,
              language: s.language,
              hookUsed: s.hook_used,
              isDemo: true,
            }).catch(() => null);
            if (msgId) registerDemoSend(s.contact_id, msgId, demoIndex++);
          }
          updateStep(s.contact_id, { sent: true });
        }
      }
      // Only mark approved if at least one message was confirmed by the rep.
      if (confirmedCount > 0) await markBlastApproved(draft.sequence_id);
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
      try {
        await markBlastCancelled(draft.sequence_id);
      } catch (e: any) {
        // Tapping Cancel always looked successful even when the row was
        // still pending_review server-side. Surface the failure and keep
        // the sheet open instead of closing as if it worked.
        setError(e?.message ?? "Couldn't cancel — try again");
        return;
      }
    }
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={handleCancel} accessibilityRole="button" accessibilityLabel="Close Text Queue" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel Text Queue"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          >
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerKicker}>TEXT QUEUE · {steps.length}</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{draft.filter_summary || 'Review personalized drafts'}</Text>
          </View>
          <Pressable
            onPress={handleSendAll}
            disabled={startBlocked}
            accessibilityRole="button"
            accessibilityLabel={sending ? 'Working through Text Queue' : anyTranslating ? 'Waiting for translation' : `Start Text Queue with ${toSend.length} drafts`}
            accessibilityState={{ disabled: startBlocked, busy: sending || anyTranslating }}
            style={({ pressed }) => [styles.headerBtn, startBlocked ? styles.headerBtnDisabled : styles.headerBtnPrimary, pressed && !startBlocked && styles.pressed]}
          >
            <Text style={[
              styles.headerBtnText,
              startBlocked ? { color: colors.grey } : { color: colors.ink },
            ]} numberOfLines={2}>
              {sending ? 'Working…' : anyTranslating ? 'Translating…' : `Start ${toSend.length}`}
            </Text>
          </Pressable>
        </View>

        <View style={styles.queueNotice}>
          <View style={styles.queueNoticeHead}>
            <View style={styles.rexDot} />
            <Text style={styles.queueNoticeTitle}>REX · MANUAL SEND</Text>
          </View>
          <Text style={styles.queueNoticeText}>One customer at a time. Review each message; PocketRep opens Messages for you and nothing is auto-sent.</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {steps.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't draft any messages for this blast. Close and try again.</Text>
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
                  <View style={styles.cardIdentity}>
                    <Text style={styles.cardName} numberOfLines={1}>{step.contact_name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {step.hook_used.replace('_', ' ')} · {step.char_count}c
                    </Text>
                  </View>
                  <View style={styles.languageWrap}>
                    <LanguageToggle
                      value={step.language}
                      onChange={(next) => retranslateStep(step, next)}
                    />
                  </View>
                </View>

                {step.translating ? (
                  <View style={styles.translating} accessibilityLiveRegion="polite">
                    <RadarLoader size={16} />
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
                    accessibilityLabel={`Edit draft for ${step.contact_name}`}
                    style={styles.input}
                  />
                ) : (
                  <Text style={styles.message}>{step.message}</Text>
                )}

                {step.game_plan ? (
                  <Text style={styles.gamePlan}>{step.game_plan}</Text>
                ) : null}

                {violations.length > 0 ? (
                  <Text style={styles.warn} accessibilityLiveRegion="polite">
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
                        accessibilityRole="button"
                        accessibilityLabel={`Finish editing ${step.contact_name}`}
                        style={({ pressed }) => [styles.cardBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.cardBtnText}>Done</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => updateStep(step.contact_id, { editing: true })}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit draft for ${step.contact_name}`}
                        style={({ pressed }) => [styles.cardBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.cardBtnText}>Edit</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => updateStep(step.contact_id, { skipped: !step.skipped })}
                      accessibilityRole="button"
                      accessibilityLabel={step.skipped ? `Undo skip for ${step.contact_name}` : `Skip ${step.contact_name}`}
                      accessibilityState={{ selected: step.skipped }}
                      style={({ pressed }) => [styles.cardBtn, step.skipped && styles.cardBtnSelected, pressed && styles.pressed]}
                    >
                      <Text style={styles.cardBtnText}>
                        {step.skipped ? 'Skipped — undo' : 'Skip'}
                      </Text>
                    </Pressable>
                    {!c?.phone ? (
                      <Text style={styles.noPhone}>
                        no phone
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}

          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.75)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: Platform.OS === 'web' ? ('max(8px, env(safe-area-inset-top))' as any) : '6%',
    maxHeight: Platform.OS === 'web' ? ('100dvh' as any) : '94%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 2 },
  headerBtn: {
    minWidth: 72,
    minHeight: 44,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold2 },
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4, opacity: 0.7 },
  headerBtnText: { maxWidth: '100%', flexShrink: 1, textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '800', color: colors.grey2 },
  headerKicker: { fontSize: 9, fontWeight: '900', color: colors.gold, letterSpacing: 1.2, textAlign: 'center' },
  headerTitle: { maxWidth: '100%', fontSize: 13, lineHeight: 17, fontWeight: '800', color: colors.white, marginTop: 2, letterSpacing: -0.2, textAlign: 'center' },

  queueNotice: {
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldBg,
  },
  queueNoticeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rexDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  queueNoticeTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.0 },
  queueNoticeText: { color: colors.grey3, fontSize: 11, lineHeight: 16, marginTop: 4 },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'web' ? ('max(28px, env(safe-area-inset-bottom))' as any) : 28,
    gap: 12,
  },
  empty: { padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { color: colors.grey2, fontSize: 13, lineHeight: 19, textAlign: 'center' },

  card: {
    minWidth: 0,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  cardSent: { borderColor: colors.green, opacity: 0.9 },
  cardSkipped: { opacity: 0.5 },
  cardHead: { minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  cardIdentity: { flex: 1, minWidth: 120 },
  languageWrap: { flexShrink: 0 },
  cardName: { fontSize: 14, fontWeight: '800', color: colors.white },
  cardMeta: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  input: {
    minHeight: 96,
    color: colors.white,
    fontSize: Platform.OS === 'web' ? 16 : 14,
    lineHeight: 21,
    textAlignVertical: 'top' as any,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.goldBorderStrong,
    borderRadius: radius.md,
    padding: 11,
  } as any,
  message: { fontSize: 14, color: colors.white, lineHeight: 20 },
  translating: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  translatingText: { flexShrink: 1, fontSize: 13, color: colors.gold, fontWeight: '700' },
  gamePlan: { fontSize: 11, lineHeight: 16, color: colors.gold, fontStyle: 'italic' },
  warn: { fontSize: 11, lineHeight: 16, color: colors.red, fontWeight: '600' },

  cardActions: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  cardBtn: {
    minHeight: 44,
    minWidth: 72,
    flexGrow: 1,
    flexBasis: 104,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBtnSelected: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  cardBtnText: { maxWidth: '100%', flexShrink: 1, textAlign: 'center', fontSize: 12, lineHeight: 15, fontWeight: '700', color: colors.grey3, letterSpacing: 0.2 },
  noPhone: { color: colors.red, alignSelf: 'center', fontSize: 11, fontWeight: '700' },

  sentBadge: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  sentText: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.0 },

  error: { color: colors.red, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, paddingVertical: 4 },
  bottomSpacer: { height: 8 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});