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

export default function WeeklyDigestCard() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // On open, surface the prior-week review digest — generating it on Sunday's
  // first look and finalizing it Monday morning (handled in autoPopulate).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    autoPopulateReviewDigest().then(d => {
      if (cancelled) return;
      setDigest(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await generateReviewDigest();
      if (next) setDigest(next);
    } catch (e) {
      console.warn('digest refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return null;

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
  head: { flexDirection: 'row', alignItems: 'center' },
  refresh: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },
  week: { fontSize: 11, color: colors.grey2, marginTop: 4 },
  summary: { fontSize: 14, fontWeight: '600', color: colors.white, marginTop: 8, letterSpacing: -0.1 },
  highlights: { fontSize: 12, color: colors.grey3, marginTop: 8, lineHeight: 18 },
  empty: { fontSize: 12, color: colors.grey2, marginTop: 6, lineHeight: 17 },
});
