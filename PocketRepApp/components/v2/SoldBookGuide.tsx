import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { createContact } from '@/lib/v2/updateContact';
import type { V2Contact } from '@/lib/v2/useContacts';

export type SoldBookWave = 'last_month' | 'previous_month';

function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default function SoldBookGuide({
  open,
  wave,
  existingContacts,
  onClose,
  onFinishWithRex,
}: {
  open: boolean;
  wave: SoldBookWave | null;
  existingContacts: V2Contact[];
  onClose: () => void;
  onFinishWithRex: (ids: string[]) => void;
}) {
  const [step, setStep] = useState<'intro' | 'add'>('intro');
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [soldTiming, setSoldTiming] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open || !wave) return;
    setStep('intro');
    setAddedIds([]);
    setName('');
    setPhone('');
    setVehicle('');
    setSoldTiming('');
    setSaving(false);
    setError(null);
    savingRef.current = false;
  }, [open, wave]);

  if (!open || !wave) return null;

  const monthLabel = wave === 'last_month' ? 'last month' : 'the previous month';
  const resetFields = () => {
    setName('');
    setPhone('');
    setVehicle('');
    setSoldTiming('');
    setError(null);
  };

  const saveCustomer = async () => {
    if (savingRef.current) return;
    const full = name.trim();
    const phoneTrim = phone.trim();
    if (!full || !phoneTrim || !vehicle.trim()) {
      setError('Name, phone, and vehicle are enough to keep moving.');
      return;
    }
    const pk = phoneKey(phoneTrim);
    if (pk && existingContacts.some(c => phoneKey(c.phone) === pk)) {
      setError('That phone number is already in your book. Tell Rex if you want to update that customer.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const [first, ...rest] = full.split(/\s+/);
      const id = await createContact({
        firstName: first,
        lastName: rest.join(' '),
        phone: phoneTrim,
        email: '',
        vehicle: vehicle.trim(),
        trim: '',
        budget: '',
        tradeIn: '',
        planLabel: '',
        heatScore: 35,
        notes: `Sold customer · ${soldTiming.trim() || monthLabel}`,
        tags: ['Sold'],
        isPastCustomer: true,
      });
      setAddedIds(prev => [...prev, id]);
      resetFields();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't add that customer.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const goToRex = () => onFinishWithRex(addedIds);

  return (
    <View style={styles.root}>
      <View style={styles.scrim} />
      <View style={styles.card}>
        <View style={styles.handle} />
        {step === 'intro' ? (
          <>
            <Text style={styles.kicker}>BUILD YOUR 60-DAY BOOK</Text>
            <Text style={styles.title}>
              {wave === 'last_month' ? 'Start with last month.' : 'Now add the month before that.'}
            </Text>
            <Text style={styles.body}>
              Start with people you already earned. Add the basics fast, then hand the book to Rex for anything missing and let him build the outreach.
            </Text>
            <View style={styles.flow}>
              <Text style={styles.flowText}>1 · Add sold customers</Text>
              <Text style={styles.flowText}>2 · Finish with Rex</Text>
              <Text style={styles.flowText}>3 · Done → Text Queue</Text>
            </View>
            <Pressable onPress={() => setStep('add')} style={styles.primary}>
              <Text style={styles.primaryText}>ADD SOLD CUSTOMERS</Text>
            </Pressable>
            <Pressable onPress={goToRex} style={styles.secondary}>
              <Text style={styles.secondaryText}>Tell Rex instead</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.dismiss}>
              <Text style={styles.dismissText}>Not now</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.progressRow}>
              <View>
                <Text style={styles.kicker}>{monthLabel.toUpperCase()}</Text>
                <Text style={styles.progress}>{addedIds.length} added</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
            </View>

            <Text style={styles.addTitle}>Add the next sold customer.</Text>
            <Text style={styles.addHint}>Keep it light. Rex can fill in context afterward.</Text>

            <Text style={styles.label}>NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Customer name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
            <Text style={styles.label}>PHONE</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.grey} style={styles.input} keyboardType="phone-pad" />
            <Text style={styles.label}>VEHICLE SOLD</Text>
            <TextInput value={vehicle} onChangeText={setVehicle} placeholder="2026 Rogue SV" placeholderTextColor={colors.grey} style={styles.input} />
            <Text style={styles.label}>SOLD TIMING · OPTIONAL</Text>
            <TextInput value={soldTiming} onChangeText={setSoldTiming} placeholder={monthLabel} placeholderTextColor={colors.grey} style={styles.input} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable onPress={saveCustomer} disabled={saving} style={[styles.primary, saving && { opacity: 0.55 }]}>
              <Text style={styles.primaryText}>{saving ? 'SAVING…' : 'SAVE + NEXT CUSTOMER'}</Text>
            </Pressable>

            <View style={styles.split}>
              <Pressable onPress={goToRex} style={styles.rexBtn}>
                <Text style={styles.rexBtnText}>FINISH WITH REX</Text>
              </Pressable>
              <Pressable onPress={goToRex} style={styles.rexSecondary}>
                <Text style={styles.rexSecondaryText}>Tell Rex instead</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 95, justifyContent: 'flex-end' } as any,
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.8)' } as any,
  card: {
    backgroundColor: colors.ink2, borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? ('max(28px, env(safe-area-inset-bottom))' as any) : 28,
  },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.ink4, alignSelf: 'center', marginBottom: 16 },
  kicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 26, lineHeight: 31, fontWeight: '800', marginTop: 7, letterSpacing: -0.4 },
  body: { color: colors.grey3, fontSize: 14, lineHeight: 21, marginTop: 9 },
  flow: { marginTop: 16, gap: 7, padding: 13, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  flowText: { color: colors.grey3, fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  primaryText: { color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  secondary: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  dismiss: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dismissText: { color: colors.grey2, fontSize: 11, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progress: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 3 },
  close: { color: colors.grey2, fontSize: 16, fontWeight: '800' },
  addTitle: { color: colors.white, fontSize: 19, fontWeight: '800', marginTop: 14 },
  addHint: { color: colors.grey2, fontSize: 11, marginTop: 4, marginBottom: 12 },
  label: { color: colors.grey2, fontSize: 9, fontWeight: '900', letterSpacing: 1.0, marginTop: 9, marginBottom: 5 },
  input: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2, color: colors.white, paddingHorizontal: 12, fontSize: 16 },
  error: { color: colors.red, fontSize: 11, marginTop: 9 },
  split: { flexDirection: 'row', gap: 8, marginTop: 9 },
  rexBtn: { flex: 1.2, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  rexBtnText: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  rexSecondary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rexSecondaryText: { color: colors.grey2, fontSize: 10, fontWeight: '700' },
});
