import { useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import type { V2DealRich } from '@/lib/v2/useUserDeals';
import { deleteDeal } from '@/lib/v2/dealLogger';
import { formatMoney } from '@/lib/v2/format';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const TYPE_LABEL: Record<string, string> = { NEW: 'New', CPO: 'Certified Pre-Owned', USED: 'Used' };
const FUNDING_LABEL: Record<string, string> = { finance: 'Finance', lease: 'Lease', cash: 'Cash' };

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[+m[2] - 1] ?? '?'} ${+m[3]}, ${m[1]}`;
}

function money(n: number | null | undefined): string {
  return n == null ? '—' : formatMoney(n);
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export default function DealDetail({
  deal,
  onClose,
  onDeleted,
}: {
  deal: V2DealRich | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  if (!deal) return null;

  const doDelete = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDeal(deal.id);
      onDeleted();
      onClose();
    } catch (e: any) {
      console.warn('deleteDeal failed', e);
      setDeleteError(e?.message ?? "Couldn't delete — try again");
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    const msg = `Delete the ${deal.name} deal? This can't be undone.`;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(msg)) doDelete();
    } else {
      Alert.alert('Delete deal', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={({ pressed }) => [styles.scrim, pressed && styles.scrimPressed]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close deal details" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            disabled={deleting}
            style={({ pressed }) => [styles.headerBtn, pressed && !deleting && styles.pressed, deleting && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Close deal details"
            accessibilityState={{ disabled: deleting }}
          >
            <Text style={styles.headerBtnText}>Close</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.loggedRow}>
              <View style={styles.readyDot} />
              <Text style={styles.headerKicker}>SALE LOGGED</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>{deal.name}</Text>
          </View>
          <View style={[styles.headerBtn, styles.headerGhost]}>
            <Text style={styles.headerBtnText}>Close</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.body,
            Platform.OS === 'web' ? ({ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' } as any) : null,
          ]}
        >
          <View style={styles.payoutCard}>
            <View style={styles.payoutTopRow}>
              <Label color={colors.gold}>COMMISSION</Label>
              <Text style={styles.payoutMeta}>RECORDED</Text>
            </View>
            <Text style={styles.payout}>{money(deal.amount)}</Text>
            <Text style={styles.payoutHint}>Your logged payout for this delivery</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionKicker}>DEAL SNAPSHOT</Text>
            <Text style={styles.sectionMeta}>{deal.dealType ? (TYPE_LABEL[deal.dealType] ?? deal.dealType) : 'Deal'}</Text>
          </View>

          <View style={styles.card}>
            <Row label="Customer" value={deal.name} strong />
            <Row label="Vehicle" value={deal.vehicle ?? '—'} />
            <Row label="Stock #" value={deal.stock ?? '—'} />
            <Row label="Delivered" value={fmtDate(deal.closedAt)} />
            <Row label="Type" value={deal.dealType ? (TYPE_LABEL[deal.dealType] ?? deal.dealType) : '—'} />
            <Row label="Funding" value={deal.funding ? (FUNDING_LABEL[deal.funding] ?? deal.funding) : '—'} />
            <Row label="Front gross" value={money(deal.frontGross)} />
            <Row label="Back gross" value={money(deal.backGross)} />
            {deal.split ? (
              <Row label="Split" value={deal.splitWith ? `Yes · with ${deal.splitWith}` : 'Yes'} />
            ) : null}
          </View>

          <View style={styles.historyNote}>
            <Text style={styles.historyNoteTitle}>SALES LOG</Text>
            <Text style={styles.historyNoteText}>This view reflects the deal already recorded in PocketRep. Deleting removes this deal entry; it does not rewrite customer communication history.</Text>
          </View>

          {deleteError ? <Text style={styles.deleteErrorText}>{deleteError}</Text> : null}
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete deal"
            accessibilityState={{ disabled: deleting, busy: deleting }}
            style={({ pressed }) => [styles.deleteBtn, pressed && !deleting && styles.deletePressed, deleting && styles.disabled]}
          >
            {deleting ? <ActivityIndicator size="small" color={colors.red} /> : null}
            <Text style={styles.deleteText}>{deleting ? 'Deleting deal…' : 'Delete deal'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.76)' },
  scrimPressed: { backgroundColor: 'rgba(5,5,8,0.8)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '14%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  } as any,
  handle: {
    alignSelf: 'center',
    width: 42, height: 4, borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#45D483' },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  headerGhost: { opacity: 0, pointerEvents: 'none' } as any,
  headerBtnText: { fontSize: 12, fontWeight: '800', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: colors.white, marginTop: 3, letterSpacing: -0.25 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, gap: 14 },

  payoutCard: {
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 18, paddingVertical: 18,
  },
  payoutTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  payoutMeta: { fontSize: 9, fontWeight: '800', color: colors.grey2, letterSpacing: 1.1 },
  payout: { fontSize: 32, fontWeight: '900', color: colors.gold2, letterSpacing: -1.1, marginTop: 5 },
  payoutHint: { fontSize: 11, color: colors.grey2, marginTop: 4 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 2 },
  sectionKicker: { fontSize: 10, fontWeight: '800', color: colors.grey2, letterSpacing: 1.35 },
  sectionMeta: { fontSize: 11, fontWeight: '700', color: colors.gold },
  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    gap: 12,
  },
  rowLabel: { fontSize: 13, color: colors.grey2 },
  rowValue: { fontSize: 14, fontWeight: '650' as any, color: colors.white, flexShrink: 1, textAlign: 'right' },
  rowValueStrong: { color: colors.gold2, fontWeight: '800' },

  historyNote: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  historyNoteTitle: { fontSize: 9, fontWeight: '800', color: colors.grey2, letterSpacing: 1.2 },
  historyNoteText: { fontSize: 11, lineHeight: 16, color: colors.grey2, marginTop: 5 },

  deleteBtn: {
    minHeight: 48,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: colors.redBg,
    borderWidth: 1, borderColor: colors.redBorder,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  deletePressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  deleteText: { fontSize: 14, fontWeight: '800', color: colors.red, letterSpacing: 0.2 },
  deleteErrorText: { fontSize: 12, color: colors.red, textAlign: 'center', marginTop: -4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.48 },
});
