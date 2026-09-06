import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import type { V2Contact } from '@/lib/v2/useContacts';
import { getWorkMyBookOpportunities, type WorkMyBookOpportunity } from '@/lib/v2/workMyBook';
import { supabase } from '@/lib/supabase';
import { Label } from './atoms';

type BoardMode = 'recommended' | 'call' | 'text';

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date + 'T12:00:00').getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function hasReferralSignal(c: V2Contact): boolean {
  return c.tags.some(tag => tag.trim().toLowerCase() === 'referral');
}

function scoreContact(c: V2Contact, today: string, authoritative?: WorkMyBookOpportunity): number {
  let score = 0;
  if (authoritative?.source === 'due_sequence') score += 220;
  else if (authoritative?.source === 'referral') score += 170;
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

function reasonFor(c: V2Contact, today: string, authoritative?: WorkMyBookOpportunity): string {
  if (authoritative) return authoritative.reason;
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
  const [authoritative, setAuthoritative] = useState<WorkMyBookOpportunity[]>([]);
  const [loadingAuthoritative, setLoadingAuthoritative] = useState(false);
  const [authoritativeError, setAuthoritativeError] = useState<string | null>(null);
  const [mode, setMode] = useState<BoardMode>('recommended');
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open) return;
    setMode('recommended');
    let cancelled = false;
    setLoadingAuthoritative(true);
    setAuthoritativeError(null);

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (!cancelled) setAuthoritative([]);
          return;
        }
        const rows = await getWorkMyBookOpportunities(session.user.id, 'pocketrep');
        if (!cancelled) setAuthoritative(rows);
      } catch (e: any) {
        if (!cancelled) {
          setAuthoritative([]);
          setAuthoritativeError(e?.message ?? 'Could not refresh Rex opportunities.');
        }
      } finally {
        if (!cancelled) setLoadingAuthoritative(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [open, contacts]);

  const authoritativeByContact = useMemo(() => {
    const map = new Map<string, WorkMyBookOpportunity>();
    for (const row of authoritative) {
      if (!map.has(row.contact_id)) map.set(row.contact_id, row);
    }
    return map;
  }, [authoritative]);

  const work = useMemo(() => {
    const ranked = contacts
      .filter(c => !c.doNotContact && !!c.phone)
      .map(c => ({ c, score: scoreContact(c, today, authoritativeByContact.get(c.id)) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(row => row.c);

    const call = ranked
      .filter(c => {
        const realOpportunity = authoritativeByContact.get(c.id);
        return realOpportunity?.channel === 'call'
          || c.tier === 'hot'
          || c.tier === 'warm'
          || (!!c.nextFollowupDate && c.nextFollowupDate <= today)
          || hasReferralSignal(c);
      })
      .slice(0, 25);

    const text = ranked
      .filter(c => authoritativeByContact.get(c.id)?.channel !== 'call')
      .slice(0, 25);

    return { ranked, call, text };
  }, [contacts, today, authoritativeByContact]);

  const visible = mode === 'call' ? work.call : mode === 'text' ? work.text : work.ranked;
  const sectionLabel = mode === 'call' ? 'CALL QUEUE' : mode === 'text' ? 'TEXT QUEUE' : 'RECOMMENDED';
  const sectionHint = mode === 'call'
    ? 'Tap start and work one call at a time.'
    : mode === 'text'
      ? 'Personalized drafts. Review every send.'
      : 'Highest-value next moves across your book.';

  if (!open) return null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Work My Book"
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>REX · GAME PLAN</Label>
          <Text style={styles.topTitle}>Work My Book</Text>
        </View>
        <View style={styles.readyRow}><View style={styles.readyDot} /><Text style={styles.readyText}>READY</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TODAY'S EXECUTION</Text>
          <Text style={styles.title}>Rex sorted the people worth touching.</Text>
          <Text style={styles.bodyText}>
            Due sequence work and legitimate referral moments come from saved PocketRep history. Stalled, dormant, sold, and lease-timing opportunities fill out the rest of the board.
          </Text>
          {loadingAuthoritative ? <Text style={styles.statusText}>Refreshing real sequence and relationship signals…</Text> : null}
          {authoritativeError ? <Text style={styles.warningText}>Using your local book signals while Rex refresh is unavailable.</Text> : null}
        </View>

        <View style={styles.modeBar} accessibilityRole="tablist">
          {([
            ['recommended', 'RECOMMENDED', work.ranked.length],
            ['call', 'CALL QUEUE', work.call.length],
            ['text', 'TEXT QUEUE', work.text.length],
          ] as const).map(([value, label, count]) => {
            const active = mode === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(value)}
                style={({ pressed }) => [styles.modeTab, active && styles.modeTabActive, pressed && styles.pressed]}
              >
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{label}</Text>
                <Text style={[styles.modeCount, active && styles.modeCountActive]}>{count}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'call' ? (
          <Pressable
            onPress={() => onStartCallQueue(work.call)}
            disabled={work.call.length === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: work.call.length === 0 }}
            style={({ pressed }) => [styles.primaryAction, work.call.length === 0 && styles.disabled, pressed && work.call.length > 0 && styles.pressed]}
          >
            <View><Text style={styles.primaryKicker}>START CALL QUEUE</Text><Text style={styles.primaryCopy}>call → outcome → next</Text></View>
            <Text style={styles.primaryCount}>{work.call.length}</Text>
          </Pressable>
        ) : null}

        {mode === 'text' ? (
          <Pressable
            onPress={() => onStartTextQueue(work.text)}
            disabled={work.text.length === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: work.text.length === 0 }}
            style={({ pressed }) => [styles.primaryAction, work.text.length === 0 && styles.disabled, pressed && work.text.length > 0 && styles.pressed]}
          >
            <View><Text style={styles.primaryKicker}>START TEXT QUEUE</Text><Text style={styles.primaryCopy}>personalized → review → send</Text></View>
            <Text style={styles.primaryCount}>{work.text.length}</Text>
          </Pressable>
        ) : null}

        {mode === 'recommended' ? (
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => { setMode('call'); }}
              disabled={work.call.length === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: work.call.length === 0 }}
              style={({ pressed }) => [styles.actionCard, work.call.length === 0 && styles.disabled, pressed && work.call.length > 0 && styles.pressed]}
            >
              <Text style={styles.actionTitle}>CALL QUEUE</Text>
              <Text style={styles.actionCount}>{work.call.length} ready</Text>
              <Text style={styles.actionHint}>Priority conversations</Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode('text'); }}
              disabled={work.text.length === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: work.text.length === 0 }}
              style={({ pressed }) => [styles.actionCard, work.text.length === 0 && styles.disabled, pressed && work.text.length > 0 && styles.pressed]}
            >
              <Text style={styles.actionTitle}>TEXT QUEUE</Text>
              <Text style={styles.actionCount}>{work.text.length} ready</Text>
              <Text style={styles.actionHint}>Context-aware drafts</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>{sectionLabel}</Text>
            <Text style={styles.sectionHint}>{sectionHint}</Text>
          </View>
          <Text style={styles.sectionCount}>{visible.length}</Text>
        </View>

        {visible.slice(0, mode === 'recommended' ? 10 : 25).map((c, index) => (
          <View key={c.id} style={styles.personRow}>
            <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.personName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.personMeta} numberOfLines={1}>
                {reasonFor(c, today, authoritativeByContact.get(c.id))}{c.vehicle ? ` · ${c.vehicle}` : ''}
              </Text>
            </View>
            <Text style={styles.personTier}>{c.tier.toUpperCase()}</Text>
          </View>
        ))}

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your board is clean.</Text>
            <Text style={styles.emptyBody}>No due or stale contacts with a sendable phone number are waiting in this lane.</Text>
          </View>
        ) : null}

        <Pressable onPress={onOpenSequences} accessibilityRole="button" style={({ pressed }) => [styles.sequenceBtn, pressed && styles.pressed]}>
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
    paddingTop: Platform.OS === 'web' ? ('max(12px, env(safe-area-inset-top))' as any) : 16,
    paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4, backgroundColor: colors.ink2,
  },
  iconBtn: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: colors.gold, fontSize: 20, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '800', color: colors.white, marginTop: 2 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  readyText: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  body: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: Platform.OS === 'web' ? ('max(34px, env(safe-area-inset-bottom))' as any) : 34, gap: 12 },
  hero: { padding: 17, borderRadius: radius.xl, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 21, lineHeight: 26, fontWeight: '800', marginTop: 6, letterSpacing: -0.4 },
  bodyText: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 7 },
  statusText: { color: colors.gold, fontSize: 10, lineHeight: 15, marginTop: 8 },
  warningText: { color: colors.grey2, fontSize: 10, lineHeight: 15, marginTop: 8 },
  modeBar: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 },
  modeTab: { flex: 1, minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  modeTabActive: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorderStrong },
  modeLabel: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 0.45 },
  modeLabelActive: { color: colors.gold },
  modeCount: { color: colors.grey, fontSize: 10, fontWeight: '800', marginTop: 3 },
  modeCountActive: { color: colors.white },
  primaryAction: { minHeight: 68, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.gold2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryKicker: { color: colors.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  primaryCopy: { color: colors.ink, opacity: 0.72, fontSize: 10, fontWeight: '700', marginTop: 4 },
  primaryCount: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 9 },
  actionCard: { flex: 1, minHeight: 104, padding: 13, justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder },
  actionTitle: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  actionCount: { color: colors.white, fontSize: 17, fontWeight: '800', marginTop: 5 },
  actionHint: { color: colors.grey2, fontSize: 10, lineHeight: 14, marginTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: colors.grey2, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  sectionHint: { color: colors.grey, fontSize: 9, lineHeight: 13, marginTop: 3 },
  sectionCount: { color: colors.gold, fontSize: 14, fontWeight: '900' },
  personRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  rankText: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  personName: { color: colors.white, fontSize: 13, fontWeight: '800' },
  personMeta: { color: colors.grey2, fontSize: 10, marginTop: 2 },
  personTier: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  empty: { padding: 20, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 },
  emptyTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  emptyBody: { color: colors.grey2, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  sequenceBtn: { marginTop: 4, minHeight: 68, padding: 14, borderRadius: radius.lg, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.ink4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sequenceTitle: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  sequenceHint: { color: colors.grey2, fontSize: 10, lineHeight: 15, marginTop: 3 },
  sequenceArrow: { color: colors.gold, fontSize: 20, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});