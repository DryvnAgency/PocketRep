import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label, Pill } from './atoms';
import {
  updateSequenceStep,
  renameSequence,
  archiveSequence,
  type V2Sequence,
} from '@/lib/v2/useSequences';

const TOKENS = ['first_name', 'rep_name', 'dealer', 'vehicle', 'color', 'trade_value', 'lease_end'];
const CHANNELS: Array<{ value: 'text' | 'call' | 'email'; icon: string; label: string }> = [
  { value: 'text', icon: '💬', label: 'Text' },
  { value: 'call', icon: '📞', label: 'Call' },
  { value: 'email', icon: '✉', label: 'Email' },
];

// Highlight {{tokens}} in the preview view.
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
    setPreviewIds(new Set(sequence.steps.map(s => s.id))); // start in preview mode
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
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>SEQUENCE</Label>
          <Text style={styles.topTitle} numberOfLines={1}>{sequence.name}</Text>
        </View>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
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
                <Pressable onPress={() => togglePreview(step.id)} hitSlop={6}>
                  <Text style={styles.linkText}>{previewing ? 'EDIT' : 'PREVIEW'}</Text>
                </Pressable>
              </View>

              <View style={styles.channelRow}>
                {CHANNELS.map(c => (
                  <Pressable
                    key={c.value}
                    onPress={() => setStepChannels(prev => ({ ...prev, [step.id]: c.value }))}
                    style={[
                      styles.channelBtn,
                      stepChannels[step.id] === c.value
                        ? { backgroundColor: colors.goldBg, borderColor: colors.gold }
                        : { backgroundColor: 'transparent', borderColor: colors.ink4 },
                    ]}
                  >
                    <Text style={{ fontSize: 12 }}>{c.icon}</Text>
                    <Text style={[
                      styles.channelText,
                      { color: stepChannels[step.id] === c.value ? colors.gold : colors.grey2 },
                    ]}>{c.label}</Text>
                  </Pressable>
                ))}
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
                  {TOKENS.map(tok => (
                    <Pressable
                      key={tok}
                      onPress={() => insertToken(step.id, tok)}
                      style={styles.tokenChip}
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
              <Pressable onPress={() => setConfirmArchive(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleArchive} style={styles.archiveBtn}>
                <Text style={styles.archiveBtnText}>Archive</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmArchive(true)} style={styles.archiveLink}>
            <Text style={styles.archiveLinkText}>Archive sequence</Text>
          </Pressable>
        )}
        <View style={{ height: 40 }} />
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
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 2 },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.gold,
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },

  body: { padding: 14, gap: 14 },

  field: { gap: 8 },
  nameInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    color: colors.white, fontSize: 15, fontWeight: '600',
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
  linkText: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },

  channelRow: { flexDirection: 'row', gap: 6 },
  channelBtn: {
    flex: 1, paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  channelText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  delayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delayLabel: { fontSize: 11, fontWeight: '700', color: colors.grey2, letterSpacing: 0.5 },
  delayInput: {
    width: 50,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    color: colors.white, fontSize: 13, fontWeight: '700',
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
    color: colors.white, fontSize: 14, lineHeight: 20,
    fontFamily: 'Menlo',
    textAlignVertical: 'top' as any,
  } as any,

  tokensRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
  },
  tokenChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full,
  },
  tokenChipText: { color: colors.gold, fontFamily: 'Menlo', fontSize: 11, fontWeight: '600' },

  archiveLink: { alignItems: 'center', paddingVertical: 14 },
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
    flex: 1, paddingVertical: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.grey2, fontSize: 13, fontWeight: '700' },
  archiveBtn: {
    flex: 1, paddingVertical: 11,
    backgroundColor: colors.red,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  archiveBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },

  error: { color: colors.red, fontSize: 13, padding: 4 },
});
