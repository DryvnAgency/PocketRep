import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label, Pill } from './atoms';
import { useRexActionLog, type RexActionLogRow } from '@/lib/v2/useRexActionLog';
import type { V2Contact } from '@/lib/v2/useContacts';

// Friendly labels for the action types Rex logs (rex_action_log.action_type).
// Unknown types fall back to a humanized version of the raw key.
const ACTION_LABELS: Record<string, string> = {
  add_contact: 'Added contact',
  update_notes: 'Updated notes',
  delete_contact: 'Deleted contact',
  log_deal: 'Logged a deal',
  schedule_followup: 'Scheduled follow-up',
  retier_contact: 'Re-tiered contact',
  create_reminder: 'Created reminder',
  batch_action: 'Batch action',
  create_blast_sequence: 'Created blast sequence',
  schedule_nurture_blast: 'Scheduled nurture blast',
};

function actionLabel(t: string): string {
  return ACTION_LABELS[t] ?? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

const RESULT_META: Record<string, { label: string; color: string }> = {
  success: { label: 'DONE', color: colors.green },
  cancelled: { label: 'CANCELLED', color: colors.grey2 },
  partial: { label: 'PARTIAL', color: colors.gold },
  failed: { label: 'FAILED', color: colors.red },
};

function resultMeta(r: string | null): { label: string; color: string } {
  if (!r) return { label: 'PENDING', color: colors.grey2 };
  return RESULT_META[r] ?? { label: r.toUpperCase(), color: colors.grey2 };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const m = Math.floor((Date.now() - then) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityRow({ row, nameById }: { row: RexActionLogRow; nameById: Map<string, string> }) {
  const meta = resultMeta(row.result);
  const ids = row.contact_ids ?? [];
  const names = ids.map(id => nameById.get(id)).filter((n): n is string => !!n);
  const subtitle = names.length
    ? (names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`)
    : (ids.length > 0 ? `${ids.length} contact${ids.length === 1 ? '' : 's'}` : null);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardName}>{actionLabel(row.action_type)}</Text>
          {subtitle ? <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <Pill color={meta.color}>{meta.label}</Pill>
      </View>
      <Text style={styles.time}>{relativeTime(row.created_at)}</Text>
    </View>
  );
}

export default function RexActivityViewer({
  open, contacts, onClose,
}: {
  open: boolean;
  contacts: V2Contact[];
  onClose: () => void;
}) {
  const { logs, error } = useRexActionLog(open ? 1 : 0);
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) m.set(c.id, c.name);
    return m;
  }, [contacts]);

  if (!open) return null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>REX ACTIVITY</Label>
          <Text style={styles.topTitle}>What Rex did, and when</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {error ? (
          <Text style={styles.error}>Couldn't load: {error}</Text>
        ) : !logs ? (
          <View style={styles.center}>
            <RadarLoader size={32} />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Rex activity yet</Text>
            <Text style={styles.emptyHint}>When you ask Rex to log a deal, add a contact, or set a follow-up, it shows up here.</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.intro}>
              A log of every action Rex took on your book — most recent first.
            </Text>
            {logs.map(row => (
              <ActivityRow key={row.id} row={row} nameById={nameById} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 70,
  } as any,
  topBar: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: -0.2, marginTop: 2 },

  body: { paddingBottom: 30 },
  center: { padding: 40, alignItems: 'center' },
  error: { color: colors.red, padding: 16, fontSize: 13 },
  empty: {
    marginHorizontal: 14,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  emptyHint: { fontSize: 12, color: colors.grey2, marginTop: 6, textAlign: 'center', lineHeight: 17 },
  intro: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    fontSize: 12, color: colors.grey2, lineHeight: 17,
  },

  card: {
    marginHorizontal: 14, marginVertical: 6,
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  cardSub: { fontSize: 12, color: colors.grey2, marginTop: 3 },
  time: { fontSize: 11, color: colors.grey, marginTop: 8 },
});
