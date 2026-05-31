import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Animated, Easing, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import type { RexAction } from '@/lib/v2/rexActions';
import { actionWritesData, summarizeAction } from '@/lib/v2/rexActions';
import type { RexListenerState } from '@/lib/v2/heyRexListener';
import type { V2Contact } from '@/lib/v2/useContacts';
import BookSummaryCard from './BookSummaryCard';
import ContactListPreview from './ContactListPreview';

// Siri-style equalizer. Bars breathe while Rex is listening / thinking /
// talking and rest flat otherwise. Animation is timer-driven (not amplitude),
// which keeps it web-safe with no extra mic plumbing.
function OrbWave({ active }: { active: boolean }) {
  const bars = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.4))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach(b => { b.stopAnimation(); b.setValue(0.4); });
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 380 + i * 90, delay: i * 70, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(b, { toValue: 0.35, duration: 380 + i * 90, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, bars]);
  return (
    <View style={styles.wave}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={[styles.waveBar, { transform: [{ scaleY: b }] }]} />
      ))}
    </View>
  );
}

export default function HeyRexSheet({
  state,
  partial,
  thinking,
  streamingSay,
  speaking,
  action,
  executing,
  error,
  contacts,
  onConfirm,
  onCancel,
  onOpenContact,
}: {
  state: RexListenerState;
  partial: string;
  thinking: boolean;
  streamingSay: string;
  speaking: boolean;
  action: RexAction | null;
  executing: boolean;
  error: string | null;
  contacts: V2Contact[];
  onConfirm: () => void;
  onCancel: () => void;
  onOpenContact?: (id: string) => void;
}) {
  // Show the sheet whenever we're past idle, mid-reply, or have something to say.
  const open =
    state === 'awake' || state === 'processing' ||
    !!action || thinking || executing || speaking || !!streamingSay || !!error;

  const isActive = state === 'awake' || thinking || state === 'processing' || executing || speaking;

  if (!open) return null;

  const summary = action ? summarizeAction(action) : '';
  const isClarify = action?.type === 'clarify';
  const isSay = action?.type === 'say' || isClarify;
  const needsConfirm = action && actionWritesData(action.type);
  const sayText = action?.say || streamingSay;

  const statusLabel =
    state === 'awake' ? 'LISTENING'
      : thinking || state === 'processing' ? 'THINKING'
        : executing ? 'WORKING'
          : speaking ? 'SPEAKING'
            : 'READY';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <OrbWave active={isActive} />
          <Label color={colors.gold}>HEY REX · {statusLabel}</Label>
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

        {thinking && !streamingSay ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={colors.gold} size="small" />
            <Text style={styles.hint}>Rex is figuring out what to do…</Text>
          </View>
        ) : null}

        {sayText ? (
          <Text style={styles.say}>{sayText}</Text>
        ) : null}

        {action?.type === 'book_summary' ? (
          <BookSummaryCard payload={action.payload} />
        ) : action?.type === 'filter_contacts' ? (
          <ContactListPreview
            contacts={contacts.filter(c => (action.payload.contact_ids ?? []).includes(c.id))}
            filterSummary={action.payload.filter_summary}
            matchedCount={action.payload.matched_count ?? action.payload.contact_ids?.length}
            onTapContact={onOpenContact}
          />
        ) : summary && !isSay ? (
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
  wave: {
    width: 22, height: 22,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 2.5,
  },
  waveBar: {
    width: 3, height: 16, borderRadius: 2,
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
