import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import {
  autoPopulateReviewDigest,
  generateReviewDigest,
  type WeeklyDigest,
} from '@/lib/v2/weeklyDigest';

function fmtWeek(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function reviewedKey(weekStart: string): string {
  return `pocketrep:v2:weekly-digest-reviewed:${weekStart}`;
}

export default function WeeklyDigestCard() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Monday morning surfaces the prior-week review. Once the rep marks it done,
  // keep it compact for that week so the Heat Sheet remains the main screen.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    autoPopulateReviewDigest().then(d => {
      if (cancelled) return;
      setDigest(d);
      if (d && typeof window !== 'undefined' && window.localStorage) {
        setCollapsed(window.localStorage.getItem(reviewedKey(d.week_start)) === '1');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await generateReviewDigest();
      if (next) {
        setDigest(next);
        setCollapsed(false);
      }
    } catch (e) {
      console.warn('digest refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  };

  const markReviewed = () => {
    if (!digest) return;
    setCollapsed(true);
    if (typeof window !== 'undefined' && window.localStorage) {
      try { window.localStorage.setItem(reviewedKey(digest.week_start), '1'); } catch { /* ignore */ }
    }
  };

  if (loading) return null;

  if (collapsed && digest) {
    return (
      <Pressable
        onPress={() => setCollapsed(false)}
        style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Expand weekly digest"
      >
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>WEEKLY DIGEST · REVIEWED</Label>
          <Text style={styles.compactWeek}>{fmtWeek(digest.week_start)}</Text>
        </View>
        <Text style={styles.expand}>⌄</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Label color={colors.gold}>WEEKLY DIGEST</Label>
        <View style={{ flex: 1 }} />
        <Pressable onPress={refresh} disabled={refreshing} hitSlop={6}>
          {refreshing ? (
            <RadarLoader size={18} />
          ) : (
            <Text style={styles.refresh}>{digest ? '↻ Regen' : '＋ Generate'}</Text>
          )}
        </Pressable>
      </View>
      {digest ? (
        <>
          <Text style={styles.week}>{fmtWeek(digest.week_start)}</Text>
          <Text style={styles.summary}>{digest.summary}</Text>
          {digest.highlights ? (
            <Text style={styles.highlights}>{digest.highlights}</Text>
          ) : null}
          <Pressable
            onPress={markReviewed}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Mark weekly digest reviewed and minimize"
          >
            <Text style={styles.doneText}>✓ DONE — MINIMIZE</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.empty}>
          Tap Generate to roll up this week — Rex will summarize your numbers and call out one focus area.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
  },
  compact: {
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactWeek: { fontSize: 11, color: colors.grey2, marginTop: 3 },
  expand: { color: colors.gold, fontSize: 18, fontWeight: '800' },
  head: { flexDirection: 'row', alignItems: 'center' },
  refresh: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },
  week: { fontSize: 11, color: colors.grey2, marginTop: 4 },
  summary: { fontSize: 14, fontWeight: '600', color: colors.white, marginTop: 8, letterSpacing: -0.1 },
  highlights: { fontSize: 12, color: colors.grey3, marginTop: 8, lineHeight: 18 },
  empty: { fontSize: 12, color: colors.grey2, marginTop: 6, lineHeight: 17 },
  doneBtn: { marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  doneText: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pressed: { opacity: 0.75 },
});
