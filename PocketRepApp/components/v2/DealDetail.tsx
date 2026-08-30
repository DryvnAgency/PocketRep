import { useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert, Platform,
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
      // Previously logged only to console — the button just returned to
      // normal with zero feedback, as if nothing had been tapped.
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
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Close deal details">
            <Text style={styles.headerBtnText}>Close</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>LOGGED DEAL</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{deal.name}</Text>
          </View>
          <View style={[styles.headerBtn, { opacity: 0 }]}>
            <Text style={styles.headerBtnText}>Close</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.payoutCard}>
            <Label color={colors.gold}>COMMISSION</Label>
            <Text style={styles.payout}>{money(deal.amount)}</Text>
          </View>

          <View style={styles.card}>
            <Row label="Customer" value={deal.name} />
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

          {deleteError ? <Text style={styles.deleteErrorText}>{deleteError}</Text> : null}
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete deal"
            accessibilityState={{ disabled: deleting }}
            style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
          >
            <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete deal'}</Text>
          </Pressable>
          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '18%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 64, alignItems: 'center',
  },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 14 },

  payoutCard: {
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  payout: { fontSize: 30, fontWeight: '900', color: colors.gold2, letterSpacing: -1, marginTop: 4 },

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
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    gap: 12,
  },
  rowLabel: { fontSize: 13, color: colors.grey2 },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.white, flexShrink: 1, textAlign: 'right' },
  rowValueStrong: { color: colors.gold2 },

  deleteBtn: {
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: colors.redBg,
    borderWidth: 1, borderColor: colors.redBorder,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '800', color: colors.red, letterSpacing: 0.2 },
  deleteErrorText: { fontSize: 12, color: colors.red, textAlign: 'center', marginTop: -4 },
});
