import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import type { V2Contact } from '@/lib/v2/useContacts';
import { Label } from './atoms';

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date + 'T12:00:00').getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function hasReferralSignal(c: V2Contact): boolean {
  return c.tags.some(tag => tag.trim().toLowerCase() === 'referral');
}

function scoreContact(c: V2Contact, today: string): number {
  let score = 0;
  if (c.nextFollowupDate && c.nextFollowupDate <= today) score += 120;
  if (c.tier === 'hot') score += 55;
  else if (c.tier === 'warm') score += 35;
  if (!c.isPastCustomer && c.days >= 14) score += 45;
  if (c.isPastCustomer && c.days >= 30) score += 40;
  if (c.days >= 90) score += 50;
  if (hasReferralSignal(c)) score += 55;
  const leaseDays = daysUntil(c.leaseEndDate);
  if (leaseDays != null && leaseDays >= 0 && leaseDays <= 180) score += 60;
  return score;
}

function reasonFor(c: V2Contact, today: string): string {
  if (c.nextFollowupDate && c.nextFollowupDate <= today) return 'Follow-up due';
  if (hasReferralSignal(c)) return 'Referral opportunity';
  const leaseDays = daysUntil(c.leaseEndDate);
  if (leaseDays != null && leaseDays >= 0 && leaseDays <= 180) return 'Lease timing';
  if (c.days >= 90) return `${c.days}d untouched`;
  if (c.isPastCustomer && c.days >= 30) return 'Sold ownership touch';
  if (!c.isPastCustomer && c.days >= 14) return 'Stalled opportunity';
  if (c.tier === 'hot') return 'Hot customer';
  return 'Worth a touch';
}

export default function WorkMyBookSheet({
  open,
  contacts,
  onClose,
  onStartCallQueue,
  onStartTextQueue,
  onOpenSequences,
}: {
  open: boolean;
  contacts: V2Contact[];
  onClose: () => void;
  onStartCallQueue: (contacts: V2Contact[]) => void;
  onStartTextQueue: (contacts: V2Contact[]) => void;
  onOpenSequences: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const work = useMemo(() => {
    const ranked = contacts
      .filter(c => !c.doNotContact && !!c.phone)
      .map(c => ({ c, score: scoreContact(c, today) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(row => row.c);

    const call = ranked
      .filter(c =>
        c.tier === 'hot'
        || c.tier === 'warm'
        || (!!c.nextFollowupDate && c.nextFollowupDate <= today)
        || hasReferralSignal(c)
      )
      .slice(0, 25);

    return { ranked, call, text: ranked.slice(0, 25) };
  }, [contacts, today]);

  if (!open) return null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close Work My Book">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>REX · GAME PLAN</Label>
          <Text style={styles.topTitle}>Work My Book</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TODAY'S EXECUTION</Text>
          <Text style={styles.title}>Rex sorted the people worth touching.</Text>
          <Text style={styles.bodyText}>
            Due follow-ups, stalled opportunities, long-dormant customers, sold ownership touches, referrals, and lease timing rise to the top.
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onStartCallQueue(work.call)}
            disabled={work.call.length === 0}
            style={[styles.actionCard, work.call.length === 0 && styles.disabled]}
          >
            <Text style={styles.actionIcon}>📞</Text>
            <Text style={styles.actionTitle}>CALL QUEUE</Text>
            <Text style={styles.actionCount}>{work.call.length} ready</Text>
            <Text style={styles.actionHint}>call → outcome → next</Text>
          </Pressable>

          <Pressable
            onPress={() => onStartTextQueue(work.text)}
            disabled={work.text.length === 0}
            style={[styles.actionCard, work.text.length === 0 && styles.disabled]}
          >
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionTitle}>TEXT QUEUE</Text>
            <Text style={styles.actionCount}>{work.text.length} ready</Text>
            <Text style={styles.actionHint}>personalized → review → send</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>WHY THESE PEOPLE</Text>
          <Text style={styles.sectionCount}>{work.ranked.length} opportunities</Text>
        </View>

        {work.ranked.slice(0, 10).map((c, index) => (
          <View key={c.id} style={styles.personRow}>
            <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.personName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.personMeta} numberOfLines={1}>
                {reasonFor(c, today)}{c.vehicle ? ` · ${c.vehicle}` : ''}
              </Text>
            </View>
            <Text style={styles.personTier}>{c.tier.toUpperCase()}</Text>
          </View>
        ))}

        {work.ranked.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your board is clean.</Text>
            <Text style={styles.emptyBody}>No due or stale contacts with a sendable phone number are waiting right now.</Text>
          </View>
        ) : null}

        <Pressable onPress={onOpenSequences} style={styles.sequenceBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sequenceTitle}>SEQUENCES</Text>
            <Text style={styles.sequenceHint}>Manage Fresh Up, sold ownership, lease, and long-term follow-up.</Text>
          </View>
          <Text style={styles.sequenceArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 72, backgroundColor: colors.ink } as any,
  topBar: {
    paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4, backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 2 },
  body: {
    paddingHorizontal: 14, paddingTop: 14,
    paddingBottom: Platform.OS === 'web' ? ('max(34px, env(safe-area-inset-bottom))' as any) : 34,
    gap: 12,
  },
  hero: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 20, lineHeight: 25, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  bodyText: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 7 },
  actionRow: { flexDirection: 'row', gap: 9 },
  actionCard: { flex: 1, minHeight: 132, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder },
  disabled: { opacity: 0.45 },
  actionIcon: { fontSize: 22 },
  actionTitle: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, marginTop: 9 },
  actionCount: { color: colors.white, fontSize: 17, fontWeight: '800', marginTop: 4 },
  actionHint: { color: colors.grey2, fontSize: 10, lineHeight: 14, marginTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: colors.grey2, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  sectionCount: { marginLeft: 'auto', color: colors.gold, fontSize: 10, fontWeight: '700' },
  personRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  rank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  rankText: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  personName: { color: colors.white, fontSize: 13, fontWeight: '700' },
  personMeta: { color: colors.grey2, fontSize: 10, marginTop: 2 },
  personTier: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  empty: { padding: 20, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4 },
  emptyTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  emptyBody: { color: colors.grey2, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  sequenceBtn: { marginTop: 4, minHeight: 68, padding: 14, borderRadius: radius.lg, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.ink4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sequenceTitle: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  sequenceHint: { color: colors.grey2, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sequenceArrow: { color: colors.gold, fontSize: 20, fontWeight: '800' },
});
