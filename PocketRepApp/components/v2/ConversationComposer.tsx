import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';

// NEW 5 capture surface: paste a whole customer conversation, then hand the
// raw transcript to Rex to parse into a contact + notes + plan. V1 is
// text-only (no dictation, no mic permission) — paste/type only. Pure
// capture — the parse + confirm-before-write lives in RexCoach.
export default function ConversationComposer({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (transcript: string) => void;
}) {
  const [text, setText] = useState('');
  const keyboardInset = useWebVisualViewportInset(open);

  useEffect(() => {
    if (open) { setText(''); }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSubmit(t);
  };

  const disabled = busy || !text.trim();

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} />
      <View style={[styles.sheet, keyboardInset > 0 ? { transform: [{ translateY: -keyboardInset }] } : null]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>REX · CONVERSATION CAPTURE</Text>
            <Text style={styles.title}>Paste what was said</Text>
            <Text style={styles.subtitle}>Rex will organize the context first. Nothing is saved until you review and confirm.</Text>
          </View>
          <Pressable
            onPress={onClose}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close conversation capture"
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && !busy && styles.closeBtnPressed,
              busy && styles.controlDisabled,
            ]}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          editable={!busy}
          placeholder="Paste the conversation here. Rex will pull out the contact, notes, and your next move."
          placeholderTextColor={colors.grey}
          style={[styles.input, busy && styles.inputBusy]}
          accessibilityLabel="Customer conversation"
        />

        <View style={styles.reviewRail} accessibilityLiveRegion="polite">
          {busy ? <ActivityIndicator size="small" color={colors.gold} /> : <View style={styles.readyDot} />}
          <Text style={[styles.reviewText, busy && styles.reviewTextBusy]}>
            {busy ? 'REX IS ORGANIZING THE CONVERSATION…' : 'PARSE → REVIEW → CONFIRM'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={submit}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Rex is parsing conversation' : 'Parse conversation with Rex'}
            accessibilityState={{ disabled, busy }}
            style={({ pressed }) => [
              styles.parseBtn,
              pressed && !disabled && styles.parseBtnPressed,
              disabled && styles.controlDisabled,
            ]}
          >
            {busy ? (
              <View style={styles.parseBusyRow}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={styles.parseText}>Parsing with Rex…</Text>
              </View>
            ) : <Text style={styles.parseText}>Parse with Rex →</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 200, justifyContent: 'flex-end' } as any,
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.82)' },
  sheet: {
    backgroundColor: colors.ink2,
    borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-bottom))' as any) : 24,
  },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: colors.ink4, marginTop: 10, marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  title: { fontSize: 18, fontWeight: '800', color: colors.white, marginTop: 3, letterSpacing: -0.4 },
  subtitle: { fontSize: 12, lineHeight: 17, color: colors.grey2, marginTop: 5, maxWidth: 420 },
  closeBtn: {
    width: 44, height: 44, flexShrink: 0, borderRadius: 22,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnPressed: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  closeText: { color: colors.grey2, fontSize: 15 },
  input: {
    minHeight: 156, maxHeight: 280,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 13,
    color: colors.white, fontSize: Platform.OS === 'web' ? 16 : 14, lineHeight: 20,
    textAlignVertical: 'top' as any,
  },
  inputBusy: { borderColor: colors.goldBorder },
  reviewRail: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    marginTop: 10,
  },
  readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  reviewText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '800', color: colors.grey2, letterSpacing: 1.0 },
  reviewTextBusy: { color: colors.gold, letterSpacing: 0.7 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  parseBtn: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  parseBtnPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  parseBusyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  parseText: { maxWidth: '100%', textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '800', color: colors.ink, letterSpacing: 0.1 },
  controlDisabled: { opacity: 0.45 },
});
