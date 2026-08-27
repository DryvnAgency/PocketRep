// Owner Control Center — shared UI atoms
// KPI cards, status pills, section headers, mini tables.

import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

// ── KPI Card ────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  sub,
  accent,
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[a.kpiCard, style]}>
      <Text style={a.kpiLabel}>{label}</Text>
      <Text style={[a.kpiValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={a.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Status Pill ─────────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: string }) {
  const color =
    status === 'active' ? colors.green
    : status === 'trialing' ? colors.gold
    : status === 'canceled' || status === 'past_due' ? colors.red
    : status === 'open' ? colors.orange
    : status === 'resolved' ? colors.grey2
    : status === 'rewarded' ? colors.green
    : status === 'verified' ? colors.gold
    : colors.grey2;
  return (
    <Text style={[a.pill, { color, borderColor: color }]}>
      {status.replace('_', ' ').toUpperCase()}
    </Text>
  );
}

// ── Section Header ──────────────────────────────────────────────────────────

export function SectionHeader({
  label,
  count,
  action,
  onAction,
}: {
  label: string;
  count?: number;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={a.sectionRow}>
      <Text style={a.sectionLabel}>
        {label}
        {count != null ? ` · ${count}` : ''}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={a.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── KPI Row (flex wrap) ─────────────────────────────────────────────────────

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <View style={a.kpiRow}>{children}</View>;
}

// ── List Row ────────────────────────────────────────────────────────────────

export function ListRow({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [a.listRow, pressed && a.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={a.listRow}>{children}</View>;
}

// ── Loading / Error / Empty states ──────────────────────────────────────────

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={a.stateCenter}>
      <Text style={a.loadingText}>{label ?? 'Loading…'}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={a.stateCenter}>
      <Text style={a.errorTitle}>Something went wrong</Text>
      <Text style={a.errorBody}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={a.retryBtn}>
          <Text style={a.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: string;
  title: string;
  body: string;
}) {
  return (
    <View style={a.emptyCard}>
      {icon ? <Text style={a.emptyIcon}>{icon}</Text> : null}
      <Text style={a.emptyTitle}>{title}</Text>
      <Text style={a.emptyBody}>{body}</Text>
    </View>
  );
}

// ── Health Indicator ────────────────────────────────────────────────────────

export function HealthDot({ status }: { status: 'ok' | 'warn' | 'error' | 'unknown' }) {
  const emoji = status === 'ok' ? '🟢' : status === 'warn' ? '🟡' : status === 'error' ? '🔴' : '⚪';
  return <Text style={a.healthDot}>{emoji}</Text>;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const a = StyleSheet.create({
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: {
    flex: 1,
    minWidth: 130,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.grey,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.gold,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  kpiSub: { fontSize: 10, color: colors.grey2, marginTop: 2 },

  pill: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.grey,
    textTransform: 'uppercase',
  },
  sectionAction: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  pressed: { opacity: 0.85 },

  stateCenter: { padding: spacing.xl, alignItems: 'center' },
  loadingText: { color: colors.grey2, fontSize: 13, textAlign: 'center' },
  errorTitle: { fontSize: 14, fontWeight: '700', color: colors.red, marginBottom: 6 },
  errorBody: { fontSize: 12, color: colors.grey2, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.full,
  },
  retryText: { color: colors.gold, fontWeight: '700', fontSize: 13 },

  emptyCard: {
    marginTop: 12,
    padding: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  emptyBody: {
    fontSize: 12,
    color: colors.grey2,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  healthDot: { fontSize: 12 },
});
