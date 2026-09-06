import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { SectionHead } from './atoms';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';
import {
  type PayPlan, type UnitBonusTier,
  DEFAULT_PAY_PLAN, savePayPlan,
} from '@/lib/v2/payPlan';

function PPField({
  label, sub, children,
}: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {sub ? <Text style={styles.fieldSub}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function NumberInput({
  value, onChange, prefix, suffix, big,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  big?: boolean;
}) {
  return (
    <View style={styles.numWrap}>
      {prefix ? <Text style={[styles.prefix, big && { fontSize: 18 }]}>{prefix}</Text> : null}
      <TextInput
        value={value ? String(value) : ''}
        onChangeText={(t) => {
          const n = Number(t.replace(/[^0-9.]/g, ''));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        keyboardType="numeric"
        style={[
          styles.num,
          { paddingLeft: prefix ? 26 : 14, paddingRight: suffix ? 36 : 14, fontSize: big ? 18 : 16 },
        ]}
      />
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
  );
}

export default function PayPlanEditor({
  open, plan, onClose, onSaved,
}: {
  open: boolean;
  plan: PayPlan | null;
  onClose: () => void;
  onSaved: (next: PayPlan) => void;
}) {
  const [draft, setDraft] = useState<PayPlan>(plan ?? DEFAULT_PAY_PLAN);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboardInset = useWebVisualViewportInset(open);

  useEffect(() => {
    if (open) {
      setDraft(plan ?? DEFAULT_PAY_PLAN);
      setSaving(false);
      setError(null);
    }
  }, [open, plan]);

  if (!open) return null;

  const set = <K extends keyof PayPlan>(k: K, v: PayPlan[K]) =>
    setDraft(d => ({ ...d, [k]: v }));
  const setBonus = (i: number, k: keyof UnitBonusTier, v: number) =>
    setDraft(d => ({
      ...d,
      unitBonuses: d.unitBonuses.map((b, j) => (j === i ? { ...b, [k]: v } : b)),
    }));
  const addBonus = () =>
    setDraft(d => ({ ...d, unitBonuses: [...d.unitBonuses, { units: 0, bonus: 0 }] }));
  const removeBonus = (i: number) =>
    setDraft(d => ({ ...d, unitBonuses: d.unitBonuses.filter((_, j) => j !== i) }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await savePayPlan(draft);
      onSaved(draft);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, keyboardInset > 0 && { bottom: keyboardInset }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cancel pay plan changes"
          >
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>YOUR PAY PLAN</Text>
            <Text style={styles.headerTitle}>Configure</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.headerBtn,
              styles.headerBtnPrimary,
              pressed && !saving && styles.pressed,
              saving && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving pay plan' : 'Save pay plan'}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <Text style={[styles.headerBtnText, { color: colors.ink }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHead label="COMMISSION %" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <PPField label="Front gross">
                <NumberInput value={draft.frontPct} onChange={v => set('frontPct', v)} suffix="%" big />
              </PPField>
            </View>
            <View style={{ flex: 1 }}>
              <PPField label="Back gross">
                <NumberInput value={draft.backPct} onChange={v => set('backPct', v)} suffix="%" big />
              </PPField>
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <PPField label="Flat mini" sub="per unit">
                <NumberInput value={draft.flatMini} onChange={v => set('flatMini', v)} prefix="$" />
              </PPField>
            </View>
            <View style={{ flex: 1 }}>
              <PPField label="Monthly base">
                <NumberInput value={draft.baseSalary} onChange={v => set('baseSalary', v)} prefix="$" />
              </PPField>
            </View>
          </View>

          <SectionHead label="SPIFFS & BONUSES" />
          <PPField label="Spiffs" sub="per unit, all deals">
            <NumberInput value={draft.manuBonus} onChange={v => set('manuBonus', v)} prefix="$" />
          </PPField>
          <PPField label="Unit bonus" sub="per unit, on top of commission">
            <NumberInput value={draft.csiBonus} onChange={v => set('csiBonus', v)} prefix="$" />
          </PPField>

          <SectionHead label="UNIT BONUSES" count={draft.unitBonuses.length} />
          <View style={styles.tiersCard}>
            {draft.unitBonuses.length === 0 ? (
              <Text style={styles.empty}>No bonus tiers — add one below.</Text>
            ) : draft.unitBonuses.map((b, i) => (
              <View key={i} style={[styles.tierRow, i < draft.unitBonuses.length - 1 && styles.tierDivider]}>
                <Text style={styles.tierLabel}>AT</Text>
                <TextInput
                  value={b.units ? String(b.units) : ''}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^0-9]/g, ''));
                    setBonus(i, 'units', Number.isFinite(n) ? n : 0);
                  }}
                  keyboardType="numeric"
                  style={styles.tierUnits}
                />
                <Text style={styles.tierLabel}>units, pay</Text>
                <View style={styles.tierBonusWrap}>
                  <Text style={styles.tierBonusPrefix}>$</Text>
                  <TextInput
                    value={b.bonus ? String(b.bonus) : ''}
                    onChangeText={(t) => {
                      const n = Number(t.replace(/[^0-9]/g, ''));
                      setBonus(i, 'bonus', Number.isFinite(n) ? n : 0);
                    }}
                    keyboardType="numeric"
                    style={styles.tierBonus}
                  />
                </View>
                <Pressable
                  onPress={() => removeBonus(i)}
                  style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${b.units || 0} unit bonus tier`}
                >
                  <Text style={styles.removeBtnText}>−</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            onPress={addBonus}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add unit bonus tier"
          >
            <Text style={styles.addBtnText}>＋ ADD TIER</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.78)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    top: Platform.OS === 'web' ? ('max(6%, env(safe-area-inset-top))' as any) : '6%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
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
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  headerBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 72, alignItems: 'center', justifyContent: 'center',
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2 },

  body: {
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === 'web' ? ('max(28px, env(safe-area-inset-bottom))' as any) : 28,
  },

  row: { flexDirection: 'row', gap: 12 },
  field: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0 },
  fieldSub: { fontSize: 10, color: colors.grey, fontWeight: '500' },

  numWrap: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  prefix: {
    position: 'absolute', left: 14,
    color: colors.grey2, fontSize: 14, fontWeight: '600', zIndex: 1,
  },
  suffix: {
    position: 'absolute', right: 14,
    color: colors.grey2, fontSize: 13, fontWeight: '600',
  },
  num: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingVertical: 12,
    color: colors.white, fontSize: 16, fontWeight: '700',
  },

  empty: { color: colors.grey2, fontSize: 12, padding: 14, textAlign: 'center' },

  tiersCard: {
    marginHorizontal: 2,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  tierDivider: { borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  tierLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },
  tierUnits: {
    width: 56,
    minHeight: 44,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 10,
    color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center',
  },
  tierBonusWrap: { position: 'relative', flex: 1 },
  tierBonusPrefix: {
    position: 'absolute', left: 10, top: 12,
    color: colors.grey2, fontSize: 13, fontWeight: '600', zIndex: 1,
  },
  tierBonus: {
    minHeight: 44,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    paddingVertical: 8, paddingLeft: 22, paddingRight: 10,
    color: colors.white, fontSize: 16, fontWeight: '700',
  },
  removeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.ink3,
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: colors.grey2, fontSize: 16, fontWeight: '700', lineHeight: 18 },

  addBtn: {
    minHeight: 48,
    marginHorizontal: 2, marginTop: 10, marginBottom: 16,
    paddingVertical: 10,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.goldBorder,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },

  error: { color: colors.red, fontSize: 13, paddingHorizontal: 4 },
});
