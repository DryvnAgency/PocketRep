import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar } from './atoms';
import { TIERS } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import { tierFromScore } from '@/lib/v2/useContacts';

export default function ContactListPreview({
  contacts,
  filterSummary,
  matchedCount,
  onTapContact,
}: {
  contacts: V2Contact[];
  filterSummary?: string;
  matchedCount?: number;
  onTapContact?: (id: string) => void;
}) {
  const total = matchedCount ?? contacts.length;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.kicker}>FILTER · {total} MATCH{total === 1 ? '' : 'ES'}</Text>
        {filterSummary ? <Text style={styles.summary}>{filterSummary}</Text> : null}
      </View>
      <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollerContent}>
        {contacts.length === 0 ? (
          <Text style={styles.empty}>No matches.</Text>
        ) : (
          contacts.slice(0, 30).map(c => {
            const tier = TIERS[tierFromScore(c.heatScore)];
            return (
              <Pressable
                key={c.id}
                onPress={() => onTapContact?.(c.id)}
                disabled={!onTapContact}
                accessibilityRole={onTapContact ? 'button' : undefined}
                accessibilityLabel={onTapContact ? `Open ${c.name}` : undefined}
                accessibilityState={onTapContact ? { disabled: false } : { disabled: true }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && onTapContact ? styles.rowPressed : null,
                  !onTapContact ? styles.rowDisabled : null,
                ]}
              >
                <Avatar name={c.name} size={34} />
                <View style={styles.rowCopy}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {c.vehicle ?? '—'}{c.days != null ? ` · ${c.days}d silent` : ''}
                  </Text>
                </View>
                <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
              </Pressable>
            );
          })
        )}
        {contacts.length > 30 ? (
          <Text style={styles.more}>+{contacts.length - 30} more</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    overflow: 'hidden',
    maxHeight: 280,
  },
  head: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.ink2,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  kicker: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1.1 },
  summary: { fontSize: 12, color: colors.white, marginTop: 4, lineHeight: 17 },

  scroller: { maxHeight: 232 },
  scrollerContent: { paddingVertical: 6 },

  row: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink3,
  },
  rowPressed: { backgroundColor: colors.goldBg, opacity: 0.9 },
  rowDisabled: { opacity: 0.82 },
  rowCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: colors.white },
  sub: { fontSize: 11, color: colors.grey2, marginTop: 2, lineHeight: 15 },
  tierDot: { width: 9, height: 9, borderRadius: 5 },
  empty: { padding: 18, color: colors.grey2, textAlign: 'center', fontSize: 13 },
  more: { fontSize: 11, color: colors.grey2, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 10 },
});
