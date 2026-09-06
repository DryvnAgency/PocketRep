import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { createContact } from '@/lib/v2/updateContact';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';
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
  const [addedPhones, setAddedPhones] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [soldTiming, setSoldTiming] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const keyboardInset = useWebVisualViewportInset(open);

  useEffect(() => {
    if (!open || !wave) return;
    setStep('intro');
    setAddedIds([]);
    setAddedPhones([]);
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
    if (pk && (existingContacts.some(c => phoneKey(c.phone) === pk) || addedPhones.includes(pk))) {
      setError('That phone number is already in this book. Tell Rex if you want to update that customer.');
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
      if (pk) setAddedPhones(prev => [...prev, pk]);
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
      <View style={[styles.card, keyboardInset > 0 ? { marginBottom: keyboardInset } : null]}>
        <View style={styles.handle} />
        <ScrollView
          contentContainerStyle={styles.cardContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'intro' ? (
            <>
              <View style={styles.rexRow} accessibilityLabel="Rex ready">
                <View style={styles.rexOrb}><View style={styles.rexCore} /></View>
                <View>
                  <Text style={styles.rexLabel}>REX</Text>
                  <View style={styles.readyRow}><View style={styles.readyDot} /><Text style={styles.readyText}>READY</Text></View>
                </View>
              </View>
              <Text style={styles.kicker}>BUILD YOUR 60-DAY BOOK</Text>
              <Text style={styles.title}>
                {wave === 'last_month' ? 'Start with last month.' : 'Now add the month before that.'}
              </Text>
              <Text style={styles.body}>
                Start with people you already earned. Add the basics fast, then hand the book to Rex for anything missing and let him build the outreach.
              </Text>
              <View style={styles.flow}>
                <View style={styles.flowStep}><Text style={styles.flowNum}>01</Text><Text style={styles.flowText}>Add sold customers</Text></View>
                <View style={styles.flowStep}><Text style={styles.flowNum}>02</Text><Text style={styles.flowText}>Finish with Rex</Text></View>
                <View style={styles.flowStep}><Text style={styles.flowNum}>03</Text><Text style={styles.flowText}>Done → Text Queue</Text></View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add sold customers"
                onPress={() => setStep('add')}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>ADD SOLD CUSTOMERS</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tell Rex instead"
                onPress={goToRex}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>Tell Rex instead</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Not now"
                onPress={onClose}
                style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
              >
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close sold-book setup"
                  onPress={onClose}
                  hitSlop={10}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.close}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.addTitle}>Add the next sold customer.</Text>
              <Text style={styles.addHint}>Keep it light. Rex can fill in context afterward.</Text>

              <Text style={styles.label}>NAME</Text>
              <TextInput accessibilityLabel="Customer name" value={name} onChangeText={setName} placeholder="Customer name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>PHONE</Text>
              <TextInput accessibilityLabel="Phone number" value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.grey} style={styles.input} keyboardType="phone-pad" />
              <Text style={styles.label}>VEHICLE SOLD</Text>
              <TextInput accessibilityLabel="Vehicle sold" value={vehicle} onChangeText={setVehicle} placeholder="2026 Rogue SV" placeholderTextColor={colors.grey} style={styles.input} />
              <Text style={styles.label}>SOLD TIMING · OPTIONAL</Text>
              <TextInput accessibilityLabel="Sold timing optional" value={soldTiming} onChangeText={setSoldTiming} placeholder={monthLabel} placeholderTextColor={colors.grey} style={styles.input} />

              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save and add next customer"
                accessibilityState={{ disabled: saving, busy: saving }}
                onPress={saveCustomer}
                disabled={saving}
                style={({ pressed }) => [styles.primary, saving && styles.disabled, pressed && !saving && styles.pressed]}
              >
                {saving ? <View style={styles.loadingRow}><ActivityIndicator color={colors.ink} size="small" /><Text style={styles.primaryText}>SAVING…</Text></View> : <Text style={styles.primaryText}>SAVE + NEXT CUSTOMER</Text>}
              </Pressable>

              <View style={styles.split}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Finish with Rex"
                  onPress={goToRex}
                  style={({ pressed }) => [styles.rexBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.rexBtnText}>FINISH WITH REX</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tell Rex instead"
                  onPress={goToRex}
                  style={({ pressed }) => [styles.rexSecondary, pressed && styles.pressed]}
                >
                  <Text style={styles.rexSecondaryText}>Tell Rex instead</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 95, justifyContent: 'flex-end' } as any,
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.82)' } as any,
  card: {
    maxHeight: Platform.OS === 'web' ? ('88dvh' as any) : '88%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? ('max(18px, env(safe-area-inset-bottom))' as any) : 18,
  },
  cardContent: { paddingBottom: 10 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.ink4, alignSelf: 'center', marginBottom: 16 },
  rexRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  rexOrb: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.surface2 },
  rexCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  rexLabel: { color: colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 1.4 },
  readyRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  readyText: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  kicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 26, lineHeight: 31, fontWeight: '800', marginTop: 7, letterSpacing: -0.4 },
  body: { color: colors.grey3, fontSize: 14, lineHeight: 21, marginTop: 9 },
  flow: { marginTop: 16, gap: 7, padding: 13, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  flowStep: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  flowNum: { width: 26, color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  flowText: { flex: 1, color: colors.grey3, fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.gold, borderWidth: 1, borderColor: colors.gold2, alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 },
  primaryText: { color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondary: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 14 },
  secondaryText: { color: colors.gold, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dismissText: { color: colors.grey2, fontSize: 11, fontWeight: '700' },
  progressRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 3 },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: colors.grey2, fontSize: 16, fontWeight: '800' },
  addTitle: { color: colors.white, fontSize: 19, fontWeight: '800', marginTop: 14 },
  addHint: { color: colors.grey2, fontSize: 11, marginTop: 4, marginBottom: 12 },
  label: { color: colors.grey2, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 9, marginBottom: 5 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2, color: colors.white, paddingHorizontal: 12, fontSize: 16 },
  error: { color: colors.red, fontSize: 11, lineHeight: 16, marginTop: 9 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  rexBtn: { flexGrow: 1.2, flexBasis: 160, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rexBtnText: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  rexSecondary: { flexGrow: 1, flexBasis: 120, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rexSecondaryText: { color: colors.grey2, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});
