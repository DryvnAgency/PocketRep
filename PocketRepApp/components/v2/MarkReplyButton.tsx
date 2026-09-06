import { useState } from 'react';
import { Alert, View, Text, Pressable, StyleSheet, TextInput, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { markNurtureReply, type ReplyKind } from '@/lib/v2/manualReplyTracker';

export default function MarkReplyButton({
  nurtureMessageId, contactId, onMarked,
}: {
  nurtureMessageId: string;
  contactId: string;
  onMarked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [followUpDays, setFollowUpDays] = useState('7');
  const [working, setWorking] = useState<ReplyKind | null>(null);

  const apply = async (kind: ReplyKind) => {
    if (working) return;
    setWorking(kind);
    try {
      await markNurtureReply({
        nurtureMessageId,
        contactId,
        kind,
        replyText: replyText.trim() || undefined,
        followUpInDays: kind === 'later' ? Number(followUpDays) || 7 : undefined,
      });
      setOpen(false);
      setReplyText('');
      onMarked();
    } catch (error: any) {
      Alert.alert('Could not save reply', error?.message ?? 'Try again. Nothing was changed.');
    } finally {
      setWorking(null);
    }
  };

  if (!open) {
    // One tap for the common case (a positive reply → heat +20, rep_decision
    // active). The more control opens neutral / negative / later. All four still
    // run through the same manual reply cascade; nothing customer-facing is sent.
    return (
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => apply('positive')}
          disabled={!!working}
          accessibilityRole="button"
          accessibilityLabel="Mark a positive reply"
          accessibilityState={{ disabled: !!working, busy: working === 'positive' }}
          style={({ pressed }) => [
            styles.quickPositive,
            !!working && styles.disabled,
            pressed && !working && styles.pressed,
          ]}
        >
          <Text style={styles.quickPositiveText}>
            {working === 'positive' ? 'Marking…' : '👍 Positive'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={!!working}
          accessibilityRole="button"
          accessibilityLabel="More reply options"
          accessibilityState={{ disabled: !!working }}
          style={({ pressed }) => [
            styles.quickMore,
            !!working && styles.disabled,
            pressed && !working && styles.pressed,
          ]}
        >
          <Text style={styles.quickMoreText}>⋯</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.rexDot} />
        <View style={styles.cardHeadCopy}>
          <Text style={styles.kicker}>REPLY OUTCOME</Text>
          <Text style={styles.title}>How did they reply?</Text>
        </View>
      </View>

      <TextInput
        value={replyText}
        onChangeText={setReplyText}
        placeholder="Paste the reply text (optional)"
        placeholderTextColor={colors.grey}
        multiline
        accessibilityLabel="Customer reply text"
        style={styles.input}
      />

      <View style={styles.row}>
        <ReplyButton label="Positive" kind="positive" working={working} onPress={apply} tone="positive" />
        <ReplyButton label="Neutral" kind="neutral" working={working} onPress={apply} tone="neutral" />
        <ReplyButton label="Negative" kind="negative" working={working} onPress={apply} tone="negative" />
      </View>

      <View style={styles.laterRow}>
        <TextInput
          value={followUpDays}
          onChangeText={setFollowUpDays}
          keyboardType="numeric"
          accessibilityLabel="Follow up in days"
          style={styles.dayInput}
        />
        <Text style={styles.laterLabel}>days</Text>
        <ReplyButton label="Follow up later" kind="later" working={working} onPress={apply} tone="later" grow />
      </View>

      <Pressable
        onPress={() => setOpen(false)}
        disabled={!!working}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply outcome"
        accessibilityState={{ disabled: !!working }}
        style={({ pressed }) => [styles.cancelBtn, !!working && styles.disabled, pressed && !working && styles.pressed]}
      >
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function ReplyButton({
  label,
  kind,
  working,
  onPress,
  tone,
  grow = false,
}: {
  label: string;
  kind: ReplyKind;
  working: ReplyKind | null;
  onPress: (kind: ReplyKind) => void;
  tone: 'positive' | 'neutral' | 'negative' | 'later';
  grow?: boolean;
}) {
  const disabled = !!working;
  return (
    <Pressable
      onPress={() => onPress(kind)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} reply outcome`}
      accessibilityState={{ disabled, busy: working === kind }}
      style={({ pressed }) => [
        styles.btn,
        grow && styles.btnGrow,
        tone === 'positive' && styles.positive,
        tone === 'negative' && styles.negative,
        tone === 'neutral' && styles.neutral,
        tone === 'later' && styles.later,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[
        styles.btnText,
        (tone === 'positive' || tone === 'negative') && styles.btnTextStrong,
      ]}>
        {working === kind ? 'Saving…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', flexWrap: 'wrap' },
  quickPositive: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.green,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPositiveText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 0.2 },
  quickMore: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMoreText: { fontSize: 18, fontWeight: '900', color: colors.gold, lineHeight: 20 },

  card: {
    minWidth: 0,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    gap: 12,
  },
  cardHead: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rexDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  cardHeadCopy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: colors.gold },
  title: { marginTop: 2, fontSize: 14, lineHeight: 18, fontWeight: '800', color: colors.white },
  input: {
    minHeight: 76,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 11,
    color: colors.white,
    fontSize: Platform.OS === 'web' ? 16 : 14,
    lineHeight: 20,
    textAlignVertical: 'top' as any,
  } as any,
  row: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    minHeight: 44,
    minWidth: 96,
    flexGrow: 1,
    flexBasis: 96,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  btnGrow: { flexBasis: 132 },
  btnText: { maxWidth: '100%', flexShrink: 1, textAlign: 'center', fontSize: 12, lineHeight: 15, fontWeight: '800', color: colors.grey3 },
  btnTextStrong: { color: colors.white },
  positive: { backgroundColor: colors.green, borderColor: colors.green },
  negative: { backgroundColor: colors.red, borderColor: colors.red },
  neutral: { backgroundColor: colors.ink2 },
  later: { backgroundColor: colors.goldBg, borderColor: colors.goldBorderStrong },

  laterRow: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  dayInput: {
    width: 64,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    color: colors.white,
    fontSize: Platform.OS === 'web' ? 16 : 14,
    textAlign: 'center',
  },
  laterLabel: { fontSize: 12, color: colors.grey2 },

  cancelBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  cancel: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
