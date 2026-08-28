import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import {
  insertDeal,
  type DealDraft,
} from '@/lib/v2/dealLogger';
import { usePayPlan, calcCommissionWithPlan, DEFAULT_PAY_PLAN } from '@/lib/v2/payPlan';
import { formatMoney } from '@/lib/v2/format';

const today = () => new Date().toISOString().slice(0, 10);

const blank = (): DealDraft => ({
  name: '', stock: '', vehicle: '',
  date: today(),
  type: 'NEW', funding: 'finance',
  frontGross: 0, backGross: 0,
  split: false, splitWith: '',
  contactId: null,
});

export type DealLoggerPrefill = {
  name?: string;
  vehicle?: string | null;
  contactId?: string | null;
};

export default function DealLogger({
  open, onClose, onSaved, prefill,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  prefill?: DealLoggerPrefill;
}) {
  const [d, setD] = useState<DealDraft>(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `saving` state updates asynchronously, so a same-tick double-tap on Save
  // could pass the `!canSave || saving` guard twice and insert two deals —
  // AddContactModal.tsx's savingRef fixes the identical race there.
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (prefill) {
      setD({
        ...blank(),
        name: prefill.name ?? '',
        vehicle: prefill.vehicle ?? '',
        contactId: prefill.contactId ?? null,
      });
    } else {
      setD(blank());
    }
  }, [open, prefill]);

  // Hooks must run unconditionally on every render — keep usePayPlan ABOVE the
  // early return below, or the hook count changes when `open` flips (React #310).
  const planFromHook = usePayPlan();
  const plan = planFromHook ?? DEFAULT_PAY_PLAN;

  if (!open) return null;

  const set = <K extends keyof DealDraft>(k: K, v: DealDraft[K]) =>
    setD(s => ({ ...s, [k]: v }));

  const setNum = (k: 'frontGross' | 'backGross', text: string) => {
    const n = text === '' ? 0 : Number(text.replace(/[^0-9]/g, ''));
    set(k, Number.isFinite(n) ? n : 0);
  };

  const totalGross = d.frontGross + d.backGross;
  const commission = calcCommissionWithPlan(d, plan);
  const canSave = !!d.name.trim() && !!d.stock.trim() && !!d.vehicle.trim() && totalGross > 0;

  const handleSave = async () => {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await insertDeal({
        ...d,
        name: d.name.trim(),
        stock: d.stock.trim().toUpperCase(),
        vehicle: d.vehicle.trim(),
        splitWith: d.splitWith.trim(),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const Seg = ({
    value, current, onPick, label,
  }: {
    value: string;
    current: string;
    onPick: () => void;
    label: string;
  }) => {
    const active = value === current;
    return (
      <Pressable
        onPress={onPick}
        style={[
          styles.segBtn,
          active
            ? { backgroundColor: colors.goldBg, borderColor: colors.gold }
            : { backgroundColor: 'transparent', borderColor: colors.ink4 },
        ]}
      >
        <Text style={[
          styles.segText,
          { color: active ? colors.gold : colors.grey2 },
        ]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>NEW DEAL</Text>
            <Text style={styles.headerTitle}>Log delivery</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave || saving}
            style={[styles.headerBtn, canSave ? styles.headerBtnPrimary : styles.headerBtnDisabled]}
          >
            <Text style={[styles.headerBtnText, canSave ? { color: colors.ink } : { color: colors.grey }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Field label="CUSTOMER">
            <TextInput
              value={d.name}
              onChangeText={t => set('name', t)}
              placeholder="Full name"
              placeholderTextColor={colors.grey}
              style={styles.input}
            />
          </Field>

          <View style={styles.row}>
            <Field label="STOCK #" style={{ flex: 1 }}>
              <TextInput
                value={d.stock}
                onChangeText={t => set('stock', t.toUpperCase())}
                placeholder="P8421"
                placeholderTextColor={colors.grey}
                autoCapitalize="characters"
                style={[styles.input, { fontFamily: 'Menlo', letterSpacing: 0.5 }]}
              />
            </Field>
            <Field label="DELIVERY DATE" style={{ flex: 1 }}>
              <TextInput
                value={d.date}
                onChangeText={t => set('date', t)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.grey}
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="VEHICLE">
            <TextInput
              value={d.vehicle}
              onChangeText={t => set('vehicle', t)}
              placeholder="'26 M3 Competition · Brooklyn Grey"
              placeholderTextColor={colors.grey}
              style={styles.input}
            />
          </Field>

          <Field label="INVENTORY">
            <View style={styles.segRow}>
              <Seg value="NEW" current={d.type} onPick={() => set('type', 'NEW')} label="New" />
              <Seg value="CPO" current={d.type} onPick={() => set('type', 'CPO')} label="CPO" />
              <Seg value="USED" current={d.type} onPick={() => set('type', 'USED')} label="Used" />
            </View>
          </Field>

          <Field label="FUNDING">
            <View style={styles.segRow}>
              <Seg value="finance" current={d.funding} onPick={() => set('funding', 'finance')} label="Finance" />
              <Seg value="lease" current={d.funding} onPick={() => set('funding', 'lease')} label="Lease" />
              <Seg value="cash" current={d.funding} onPick={() => set('funding', 'cash')} label="Cash" />
            </View>
          </Field>

          <Field label="SPLIT DEAL?">
            <Pressable
              onPress={() => set('split', !d.split)}
              style={[
                styles.splitToggle,
                d.split
                  ? { backgroundColor: colors.goldBg, borderColor: colors.gold }
                  : { backgroundColor: colors.surface2, borderColor: colors.ink4 },
              ]}
            >
              <View
                style={[
                  styles.splitIcon,
                  { backgroundColor: d.split ? colors.gold : colors.ink3 },
                ]}
              >
                <Text style={{ fontSize: 16, color: d.split ? colors.ink : colors.gold, fontWeight: '800' }}>⤯</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.splitTitle, { color: d.split ? colors.gold : colors.white }]}>
                  {d.split ? 'Split with another rep' : 'Full deal'}
                </Text>
                <Text style={styles.splitSub}>
                  {d.split ? 'Counts as ½ unit · commission halved' : 'Counts as 1 unit'}
                </Text>
              </View>
              {d.split ? (
                <Text style={styles.splitBadge}>½</Text>
              ) : null}
            </Pressable>
            {d.split ? (
              <View style={styles.splitWith}>
                <Text style={styles.splitWithLabel}>WITH</Text>
                <TextInput
                  value={d.splitWith}
                  onChangeText={t => set('splitWith', t)}
                  placeholder="Co-rep name"
                  placeholderTextColor={colors.grey}
                  style={styles.splitWithInput}
                />
              </View>
            ) : null}
          </Field>

          <View style={styles.row}>
            <Field label="FRONT GROSS" style={{ flex: 1 }}>
              <View style={styles.moneyWrap}>
                <Text style={styles.moneyPrefix}>$</Text>
                <TextInput
                  value={d.frontGross ? String(d.frontGross) : ''}
                  onChangeText={t => setNum('frontGross', t)}
                  placeholder="0"
                  placeholderTextColor={colors.grey}
                  keyboardType="numeric"
                  style={[styles.input, { paddingLeft: 26 }]}
                />
              </View>
            </Field>
            <Field label="BACK GROSS" style={{ flex: 1 }}>
              <View style={styles.moneyWrap}>
                <Text style={styles.moneyPrefix}>$</Text>
                <TextInput
                  value={d.backGross ? String(d.backGross) : ''}
                  onChangeText={t => setNum('backGross', t)}
                  placeholder="0"
                  placeholderTextColor={colors.grey}
                  keyboardType="numeric"
                  style={[styles.input, { paddingLeft: 26 }]}
                />
              </View>
            </Field>
          </View>

          <View style={styles.payout}>
            <View style={styles.payoutHead}>
              <Label color={colors.gold}>YOUR PAYOUT</Label>
              <View style={{ flex: 1 }} />
              <Text style={styles.payoutFormula}>
                {plan.frontPct}% front · {plan.backPct}% back · +${plan.manuBonus + plan.csiBonus}/unit
                {d.split ? ' · ×0.5 split' : ''}
              </Text>
            </View>
            <View style={styles.payoutRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutLabel}>Total gross</Text>
                <Text style={styles.payoutGross}>{formatMoney(totalGross)}</Text>
              </View>
              <View style={styles.payoutDivider} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.payoutCommissionLabel}>COMMISSION</Text>
                <Text style={styles.payoutCommission}>{formatMoney(commission)}</Text>
              </View>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ height: 28 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label, children, style,
}: {
  label: string;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits above ContactDetail (zIndex 80) so "Log Deal" opened from the contact
  // card paints on top instead of behind it. An explicit zIndex beats a sibling
  // with `auto`, regardless of mount order.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, elevation: 100 } as any,
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '8%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4 },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: {
    fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4,
  },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 16 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },

  row: { flexDirection: 'row', gap: 12 },

  segRow: { flexDirection: 'row', gap: 6 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  segText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  splitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  splitIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  splitTitle: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  splitSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  splitBadge: { fontSize: 22, fontWeight: '900', color: colors.gold, letterSpacing: -1 },

  splitWith: {
    marginTop: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  splitWithLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8 },
  splitWithInput: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    paddingVertical: 12,
    fontWeight: '600',
  },

  moneyWrap: { position: 'relative' },
  moneyPrefix: {
    position: 'absolute',
    left: 14,
    top: 12,
    color: colors.grey2,
    fontSize: 14,
    fontWeight: '600',
  },

  payout: {
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  payoutHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  payoutFormula: { fontSize: 9, color: colors.gold, opacity: 0.7 },
  payoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  payoutLabel: { fontSize: 11, color: colors.grey2 },
  payoutGross: { fontSize: 18, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.4 },
  payoutDivider: { width: 1, height: 32, backgroundColor: colors.goldBorder },
  payoutCommissionLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },
  payoutCommission: { fontSize: 28, fontWeight: '900', color: colors.gold2, marginTop: 2, letterSpacing: -0.8 },

  error: { color: colors.red, fontSize: 13 },
});
