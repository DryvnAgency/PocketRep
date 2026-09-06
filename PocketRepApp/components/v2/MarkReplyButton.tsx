import { useState } from 'react';
import { Alert, View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
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
    // active). The ⋯ opens the full panel for neutral / negative / later, which
    // need the reply-text / days inputs. All four still run the same cascade.
    return (
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => apply('positive')}
          disabled={!!working}
          style={[styles.quickPositive, working === 'positive' && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Mark a positive reply"
        >
          <Text style={styles.quickPositiveText}>
            {working === 'positive' ? 'Marking…' : '👍 Positive'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={!!working}
          style={styles.quickMore}
          accessibilityRole="button"
          accessibilityLabel="More reply options"
        >
          <Text style={styles.quickMoreText}>⋯</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How did they reply?</Text>
      <TextInput
        value={replyText}
        onChangeText={setReplyText}
        placeholder="Paste the reply text (optional)"
        placeholderTextColor={colors.grey}
        multiline
        style={styles.input}
      />
      <View style={styles.row}>
        <Pressable
          onPress={() => apply('positive')}
          disabled={!!working}
          style={[styles.btn, styles.positive, working === 'positive' && { opacity: 0.6 }]}
        >
          <Text style={[styles.btnText, { color: colors.white }]}>Positive</Text>
        </Pressable>
        <Pressable
          onPress={() => apply('neutral')}
          disabled={!!working}
          style={[styles.btn, styles.neutral, working === 'neutral' && { opacity: 0.6 }]}
        >
          <Text style={styles.btnText}>Neutral</Text>
        </Pressable>
        <Pressable
          onPress={() => apply('negative')}
          disabled={!!working}
          style={[styles.btn, styles.negative, working === 'negative' && { opacity: 0.6 }]}
        >
          <Text style={[styles.btnText, { color: colors.white }]}>Negative</Text>
        </Pressable>
      </View>
      <View style={styles.laterRow}>
        <TextInput
          value={followUpDays}
          onChangeText={setFollowUpDays}
          keyboardType="numeric"
          style={styles.dayInput}
        />
        <Text style={styles.laterLabel}>days</Text>
        <Pressable
          onPress={() => apply('later')}
          disabled={!!working}
          style={[styles.btn, styles.later, working === 'later' && { opacity: 0.6 }]}
        >
          <Text style={styles.btnText}>Follow up later</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => setOpen(false)} hitSlop={6}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  quickPositive: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.green,
    borderWidth: 1, borderColor: colors.green,
  },
  quickPositiveText: { fontSize: 11, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  quickMore: {
    width: 30, height: 30, borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  quickMoreText: { fontSize: 14, fontWeight: '800', color: colors.gold, lineHeight: 16 },

  card: {
    padding: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    gap: 10,
  },
  title: { fontSize: 13, fontWeight: '700', color: colors.white },
  input: {
    minHeight: 60,
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 10,
    color: colors.white,
    fontSize: 13,
    textAlignVertical: 'top' as any,
  } as any,
  row: { flexDirection: 'row', gap: 6 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  btnText: { fontSize: 12, fontWeight: '700', color: colors.grey3 },
  positive: { backgroundColor: colors.green, borderColor: colors.green },
  negative: { backgroundColor: colors.red, borderColor: colors.red },
  neutral: { backgroundColor: colors.ink2 },
  later: { backgroundColor: colors.goldBg, borderColor: colors.gold },

  laterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayInput: {
    width: 44,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    color: colors.white, fontSize: 13, textAlign: 'center',
  },
  laterLabel: { fontSize: 11, color: colors.grey2 },

  cancel: { fontSize: 11, color: colors.grey2, alignSelf: 'center' },
});
