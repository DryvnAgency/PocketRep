import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { createContact, type NewContactDraft } from '@/lib/v2/updateContact';
import { parseBirthdayInput } from '@/lib/v2/birthday';

const PLAN_OPTIONS: Array<{ value: NewContactDraft['planLabel']; label: string }> = [
  { value: 'TODAY', label: 'Today' },
  { value: 'THIS WEEK', label: 'This Week' },
  { value: 'THIS MONTH', label: 'This Month' },
  { value: 'NEXT QTR', label: 'Next Qtr' },
];

const TIER_OPTIONS: Array<{ label: string; score: number; color: string; icon: string }> = [
  { label: 'Hot',   score: 90, color: colors.red,    icon: '🔥' },
  { label: 'Warm',  score: 65, color: colors.orange, icon: '☀️' },
  { label: 'Watch', score: 35, color: colors.grey2,  icon: '👁' },
];

const blank = (): NewContactDraft => ({
  firstName: '', lastName: '', phone: '', email: '',
  vehicle: '', trim: '', budget: '', tradeIn: '',
  planLabel: 'THIS WEEK',
  heatScore: 90,
  notes: '',
  tags: [],
  birthday: '',
});

export default function AddContactModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [d, setD] = useState<NewContactDraft>(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setD(blank());
      setSaving(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof NewContactDraft>(k: K, v: NewContactDraft[K]) =>
    setD(s => ({ ...s, [k]: v }));

  const canSave = d.firstName.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    const parsedBday = parseBirthdayInput(d.birthday ?? '');
    if (parsedBday === false) {
      setError('Birthday must be MM/DD/YYYY');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createContact({ ...d, birthday: parsedBday });
      onCreated();
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
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>NEW CONTACT</Text>
            <Text style={styles.headerTitle}>Add to your book</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.headerBtn, canSave ? styles.headerBtnPrimary : styles.headerBtnDisabled]}
          >
            <Text style={[styles.headerBtnText, canSave ? { color: colors.ink } : { color: colors.grey }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Field label="FIRST NAME *">
            <TextInput
              value={d.firstName}
              onChangeText={t => set('firstName', t)}
              placeholder="First name"
              placeholderTextColor={colors.grey}
              autoCapitalize="words"
              style={styles.input}
            />
          </Field>

          <View style={styles.row}>
            <Field label="LAST NAME" style={{ flex: 1 }}>
              <TextInput
                value={d.lastName}
                onChangeText={t => set('lastName', t)}
                placeholder="Last name"
                placeholderTextColor={colors.grey}
                autoCapitalize="words"
                style={styles.input}
              />
            </Field>
            <Field label="PHONE" style={{ flex: 1 }}>
              <TextInput
                value={d.phone}
                onChangeText={t => set('phone', t)}
                placeholder="(555) 555-0123"
                placeholderTextColor={colors.grey}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="EMAIL">
            <TextInput
              value={d.email}
              onChangeText={t => set('email', t)}
              placeholder="name@email.com"
              placeholderTextColor={colors.grey}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </Field>

          <Field label="VEHICLE OF INTEREST">
            <TextInput
              value={d.vehicle}
              onChangeText={t => set('vehicle', t)}
              placeholder="Vehicle of interest"
              placeholderTextColor={colors.grey}
              style={styles.input}
            />
          </Field>

          <View style={styles.row}>
            <Field label="TRIM / COLOR" style={{ flex: 1 }}>
              <TextInput
                value={d.trim}
                onChangeText={t => set('trim', t)}
                placeholder="Trim / color"
                placeholderTextColor={colors.grey}
                style={styles.input}
              />
            </Field>
            <Field label="BIRTHDAY" style={{ flex: 1 }}>
              <TextInput
                value={d.birthday ?? ''}
                onChangeText={t => set('birthday', t)}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={colors.grey}
                style={styles.input}
              />
            </Field>
          </View>

          <View style={styles.row}>
            <Field label="BUDGET" style={{ flex: 1 }}>
              <TextInput
                value={d.budget}
                onChangeText={t => set('budget', t)}
                placeholder="Budget"
                placeholderTextColor={colors.grey}
                style={styles.input}
              />
            </Field>
            <Field label="TRADE-IN" style={{ flex: 1 }}>
              <TextInput
                value={d.tradeIn}
                onChangeText={t => set('tradeIn', t)}
                placeholder="Trade-in"
                placeholderTextColor={colors.grey}
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="HEAT TIER">
            <View style={styles.segRow}>
              {TIER_OPTIONS.map(t => {
                const active = d.heatScore === t.score;
                return (
                  <Pressable
                    key={t.label}
                    onPress={() => set('heatScore', t.score)}
                    style={[
                      styles.tierBtn,
                      active
                        ? { backgroundColor: t.color, borderColor: t.color }
                        : { backgroundColor: 'transparent', borderColor: colors.ink4 },
                    ]}
                  >
                    <Text style={{ fontSize: 14 }}>{t.icon}</Text>
                    <Text style={[
                      styles.tierLabel,
                      { color: active ? colors.white : colors.grey2 },
                    ]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="TIMELINE">
            <View style={styles.segRow}>
              {PLAN_OPTIONS.map(o => {
                const active = d.planLabel === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => set('planLabel', o.value)}
                    style={[
                      styles.planBtn,
                      active
                        ? { backgroundColor: colors.goldBg, borderColor: colors.gold }
                        : { backgroundColor: 'transparent', borderColor: colors.ink4 },
                    ]}
                  >
                    <Text style={[
                      styles.planLabel,
                      { color: active ? colors.gold : colors.grey2 },
                    ]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="NOTES">
            <TextInput
              value={d.notes}
              onChangeText={t => set('notes', t)}
              placeholder="What did you learn from the customer today?"
              placeholderTextColor={colors.grey}
              multiline
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' as any }]}
            />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
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
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '7%',
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
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4 },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 16 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    color: colors.white, fontSize: 14, fontWeight: '600',
  },

  row: { flexDirection: 'row', gap: 12 },

  segRow: { flexDirection: 'row', gap: 6 },
  tierBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  tierLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  planBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  planLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  error: { color: colors.red, fontSize: 13 },
});
