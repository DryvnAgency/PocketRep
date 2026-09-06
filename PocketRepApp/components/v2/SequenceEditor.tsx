import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import {
  updateSequenceStep,
  renameSequence,
  archiveSequence,
  type V2Sequence,
} from '@/lib/v2/useSequences';
import {
  SEQUENCE_TEMPLATE_TOKENS,
  formatSequenceTemplateTokens,
  getUnsupportedSequenceTemplateTokens,
} from '@/lib/v2/sequenceTemplates';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';

const CHANNELS: Array<{ value: 'text' | 'call' | 'email'; icon: string; label: string }> = [
  { value: 'text', icon: '💬', label: 'Text' },
  { value: 'call', icon: '📞', label: 'Call' },
  { value: 'email', icon: '✉', label: 'Email' },
];

function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => {
    if (p.startsWith('{{') && p.endsWith('}}')) {
      return (
        <Text key={i} style={{ color: colors.gold, fontWeight: '600' }}>
          {p}
        </Text>
      );
    }
    return <Text key={i}>{p}</Text>;
  });
}

export default function SequenceEditor({
  open, sequence, onClose, onSaved,
}: {
  open: boolean;
  sequence: V2Sequence | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sequence?.name ?? '');
  const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
  const [stepChannels, setStepChannels] = useState<Record<string, 'text' | 'call' | 'email'>>({});
  const [stepDelays, setStepDelays] = useState<Record<string, number>>({});
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const keyboardInset = useWebVisualViewportInset(open);

  useEffect(() => {
    if (!open || !sequence) return;
    setName(sequence.name);
    const drafts: Record<string, string> = {};
    const channels: Record<string, 'text' | 'call' | 'email'> = {};
    const delays: Record<string, number> = {};
    for (const s of sequence.steps) {
      drafts[s.id] = s.message_template ?? '';
      channels[s.id] = s.channel;
      delays[s.id] = s.delay_days;
    }
    setStepDrafts(drafts);
    setStepChannels(channels);
    setStepDelays(delays);
    setPreviewIds(new Set(sequence.steps.map(s => s.id)));
    setSaving(false);
    setError(null);
    setConfirmArchive(false);
  }, [open, sequence?.id]);

  if (!open || !sequence) return null;

  const togglePreview = (id: string) => setPreviewIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const insertToken = (stepId: string, tok: string) => {
    setStepDrafts(prev => ({
      ...prev,
      [stepId]: (prev[stepId] ?? '') + (prev[stepId]?.endsWith(' ') || !prev[stepId] ? '' : ' ') + `{{${tok}}}`,
    }));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const unsupported = [...new Set(
        Object.values(stepDrafts).flatMap(getUnsupportedSequenceTemplateTokens),
      )];
      if (unsupported.length) {
        throw new Error(`Unsupported template fields: ${formatSequenceTemplateTokens(unsupported)}. Use the insert fields shown below.`);
      }
      const tasks: Promise<void>[] = [];
      if (name.trim() && name.trim() !== sequence.name) {
        tasks.push(renameSequence(sequence.id, name.trim()));
      }
      for (const step of sequence.steps) {
        const patch: { message_template?: string; channel?: 'text' | 'call' | 'email'; delay_days?: number } = {};
        if (stepDrafts[step.id] !== step.message_template) patch.message_template = stepDrafts[step.id];
        if (stepChannels[step.id] !== step.channel) patch.channel = stepChannels[step.id];
        if (stepDelays[step.id] !== step.delay_days) patch.delay_days = stepDelays[step.id];
        if (Object.keys(patch).length > 0) tasks.push(updateSequenceStep(step.id, patch));
      }
      await Promise.all(tasks);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await archiveSequence(sequence.id);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Archive failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, keyboardInset > 0 && { bottom: keyboardInset }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          disabled={saving}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, saving && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Close sequence editor"
        >
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>SEQUENCE</Label>
          <Text style={styles.topTitle} numberOfLines={1}>{sequence.name}</Text>
        </View>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          accessibilityLabel="Save sequence"
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.field}>
          <Label color={colors.grey2}>NAME</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.nameInput}
          />
        </View>

        {sequence.steps.map((step, i) => {
          const previewing = previewIds.has(step.id);
          const draft = stepDrafts[step.id] ?? '';
          return (
            <View key={step.id} style={styles.stepCard}>
              <View style={styles.stepHead}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepLabel}>STEP {i + 1}</Text>
                  <Text style={styles.stepMeta}>
                    {step.ai_personalize ? 'AI-drafted · ' : ''}
                    {stepDelays[step.id] === 0 ? 'fires immediately' : `fires in ${stepDelays[step.id]}d`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => togglePreview(step.id)}
                  style={({ pressed }) => [styles.previewToggle, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${previewing ? 'Edit' : 'Preview'} step ${i + 1}`}
                >
                  <Text style={styles.linkText}>{previewing ? 'EDIT' : 'PREVIEW'}</Text>
                </Pressable>
              </View>

              <View style={styles.channelRow}>
                {CHANNELS.map(c => {
                  const selected = stepChannels[step.id] === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => setStepChannels(prev => ({ ...prev, [step.id]: c.value }))}
                      style={({ pressed }) => [
                        styles.channelBtn,
                        selected
                          ? { backgroundColor: colors.goldBg, borderColor: colors.gold }
                          : { backgroundColor: 'transparent', borderColor: colors.ink4 },
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={{ fontSize: 12 }}>{c.icon}</Text>
                      <Text style={[
                        styles.channelText,
                        { color: selected ? colors.gold : colors.grey2 },
                      ]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.delayRow}>
                <Text style={styles.delayLabel}>DELAY</Text>
                <TextInput
                  value={String(stepDelays[step.id] ?? 0)}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^0-9]/g, ''));
                    setStepDelays(prev => ({ ...prev, [step.id]: Number.isFinite(n) ? n : 0 }));
                  }}
                  keyboardType="numeric"
                  style={styles.delayInput}
                />
                <Text style={styles.delayLabel}>days</Text>
              </View>

              {previewing ? (
                <View style={styles.preview}>
                  <Text style={styles.previewText}>{renderHighlighted(draft)}</Text>
                </View>
              ) : (
                <TextInput
                  value={draft}
                  onChangeText={(t) => setStepDrafts(prev => ({ ...prev, [step.id]: t }))}
                  multiline
                  style={styles.textArea}
                />
              )}

              {!previewing ? (
                <View style={styles.tokensRow}>
                  <Label color={colors.grey2}>INSERT</Label>
                  {SEQUENCE_TEMPLATE_TOKENS.map(tok => (
                    <Pressable
                      key={tok}
                      onPress={() => insertToken(step.id, tok)}
                      style={({ pressed }) => [styles.tokenChip, pressed && styles.pressed]}
                    >
                      <Text style={styles.tokenChipText}>{`{{${tok}}}`}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {confirmArchive ? (
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Archive this sequence?</Text>
            <Text style={styles.confirmBody}>
              It'll be hidden from the list. Existing enrollments keep running.
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={() => setConfirmArchive(false)}
                disabled={saving}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed, saving && styles.disabled]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleArchive}
                disabled={saving}
                style={({ pressed }) => [styles.archiveBtn, pressed && styles.pressed, saving && styles.disabled]}
              >
                <Text style={styles.archiveBtnText}>{saving ? 'Archiving…' : 'Archive'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmArchive(true)}
            disabled={saving}
            style={({ pressed }) => [styles.archiveLink, pressed && styles.pressed, saving && styles.disabled]}
          >
            <Text style={styles.archiveLinkText}>Archive sequence</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 71,
  } as any,
  topBar: {
    paddingTop: Platform.OS === 'web' ? ('max(16px, env(safe-area-inset-top))' as any) : 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 20, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 2 },
  saveBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },

  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'web' ? ('max(40px, env(safe-area-inset-bottom))' as any) : 40,
    gap: 14,
  },

  field: { gap: 8 },
  nameInput: {
    minHeight: 48,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    color: colors.white, fontSize: 16, fontWeight: '600',
  },

  stepCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 10,
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  stepLabel: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.0 },
  stepMeta: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  previewToggle: {
    minWidth: 58,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },

  channelRow: { flexDirection: 'row', gap: 6 },
  channelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  channelText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  delayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delayLabel: { fontSize: 11, fontWeight: '700', color: colors.grey2, letterSpacing: 0.5 },
  delayInput: {
    width: 56,
    minHeight: 44,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 10,
    color: colors.white, fontSize: 16, fontWeight: '700',
    textAlign: 'center',
  },

  preview: {
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 12,
  },
  previewText: { color: colors.grey3, fontSize: 14, lineHeight: 20 },

  textArea: {
    minHeight: 100,
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.md,
    padding: 12,
    color: colors.white, fontSize: 16, lineHeight: 22,
    fontFamily: 'Menlo',
    textAlignVertical: 'top' as any,
  } as any,

  tokensRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
  },
  tokenChip: {
    minHeight: 44,
    paddingHorizontal: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  tokenChipText: { color: colors.gold, fontFamily: 'Menlo', fontSize: 11, fontWeight: '600' },

  archiveLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  archiveLinkText: { color: colors.red, fontSize: 13, fontWeight: '600' },

  confirmCard: {
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.redBorder,
    borderRadius: radius.lg,
    padding: 16, gap: 10,
  },
  confirmTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  confirmBody: { color: colors.grey2, fontSize: 13, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, minHeight: 44,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: colors.grey2, fontSize: 13, fontWeight: '700' },
  archiveBtn: {
    flex: 1, minHeight: 44,
    backgroundColor: colors.red,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  archiveBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  error: { color: colors.red, fontSize: 13, padding: 4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});