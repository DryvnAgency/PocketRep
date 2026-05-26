import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import type { RexAction } from '@/lib/v2/rexActions';
import { actionWritesData, summarizeAction } from '@/lib/v2/rexActions';
import type { RexListenerState } from '@/lib/v2/heyRexListener';

export default function HeyRexSheet({
  state,
  partial,
  thinking,
  action,
  executing,
  error,
  onConfirm,
  onCancel,
}: {
  state: RexListenerState;
  partial: string;
  thinking: boolean;
  action: RexAction | null;
  executing: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Show the sheet whenever we're past the idle state OR there's a pending action.
  const open = state === 'awake' || state === 'processing' || !!action || thinking || executing;
  if (!open) return null;

  const summary = action ? summarizeAction(action) : '';
  const isClarify = action?.type === 'clarify';
  const isSay = action?.type === 'say' || isClarify;
  const needsConfirm = action && actionWritesData(action.type);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.orb} />
          <Label color={colors.gold}>
            HEY REX · {state === 'awake' ? 'LISTENING' : thinking || state === 'processing' ? 'THINKING' : executing ? 'WORKING' : 'READY'}
          </Label>
          <View style={{ flex: 1 }} />
          {!executing ? (
            <Pressable onPress={onCancel} hitSlop={6}>
              <Text style={styles.cancel}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {partial ? (
          <Text style={styles.partial} numberOfLines={3}>“{partial}”</Text>
        ) : state === 'awake' ? (
          <Text style={styles.hintItalic}>Listening… speak naturally.</Text>
        ) : null}

        {thinking ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={colors.gold} size="small" />
            <Text style={styles.hint}>Rex is figuring out what to do…</Text>
          </View>
        ) : null}

        {action?.say ? (
          <Text style={styles.say}>{action.say}</Text>
        ) : null}

        {summary && !isSay ? (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>PROPOSED</Text>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {needsConfirm && !executing ? (
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={styles.confirmBtn}>
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </Pressable>
          </View>
        ) : null}

        {executing ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={colors.gold} size="small" />
            <Text style={styles.hint}>Saving…</Text>
          </View>
        ) : null}

        {action && !needsConfirm && !executing ? (
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.confirmBtn}>
              <Text style={styles.confirmBtnText}>OK</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12, right: 12, bottom: 96,
  } as any,
  card: {
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.gold,
  },
  cancel: { fontSize: 16, color: colors.grey2, paddingHorizontal: 4 },
  partial: {
    fontSize: 14,
    color: colors.white,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  hint: { fontSize: 12, color: colors.grey2 },
  hintItalic: { fontSize: 12, color: colors.grey2, fontStyle: 'italic' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  say: { fontSize: 14, color: colors.white, lineHeight: 20 },
  summary: {
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 1.0 },
  summaryText: { fontSize: 13, fontWeight: '600', color: colors.white, marginTop: 6, lineHeight: 18 },
  error: { color: colors.red, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: colors.grey2 },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 11,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
});
