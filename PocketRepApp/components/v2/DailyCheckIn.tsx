import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { V2Contact } from '@/lib/v2/useContacts';

type Counts = { yesterday: number; today: number };

function localDayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startedStorageKey(): string {
  return `pocketrep:v2:daily-started:${localDayOffset(0)}`;
}

function collapsedStorageKey(): string {
  return `pocketrep:v2:daily-checkin-collapsed:${localDayOffset(0)}`;
}

export default function DailyCheckIn({ contacts, onStartList }: {
  contacts: V2Contact[];
  /** Called when "START TODAY'S LIST" is tapped — parent filters to hot leads. */
  onStartList?: () => void;
}) {
  const [counts, setCounts] = useState<Counts>({ yesterday: 0, today: 0 });
  const [started, setStarted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const priorityCount = useMemo(
    () => contacts.filter(c => !c.doNotContact && !c.isPastCustomer && (c.tier === 'hot' || c.tier === 'warm')).length,
    [contacts],
  );

  const overdueCount = useMemo(
    () => contacts.filter(c => !c.doNotContact && c.days >= 4).length,
    [contacts],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const wasStarted = window.localStorage.getItem(startedStorageKey()) === '1';
      setStarted(wasStarted);
      setCollapsed(window.localStorage.getItem(collapsedStorageKey()) === '1' || wasStarted);
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const startToday = new Date();
        startToday.setHours(0, 0, 0, 0);
        const startYesterday = new Date(startToday);
        startYesterday.setDate(startYesterday.getDate() - 1);
        const { data } = await supabase
          .from('interactions')
          .select('interaction_date')
          .eq('user_id', user.id)
          .gte('interaction_date', startYesterday.toISOString())
          .lt('interaction_date', new Date(startToday.getTime() + 86_400_000).toISOString());
        if (cancelled) return;
        const rows = (data ?? []) as { interaction_date: string }[];
        const todayMs = startToday.getTime();
        const yesterday = rows.filter(r => new Date(r.interaction_date).getTime() < todayMs).length;
        const today = rows.length - yesterday;
        setCounts({ yesterday, today });
      } catch {
        // Activity is a coaching enhancement; the Heat Sheet remains usable if it fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistCollapsed = (next: boolean) => {
    setCollapsed(next);
    if (typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.setItem(collapsedStorageKey(), next ? '1' : '0'); } catch { /* ignore */ }
    }
  };

  const markStarted = () => {
    setStarted(true);
    persistCollapsed(true);
    if (typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.setItem(startedStorageKey(), '1'); } catch { /* ignore */ }
    }
  };

  const greeting = counts.yesterday > 0
    ? `Yesterday you logged ${counts.yesterday} interaction${counts.yesterday === 1 ? '' : 's'}. Let's build on it.`
    : "Fresh day. Let's get your first customer conversation started.";

  if (collapsed) {
    return (
      <Pressable
        onPress={() => persistCollapsed(false)}
        style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Expand Rex daily check-in"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>REX · DAILY CHECK-IN</Text>
          <Text style={styles.compactText}>
            {started ? 'Today’s list started' : `${priorityCount} to work`}
            {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </Text>
        </View>
        <Text style={styles.expand}>⌄</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>REX · DAILY CHECK-IN</Text>
          <Text style={styles.title}>{greeting}</Text>
        </View>
        <Pressable
          onPress={() => persistCollapsed(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Minimize Rex daily check-in"
          style={styles.minimize}
        >
          <Text style={styles.minimizeText}>—</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.value}>{loading ? '—' : counts.yesterday}</Text><Text style={styles.label}>YESTERDAY</Text></View>
        <View style={styles.stat}><Text style={styles.value}>{loading ? '—' : counts.today}</Text><Text style={styles.label}>TODAY</Text></View>
        <View style={styles.stat}><Text style={styles.value}>{priorityCount}</Text><Text style={styles.label}>TO WORK</Text></View>
        <View style={styles.stat}>
          <Text style={[styles.value, overdueCount > 0 && styles.overdueValue]}>{overdueCount}</Text>
          <Text style={styles.label}>OVERDUE</Text>
        </View>
      </View>

      <Text style={styles.sub}>
        {overdueCount > 0
          ? `${overdueCount} follow-up${overdueCount === 1 ? '' : 's'} overdue. Start with your hottest people.`
          : 'Your Heat Sheet is your daily list. Work it, log it, and Rex will keep the next move in front of you.'}
      </Text>

      <Pressable onPress={() => { markStarted(); onStartList?.(); }} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
        <Text style={styles.ctaText}>{started ? "✓ TODAY’S LIST STARTED" : "START TODAY’S LIST →"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: 10, padding: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg },
  compact: { marginHorizontal: 14, marginTop: 10, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactText: { color: colors.white, fontSize: 12, fontWeight: '700', marginTop: 3 },
  expand: { color: colors.gold, fontSize: 18, fontWeight: '800' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 15, lineHeight: 21, fontWeight: '700', marginTop: 5, maxWidth: 420 },
  minimize: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.goldBg, alignItems: 'center', justifyContent: 'center' },
  minimizeText: { color: colors.gold, fontSize: 18, fontWeight: '800', lineHeight: 18 },
  stats: { flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.ink4, paddingVertical: 11 },
  stat: { flex: 1, alignItems: 'center' },
  value: { color: colors.gold, fontSize: 21, fontWeight: '800' },
  label: { color: colors.grey, fontSize: 8, fontWeight: '800', letterSpacing: .8, marginTop: 2 },
  sub: { color: colors.grey2, fontSize: 11, lineHeight: 16, marginTop: 12 },
  cta: { marginTop: 13, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  ctaText: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: .6 },
  pressed: { opacity: .75, transform: [{ scale: .98 }] },
  overdueValue: { color: colors.red },
});
