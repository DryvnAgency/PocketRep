import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { createContact, type NewContactDraft } from '@/lib/v2/updateContact';
import { parseBirthdayInput } from '@/lib/v2/birthday';
import { isRexFollowupEnabled, isContactImportEnabled } from '@/lib/v2/rexFeatureFlags';
import { kickoffRecapForContact } from '@/lib/v2/followupSequence';
import { pickOneFromDevice, isDeviceContactPickerSupported } from '@/lib/v2/contactImport';
import type { V2Contact } from '@/lib/v2/useContacts';

const PLAN_OPTIONS: Array<{ value: NewContactDraft['planLabel']; label: string }> = [
  { value: 'TODAY', label: 'Today' },
  { value: 'THIS WEEK', label: 'This Week' },
  { value: 'THIS MONTH', label: 'This Month' },
  { value: 'NEXT QTR', label: 'Next Qtr' },
];

const TIER_OPTIONS: Array<{ label: string; score: number; color: string; icon: string }> = [
  { label: 'Hot',   score: 90, color: colors.red,    icon: '🔥' },
  { label: 'Warm',  score: 65, color: colors.orange, icon: '☀️' },
  { label: 'Cold',  score: 35, color: colors.grey2,  icon: '🧊' },
];

const blank = (): NewContactDraft => ({
  firstName: '', lastName: '', phone: '', email: '',
  vehicle: '', trim: '', budget: '', tradeIn: '',
  planLabel: 'THIS WEEK',
  heatScore: 90,
  notes: '',
  tags: [],
  birthday: '',
  referredByName: '',
});

export default function AddContactModal({
  open, onClose, onCreated, allContacts = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  allContacts?: V2Contact[];
}) {
  const [d, setD] = useState<NewContactDraft>(blank());
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous re-entrancy guard: the state-based `saving` updates async, so a
  // same-tick double-tap can pass `canSave` twice and create two contacts (+ two
  // recap kickoffs). This ref blocks the second call before the first's await.
  const savingRef = useRef(false);

  // "Add from phone" entry point: only when the import capability is on AND this
  // runtime actually has a picker (native build with expo-contacts, or the web
  // Contacts Picker on Android Chrome). Otherwise the button stays hidden and the
  // card is manual-entry exactly as before. Platform/flag are constant per mount.
  const canPickFromPhone = useMemo(
    () => isContactImportEnabled() && isDeviceContactPickerSupported(),
    [],
  );

  useEffect(() => {
    if (open) {
      setD(blank());
      setSaving(false);
      setPicking(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof NewContactDraft>(k: K, v: NewContactDraft[K]) =>
    setD(s => ({ ...s, [k]: v }));

  const canSave = d.firstName.trim().length > 0 && !saving;

  // Open the device contact picker and prefill the form. The rep still reviews
  // and taps Save — nothing is written from the pick alone. A picked field never
  // wipes something already typed (|| keeps the existing value), and a cancel is
  // a silent no-op. Errors surface inline via the same `error` line as Save.
  const handlePickFromPhone = async () => {
    if (picking) return;
    setError(null);
    setPicking(true);
    try {
      const picked = await pickOneFromDevice();
      if (!picked) return; // user cancelled — leave the form untouched
      setD(s => ({
        ...s,
        firstName: picked.firstName || s.firstName,
        lastName: picked.lastName || s.lastName,
        phone: picked.phone || s.phone,
        email: picked.email || s.email,
      }));
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (!/cancel|abort/i.test(msg)) setError(msg || 'Could not open your contacts.');
    } finally {
      setPicking(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || savingRef.current) return;
    const parsedBday = parseBirthdayInput(d.birthday ?? '');
    if (parsedBday === false) {
      setError('Birthday must be MM/DD/YYYY');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Auto-link the referrer when the typed name matches a saved contact;
      // otherwise keep it as free text. Precise linking is also available later
      // from the contact card.
      const typedReferrer = (d.referredByName ?? '').trim();
      const matchedReferrer = typedReferrer
        ? allContacts.find(c => c.name.toLowerCase() === typedReferrer.toLowerCase())
        : undefined;
      const newId = await createContact({
        ...d,
        birthday: parsedBday,
        referredByName: typedReferrer || null,
        referredByContactId: matchedReferrer?.id ?? null,
      });
      // P2 follow-up feature (flag-gated): on save, Rex auto-drafts a recap into the
      // contact's Next Step. Fire-and-forget so it never blocks or fails the save.
      if (isRexFollowupEnabled()) {
        kickoffRecapForContact(newId, {
          name: [d.firstName, d.lastName].filter(Boolean).join(' ').trim(),
          vehicle: d.vehicle,
          note: d.notes,
        }).catch(() => undefined);
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
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
          {canPickFromPhone ? (
            <Pressable
              onPress={handlePickFromPhone}
              disabled={picking}
              style={styles.phoneBtn}
              accessibilityRole="button"
              accessibilityLabel="Add from phone contacts"
            >
              <Text style={styles.phoneIcon}>📇</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.phoneTitle}>{picking ? 'Opening contacts…' : 'Add from phone'}</Text>
                <Text style={styles.phoneSub}>Pull a name &amp; number from your contacts</Text>
              </View>
              <Text style={styles.phoneChevron}>›</Text>
            </Pressable>
          ) : null}

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

          <Field label="REFERRED BY">
            <TextInput
              value={d.referredByName ?? ''}
              onChangeText={t => set('referredByName', t)}
              placeholder="Who sent them your way?"
              placeholderTextColor={colors.grey}
              autoCapitalize="words"
              style={styles.input}
            />
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

  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
  },
  phoneIcon: { fontSize: 20 },
  phoneTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  phoneSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  phoneChevron: { fontSize: 20, color: colors.gold },

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
