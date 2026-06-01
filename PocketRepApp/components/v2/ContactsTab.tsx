import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';
import { Avatar, rgbaTint } from './atoms';
import { TIERS, type TierKey } from './tokens';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { V2Tag } from '@/lib/v2/useTags';

type FilterTag =
  | null
  | { kind: 'tier'; tier: TierKey; name: string; color: string; icon: string }
  | { kind: 'custom'; name: string; color: string };

const TIER_CHIPS: Extract<FilterTag, { kind: 'tier' }>[] = [
  { kind: 'tier', tier: 'hot',   name: 'Hot',   color: colors.red,    icon: '🔥' },
  { kind: 'tier', tier: 'warm',  name: 'Warm',  color: colors.orange, icon: '☀️' },
  { kind: 'tier', tier: 'watch', name: 'Watch', color: colors.grey2,  icon: '👁' },
];

function ContactRow({
  c, onTap, allTags,
}: { c: V2Contact; onTap: () => void; allTags: V2Tag[] }) {
  const tierColor = TIERS[c.tier].color;
  const tagColor = (n: string) => allTags.find(t => t.name === n)?.color ?? colors.gold;
  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.goldBg }]}
    >
      <Avatar name={c.name} size={40} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
        <Text style={styles.vehicle} numberOfLines={1}>{c.vehicle ?? '—'}</Text>
        {c.tags.length > 0 && (
          <View style={styles.tagRow}>
            {c.tags.slice(0, 3).map(t => {
              const col = tagColor(t);
              return (
                <View
                  key={t}
                  style={[
                    styles.tagPill,
                    { backgroundColor: rgbaTint(col, 0.12), borderColor: rgbaTint(col, 0.3) },
                  ]}
                >
                  <Text style={[styles.tagText, { color: col }]}>{t}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <View style={[styles.tierDot, { backgroundColor: tierColor }]} />
    </Pressable>
  );
}

function Chip({
  label, icon, color, active, onPress, dashed,
}: {
  label: string;
  icon?: string;
  color: string;
  active: boolean;
  onPress: () => void;
  dashed?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        dashed
          ? { borderStyle: 'dashed', borderColor: colors.goldBorder, backgroundColor: 'transparent' }
          : active
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: colors.surface2, borderColor: colors.ink4 },
      ]}
    >
      {icon ? <Text style={styles.chipIcon}>{icon}</Text> : !dashed ? (
        <View style={[styles.chipDot, { backgroundColor: active ? colors.white : color }]} />
      ) : null}
      <Text
        style={[
          styles.chipText,
          { color: dashed ? colors.gold : active ? (color === colors.gold ? colors.ink : colors.white) : colors.grey3 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ContactsTab({
  contacts,
  error,
  tags,
  onSelect,
  onBulkTag,
  onAddContact,
  onDeleteTag,
}: {
  contacts: V2Contact[] | null;
  error: string | null;
  tags: V2Tag[];
  onSelect: (c: V2Contact) => void;
  onBulkTag?: () => void;
  onAddContact?: () => void;
  onDeleteTag?: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTag>(null);

  const confirmDeleteTag = (name: string) => {
    const proceed = () => { onDeleteTag?.(name); setFilter(null); };
    const msg = `Delete the "${name}" tag? It'll be removed from all contacts.`;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(msg)) proceed();
    } else {
      Alert.alert('Delete tag', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: proceed },
      ]);
    }
  };

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = query.trim().toLowerCase();
    return contacts.filter(c => {
      const matchesQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.vehicle ?? '').toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q));
      const matchesF =
        !filter
          ? true
          : filter.kind === 'tier'
          ? c.tier === filter.tier
          : c.tags.includes(filter.name);
      return matchesQ && matchesF;
    });
  }, [contacts, query, filter]);

  const groups = useMemo(() => {
    const out: Record<string, V2Contact[]> = {};
    for (const c of filtered) {
      const k = (c.name[0] ?? '?').toUpperCase();
      (out[k] ||= []).push(c);
    }
    return out;
  }, [filtered]);

  const letters = useMemo(() => Object.keys(groups).sort(), [groups]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load contacts: {error}</Text>
      </View>
    );
  }
  if (!contacts) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${contacts.length} contacts`}
            placeholderTextColor={colors.grey}
            style={styles.searchInput}
            accessibilityLabel="Search contacts"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onAddContact} style={styles.addBtn} hitSlop={6}>
          <Text style={styles.addBtnText}>＋</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <Chip
          label="All"
          color={colors.gold}
          active={filter === null}
          onPress={() => setFilter(null)}
        />
        {TIER_CHIPS.map(chip => (
          <Chip
            key={chip.tier}
            label={chip.name}
            icon={chip.icon}
            color={chip.color}
            active={filter?.kind === 'tier' && filter.tier === chip.tier}
            onPress={() => setFilter(chip)}
          />
        ))}
        {tags.map(t => (
          <Chip
            key={t.id}
            label={t.name}
            color={t.color}
            active={filter?.kind === 'custom' && filter.name === t.name}
            onPress={() => setFilter({ kind: 'custom', name: t.name, color: t.color })}
          />
        ))}
        <Chip
          label="＋ Tag"
          color={colors.gold}
          active={false}
          onPress={() => onBulkTag?.()}
          dashed
        />
      </ScrollView>

      {filter ? (
        <View style={styles.filterHint}>
          <Text style={styles.filterLabel}>FILTER</Text>
          <Text style={styles.filterValue}>
            {filter.kind === 'tier' ? `${filter.icon} ${filter.name}` : filter.name}
          </Text>
          <Text style={styles.filterCount}>
            · {filtered.length} contact{filtered.length === 1 ? '' : 's'}
          </Text>
          <View style={{ flex: 1 }} />
          {filter.kind === 'custom' && onDeleteTag ? (
            <Pressable onPress={() => confirmDeleteTag(filter.name)} hitSlop={8}>
              <Text style={styles.filterDelete}>DELETE TAG</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setFilter(null)} hitSlop={8}>
            <Text style={styles.filterClear}>CLEAR</Text>
          </Pressable>
        </View>
      ) : null}

      {letters.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No matches</Text>
        </View>
      ) : (
        letters.map(L => (
          <View key={L}>
            <Text style={styles.letterHead}>{L}</Text>
            <View style={styles.group}>
              {groups[L].map((c, i) => (
                <View key={c.id} style={[i > 0 && styles.rowDivider]}>
                  <ContactRow c={c} onTap={() => onSelect(c)} allTags={tags} />
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.xl },
  center: { padding: spacing.xl, alignItems: 'center' },
  error: { color: colors.red, fontSize: 13 },

  searchWrap: {
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 24 },
  searchIcon: { color: colors.grey, fontSize: 14 },
  searchInput: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    paddingVertical: 10,
  },
  searchClear: { color: colors.gold, fontSize: 14 },

  chipsRow: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipIcon: { fontSize: 11 },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  filterHint: {
    marginHorizontal: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.0,
    color: colors.gold, textTransform: 'uppercase',
  },
  filterValue: {
    fontSize: 12, fontWeight: '600', color: colors.white, letterSpacing: -0.1,
  },
  filterCount: { fontSize: 11, color: colors.grey2 },
  filterClear: {
    fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.3,
  },
  filterDelete: {
    fontSize: 11, fontWeight: '700', color: colors.red, letterSpacing: 0.3, marginRight: 12,
  },

  empty: {
    marginHorizontal: 14,
    marginTop: 16,
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  emptyText: { color: colors.grey2, fontSize: 14 },

  letterHead: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: 1.2,
  },
  group: {
    marginHorizontal: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.ink3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  vehicle: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
});
