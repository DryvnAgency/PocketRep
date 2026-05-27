import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import { countNurtureBanners } from '@/lib/v2/nurtureEngine';

export default function NurtureBanner({
  refetchKey = 0,
  onOpenReviewer,
}: {
  refetchKey?: number;
  onOpenReviewer: () => void;
}) {
  const [counts, setCounts] = useState<{ pending_drafts: number; awaiting_reply_mark: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    countNurtureBanners().then(c => {
      if (!cancelled) setCounts(c);
    });
    return () => { cancelled = true; };
  }, [refetchKey]);

  if (!counts) return null;
  const total = counts.pending_drafts + counts.awaiting_reply_mark;
  if (total === 0) return null;

  return (
    <Pressable onPress={onOpenReviewer} style={styles.banner}>
      <View style={styles.dot}><Text style={styles.dotText}>{counts.pending_drafts || counts.awaiting_reply_mark}</Text></View>
      <View style={{ flex: 1 }}>
        <Label color={colors.gold}>NURTURE</Label>
        <Text style={styles.body}>
          {counts.pending_drafts > 0
            ? `${counts.pending_drafts} draft${counts.pending_drafts === 1 ? '' : 's'} pending`
            : `${counts.awaiting_reply_mark} sent · mark replies`}
          {counts.pending_drafts > 0 && counts.awaiting_reply_mark > 0
            ? ` · ${counts.awaiting_reply_mark} awaiting reply status`
            : ''}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  dotText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  body: { fontSize: 13, color: colors.white, marginTop: 2 },
  chev: { fontSize: 18, color: colors.gold, fontWeight: '700' },
});
