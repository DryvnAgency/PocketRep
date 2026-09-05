import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';

export function OnboardingScreen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function OnboardingProgress({ step, total, onSkip, skipLabel = 'Skip' }: { step: number; total: number; onSkip: () => void; skipLabel?: string }) {
  const safeTotal = Math.max(total, 1);
  const width = `${Math.min(100, Math.max(0, ((step + 1) / safeTotal) * 100))}%` as `${number}%`;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTrack} accessibilityLabel={`Setup step ${step + 1} of ${safeTotal}`}>
        <View style={[styles.progressFill, { width }]} />
      </View>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={onSkip} style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}>
        <Text style={styles.skipText}>{skipLabel}</Text>
      </Pressable>
    </View>
  );
}

export function RexOnboardingMark({ label = 'REX' }: { label?: string }) {
  return (
    <View style={styles.rexRow}>
      <View style={styles.rexOrb} accessibilityElementsHidden>
        <View style={styles.rexCore} />
      </View>
      <View>
        <Text style={styles.rexLabel}>{label}</Text>
        <View style={styles.statusRow}><View style={styles.statusDot} /><Text style={styles.statusText}>READY</Text></View>
      </View>
    </View>
  );
}

export function OnboardingHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

export function OnboardingPanel({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <View style={[styles.panel, compact && styles.panelCompact]}>{children}</View>;
}

export function EliteChoiceButton({ label, detail, selected = false, onPress, disabled = false }: { label: string; detail?: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
      {detail ? <Text style={styles.choiceDetail}>{detail}</Text> : null}
    </Pressable>
  );
}

export function QuickReplyChip({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.quickReply, selected && styles.quickReplySelected, pressed && styles.pressed]}
    >
      <Text style={[styles.quickReplyText, selected && styles.quickReplyTextSelected]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export function EliteActionButton({ label, onPress, loading = false, disabled = false, tone = 'gold' }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; tone?: 'gold' | 'neutral' }) {
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [styles.action, tone === 'neutral' ? styles.actionNeutral : styles.actionGold, blocked && styles.disabled, pressed && !blocked && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={tone === 'gold' ? colors.ink : colors.white} /> : <Text style={[styles.actionText, tone === 'gold' ? styles.actionTextGold : styles.actionTextNeutral]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingTop: Platform.OS === 'web' ? ('env(safe-area-inset-top)' as any) : 0,
    paddingBottom: Platform.OS === 'web' ? ('env(safe-area-inset-bottom)' as any) : 0,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  progressTrack: { flex: 1, height: 3, borderRadius: radius.full, backgroundColor: colors.ink4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.gold },
  skipButton: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 },
  skipText: { color: colors.grey2, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  rexRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rexOrb: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.ink2, alignItems: 'center', justifyContent: 'center' },
  rexCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  rexLabel: { color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 1.8 },
  statusRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  statusText: { color: colors.grey2, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  heading: { gap: 8 },
  eyebrow: { color: colors.grey2, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.white, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  body: { color: colors.grey3, fontSize: 14, lineHeight: 21 },
  panel: { backgroundColor: colors.surface, borderColor: colors.ink4, borderWidth: 1, borderRadius: radius.xl, padding: 18 },
  panelCompact: { padding: 14 },
  choice: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 10 },
  choiceSelected: { borderColor: colors.goldBorderStrong, backgroundColor: colors.goldBg },
  choiceLabel: { color: colors.white, fontSize: 13, fontWeight: '800' },
  choiceLabelSelected: { color: colors.gold },
  choiceDetail: { color: colors.grey2, fontSize: 10, lineHeight: 14, marginTop: 3 },
  quickReply: { minHeight: 44, maxWidth: 210, justifyContent: 'center', borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.full, backgroundColor: colors.surface2, paddingHorizontal: 14, paddingVertical: 8 },
  quickReplySelected: { borderColor: colors.goldBorderStrong, backgroundColor: colors.goldBg },
  quickReplyText: { color: colors.grey3, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  quickReplyTextSelected: { color: colors.gold },
  action: { minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderWidth: 1 },
  actionGold: { backgroundColor: colors.gold, borderColor: colors.gold2 },
  actionNeutral: { backgroundColor: colors.ink2, borderColor: colors.ink4 },
  actionText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.9 },
  actionTextGold: { color: colors.ink },
  actionTextNeutral: { color: colors.white },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
