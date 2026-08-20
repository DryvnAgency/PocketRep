import { View, Text, Pressable, StyleSheet } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius, spacing } from '@/constants/theme';
import { HeatStripe, SectionHead, StatNumber } from './atoms';
import { TIERS, stalenessColor, type TierKey } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import WeeklyDigestCard from './WeeklyDigestCard';
import DailyCheckIn from './DailyCheckIn';
import NurtureBanner from './NurtureBanner';
import FollowUpQueue from './FollowUpQueue';
import { heatReasons } from '@/lib/v2/heatReasons';

const TODAY_LABEL = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

function HeatRow({ c, onTap }: { c: V2Contact; onTap: () => void }) {
  const tier = TIERS[c.tier];
  const staleC = stalenessColor(c.days);
  const reasons = heatReasons(c).slice(0, 2);
  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <HeatStripe color={tier.color} style={styles.stripe} />
      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
          {c.isDemo ? <Text style={styles.demoPill}>DEMO</Text> : null}
        </View>
        <Text style={styles.vehicle} numberOfLines={1}>
          {c.vehicle ?? '—'}{c.trim ? ` · ${c.trim}` : ''}
        </Text>
        {reasons.length > 0 ? (
          <Text style={styles.reasons} numberOfLines={1}>{reasons.join(' · ')}</Text>
        ) : null}
      </View>
      <View style={styles.daysWrap}>
        <Text style={[styles.daysNum, { color: staleC }]}>
          {c.days === 0 ? '•' : c.days}
        </Text>
        <Text style={styles.daysLabel}>
          {c.days === 0 ? 'TODAY' : c.days === 1 ? '1 DAY' : 'DAYS'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HeatSheetTab({
  contacts,
  error,
  onSelect,
  onRetry,
  onAddContact,
  onImportContacts,
  nurtureRefetchKey = 0,
  onOpenNurture,
  onAnalyzeStalled,
}: {
  contacts: V2Contact[] | null;
  error: string | null;
  onSelect: (c: V2Contact) => void;
  onRetry?: () => void;
  onAddContact?: () => void;
  onImportContacts?: () => void;
  nurtureRefetchKey?: number;
  onOpenNurture?: () => void;
  onAnalyzeStalled?: () => void;
}) {
  if (error && !contacts) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load contacts.</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading contacts"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (!contacts) {
    return (
      <View style={styles.center}>
        <RadarLoader size={36} />
      </View>
    );
  }

  // Empty book (seed failed, or the rep cleared/imported nothing yet): don't
  // show empty tier headers + a misleading "You're caught up" — give a real
  // first-run CTA to add or import.
  if (contacts.length === 0) {
    return (
      <View style={styles.root}>
        <DailyCheckIn contacts={contacts} />
        <FollowUpQueue />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Your book is empty</Text>
          <Text style={styles.emptyBody}>Add your first customer or import your book to start working your day.</Text>
          <View style={styles.emptyBtns}>
            {onAddContact ? (
              <Pressable onPress={onAddContact} style={styles.emptyPrimary} accessibilityRole="button" accessibilityLabel="Add a customer">
                <Text style={styles.emptyPrimaryText}>＋ Add a customer</Text>
              </Pressable>
            ) : null}
            {onImportContacts ? (
              <Pressable onPress={onImportContacts} style={styles.emptySecondary} accessibilityRole="button" accessibilityLabel="Import your book">
                <Text style={styles.emptySecondaryText}>⇪ Import your book</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const groups: Record<TierKey, V2Contact[]> = { hot: [], warm: [], cold: [] };
  for (const c of contacts) groups[c.tier].push(c);

  const overdueCount = contacts.filter(c => c.days >= 4).length;

  return (
    <View style={styles.root}>
      <WeeklyDigestCard />

      <DailyCheckIn contacts={contacts} />

      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerLabel}>TODAY · {TODAY_LABEL}</Text>
          <Text style={styles.bannerBody}>
            {overdueCount > 0
              ? `${overdueCount} follow-up${overdueCount === 1 ? '' : 's'} overdue`
              : "You're caught up"}
          </Text>
        </View>
        <StatNumber value={String(overdueCount)} size={32} color={colors.gold2} />
      </View>

      {onOpenNurture ? (
        <NurtureBanner refetchKey={nurtureRefetchKey} onOpenReviewer={onOpenNurture} />
      ) : null}

      <FollowUpQueue />

      {onAnalyzeStalled ? (
        <Pressable onPress={onAnalyzeStalled} style={styles.stalledBtn}>
          <Text style={styles.stalledIcon}>🧭</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stalledTitle}>Review stalled leads</Text>
            <Text style={styles.stalledSub}>Rex ranks who to kill, push, or fence</Text>
          </View>
          <Text style={styles.stalledChev}>›</Text>
        </Pressable>
      ) : null}

      <SectionHead label="HOT" count={groups.hot.length} color={colors.red} icon="🔥" />
      {groups.hot.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

      <SectionHead label="WARM" count={groups.warm.length} color={colors.orange} icon="☀️" />
      {groups.warm.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

      <SectionHead label="COLD" count={groups.cold.length} color={colors.grey2} icon="🧊" />
      {groups.cold.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.xl },
  center: { padding: spacing.xl, alignItems: 'center' },
  error: { color: colors.red, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.full,
  },
  retryText: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  banner: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  bannerBody: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  row: {
    position: 'relative',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    marginHorizontal: 14,
    marginVertical: 3,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 14,
    paddingLeft: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  stripe: { borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md },
  rowText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.white, letterSpacing: -0.2, flexShrink: 1 },
  demoPill: {
    fontSize: 8, fontWeight: '800', letterSpacing: 0.8, color: colors.gold,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden',
  },
  vehicle: { fontSize: 11, fontWeight: '500', color: colors.grey2, marginTop: 2 },
  reasons: { fontSize: 10, fontWeight: '700', color: colors.gold, marginTop: 3, letterSpacing: 0.1 },
  daysWrap: { alignItems: 'flex-end' },
  daysNum: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, lineHeight: 18 },
  daysLabel: { fontSize: 9, fontWeight: '700', color: colors.grey, marginTop: 4, letterSpacing: 0.6 },
  stalledBtn: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stalledIcon: { fontSize: 18 },
  stalledTitle: { fontSize: 14, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  stalledSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  stalledChev: { fontSize: 16, color: colors.gold },
  emptyCard: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: -0.2 },
  emptyBody: { fontSize: 13, color: colors.grey2, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  emptyBtns: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16 },
  emptyPrimary: {
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: colors.gold, borderRadius: radius.full,
  },
  emptyPrimaryText: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  emptySecondary: {
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.full,
  },
  emptySecondaryText: { color: colors.gold, fontWeight: '800', fontSize: 13 },
});
