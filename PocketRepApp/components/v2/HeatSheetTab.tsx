import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius, spacing } from '@/constants/theme';
import { HeatStripe, SectionHead } from './atoms';
import { TIERS, stalenessColor, type TierKey } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import WeeklyDigestCard from './WeeklyDigestCard';
import DailyCheckIn from './DailyCheckIn';
import NurtureBanner from './NurtureBanner';
import FollowUpQueue from './FollowUpQueue';
import { heatReasons } from '@/lib/v2/heatReasons';

function followUpLabel(c: V2Contact): { text: string; color: string } | null {
  if (!c.nextFollowupDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (c.nextFollowupDate < today) {
    const d = Math.max(1, Math.floor((Date.now() - new Date(c.nextFollowupDate + 'T00:00:00Z').getTime()) / 86_400_000));
    return { text: `Follow-up ${d}d overdue`, color: colors.red };
  }
  if (c.nextFollowupDate === today) return { text: 'Follow-up today', color: colors.gold };
  const d2 = Math.floor((new Date(c.nextFollowupDate + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000);
  if (d2 <= 1) return { text: 'Follow-up tomorrow', color: colors.orange };
  return null;
}

function HeatRow({ c, onTap }: { c: V2Contact; onTap: () => void }) {
  const tier = TIERS[c.tier];
  const staleC = stalenessColor(c.days);
  const reasons = heatReasons(c).slice(0, 2);
  const fu = followUpLabel(c);
  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${c.name}${c.vehicle ? `, ${c.vehicle}` : ''}`}
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
        {fu ? (
          <Text style={[styles.reasons, { color: fu.color }]} numberOfLines={1}>{fu.text}</Text>
        ) : reasons.length > 0 ? (
          <Text style={styles.reasons} numberOfLines={1}>{reasons.join(' · ')}</Text>
        ) : null}
      </View>
      <View style={styles.daysWrap}>
        <Text style={[styles.daysNum, { color: staleC }]}>{c.days === 0 ? '•' : c.days}</Text>
        <Text style={styles.daysLabel}>{c.days === 0 ? 'TODAY' : c.days === 1 ? '1 DAY' : 'DAYS'}</Text>
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
  onOpenGamePlan,
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
  onOpenGamePlan?: () => void;
}) {
  const [hotOnly, setHotOnly] = useState(false);

  if (error && !contacts) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load contacts.</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
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

  if (contacts.length === 0) {
    return (
      <View style={styles.root}>
        <DailyCheckIn contacts={contacts} />
        <FollowUpQueue />
        <View style={styles.emptyCard}>
          <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>PR</Text></View>
          <Text style={styles.emptyEyebrow}>BUILD YOUR BOOK</Text>
          <Text style={styles.emptyTitle}>Your book is empty</Text>
          <Text style={styles.emptyBody}>Add your first customer or import your book to start working your day.</Text>
          <View style={styles.emptyBtns}>
            {onAddContact ? (
              <Pressable
                onPress={onAddContact}
                style={({ pressed }) => [styles.emptyPrimary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Add a customer"
              >
                <Text style={styles.emptyPrimaryText}>＋ Add a customer</Text>
              </Pressable>
            ) : null}
            {onImportContacts ? (
              <Pressable
                onPress={onImportContacts}
                style={({ pressed }) => [styles.emptySecondary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Import your book"
              >
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

  return (
    <View style={styles.root}>
      {new Date().getDay() === 1 && new Date().getHours() >= 8 ? <WeeklyDigestCard /> : null}

      <DailyCheckIn contacts={contacts} onStartList={() => setHotOnly(true)} />

      {onOpenNurture ? (
        <NurtureBanner refetchKey={nurtureRefetchKey} onOpenReviewer={onOpenNurture} />
      ) : null}

      <FollowUpQueue />

      {onOpenGamePlan ? (
        <Pressable
          onPress={onOpenGamePlan}
          style={({ pressed }) => [styles.gamePlanBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open Rex Game Plan"
        >
          <View style={styles.gamePlanOrb}><View style={styles.gamePlanCore} /></View>
          <View style={styles.gamePlanCopy}>
            <View style={styles.gamePlanTopline}>
              <Text style={styles.gamePlanKicker}>REX · READY</Text>
              <Text style={styles.gamePlanBadge}>TODAY</Text>
            </View>
            <Text style={styles.gamePlanTitle}>Work My Book</Text>
            <Text style={styles.gamePlanSub}>Recommended moves, Call Queue, and personalized Text Queue.</Text>
          </View>
          <Text style={styles.gamePlanChev}>›</Text>
        </Pressable>
      ) : null}

      {onAnalyzeStalled ? (
        <Pressable
          onPress={onAnalyzeStalled}
          style={({ pressed }) => [styles.stalledBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Review stalled leads with Rex"
        >
          <View style={styles.stalledIconWrap}><Text style={styles.stalledIcon}>↗</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stalledKicker}>REX REVIEW</Text>
            <Text style={styles.stalledTitle}>Review stalled leads</Text>
            <Text style={styles.stalledSub}>Rank who to push, hold, or move on from.</Text>
          </View>
          <Text style={styles.stalledChev}>›</Text>
        </Pressable>
      ) : null}

      <SectionHead label="HOT" count={groups.hot.length} color={colors.red} icon="🔥" />
      {groups.hot.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

      {hotOnly ? (
        <Pressable
          onPress={() => setHotOnly(false)}
          style={({ pressed }) => [styles.showAllBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Show all contacts"
        >
          <Text style={styles.showAllText}>Show all contacts ↓</Text>
        </Pressable>
      ) : (
        <>
          <SectionHead label="WARM" count={groups.warm.length} color={colors.orange} icon="☀️" />
          {groups.warm.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}

          <SectionHead label="COLD" count={groups.cold.length} color={colors.grey2} icon="🧊" />
          {groups.cold.map(c => <HeatRow key={c.id} c={c} onTap={() => onSelect(c)} />)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.xl },
  center: { padding: spacing.xl, alignItems: 'center' },
  error: { color: colors.red, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  retryBtn: {
    minHeight: 44,
    minWidth: 110,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorderStrong,
    borderRadius: radius.full,
  },
  retryText: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  showAllBtn: {
    minHeight: 46,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  showAllText: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  row: {
    position: 'relative',
    minHeight: 68,
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
  stripe: { borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md },
  rowText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: colors.white, letterSpacing: -0.2, flexShrink: 1 },
  demoPill: {
    fontSize: 8, fontWeight: '800', letterSpacing: 0.8, color: colors.gold,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden',
  },
  vehicle: { fontSize: 11, fontWeight: '500', color: colors.grey2, marginTop: 2 },
  reasons: { fontSize: 10, fontWeight: '700', color: colors.gold, marginTop: 3, letterSpacing: 0.1 },
  daysWrap: { alignItems: 'flex-end' },
  daysNum: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5, lineHeight: 18 },
  daysLabel: { fontSize: 9, fontWeight: '800', color: colors.grey, marginTop: 4, letterSpacing: 0.6 },
  gamePlanBtn: {
    minHeight: 104,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorderStrong,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  gamePlanOrb: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.goldBorderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  gamePlanCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  gamePlanCopy: { flex: 1, minWidth: 0 },
  gamePlanTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gamePlanKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  gamePlanBadge: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  gamePlanTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.35, marginTop: 5 },
  gamePlanSub: { fontSize: 11, lineHeight: 16, color: colors.grey3, marginTop: 4 },
  gamePlanChev: { fontSize: 20, color: colors.gold, fontWeight: '800' },
  stalledBtn: {
    minHeight: 82,
    marginHorizontal: 14,
    marginTop: 7,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stalledIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  stalledIcon: { fontSize: 17, color: colors.gold, fontWeight: '900' },
  stalledKicker: { fontSize: 8, color: colors.gold, fontWeight: '900', letterSpacing: 0.9, marginBottom: 3 },
  stalledTitle: { fontSize: 14, fontWeight: '800', color: colors.white, letterSpacing: -0.2 },
  stalledSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  stalledChev: { fontSize: 18, color: colors.gold },
  emptyCard: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 22,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  emptyMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorderStrong },
  emptyMarkText: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  emptyEyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.3, marginTop: 6 },
  emptyBody: { fontSize: 13, color: colors.grey2, textAlign: 'center', marginTop: 7, lineHeight: 19 },
  emptyBtns: { width: '100%', gap: 9, marginTop: 18 },
  emptyPrimary: { minHeight: 50, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gold2 },
  emptyPrimaryText: { color: colors.ink, fontWeight: '900', fontSize: 13 },
  emptySecondary: { minHeight: 50, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md },
  emptySecondaryText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
