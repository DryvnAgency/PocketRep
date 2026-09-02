import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing } from '@/constants/theme';

// The one live, paid PocketRep V1 checkout — same Stripe Payment Link used by
// the marketing site. V1 is automotive-only and has one founding offer.
const CHECKOUT_URL = 'https://buy.stripe.com/cNi4gAbMn4kg9Ax5AucbC06';

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Hands off to Stripe-hosted checkout. This screen never creates a Supabase
  // account or grants access itself. After checkout, thankyou.html completes
  // account provisioning through checkout-account and returns the rep by magic
  // link. The checkout remains the entitlement boundary.
  async function handleSignup() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      Alert.alert('Fill in all fields');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert('Enter a valid email');
      return;
    }

    setLoading(true);
    const clientRef = `${trimmedName.replace(/\s+/g, '_')}_auto`;
    const url = `${CHECKOUT_URL}?prefilled_email=${encodeURIComponent(trimmedEmail)}&client_reference_id=${encodeURIComponent(clientRef)}`;
    try {
      await Linking.openURL(url);
      router.back();
    } catch {
      Alert.alert("Couldn't open checkout", 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.headline}>Start your 7-day free trial.</Text>
        <Text style={s.sub}>PocketRep is built for automotive sales reps who want to work their book smarter.</Text>

        <View style={s.offerCard}>
          <View style={s.offerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.offerLabel}>FOUNDING REP</Text>
              <Text style={s.offerName}>PocketRep V1</Text>
            </View>
            <Text style={s.offerPrice}>$39<Text style={s.offerPer}>/mo</Text></Text>
          </View>
          <Text style={s.offerCopy}>7 days free. Keep your founding subscription rate while your subscription stays active.</Text>
          <View style={s.featureRow}><Text style={s.featureCheck}>✓</Text><Text style={s.featureText}>Heat Sheet — know who deserves attention today</Text></View>
          <View style={s.featureRow}><Text style={s.featureCheck}>✓</Text><Text style={s.featureText}>Rex coaching, Game Plan, and contextual follow-up</Text></View>
          <View style={s.featureRow}><Text style={s.featureCheck}>✓</Text><Text style={s.featureText}>Contacts, sequences, outcomes, deals, and metrics</Text></View>
          <View style={s.featureRow}><Text style={s.featureCheck}>✓</Text><Text style={s.featureText}>You review and take the send action</Text></View>
        </View>

        <Text style={s.sectionLabel}>Your details</Text>
        <View style={s.form}>
          <Text style={s.label}>Full Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Marcus Webb"
            placeholderTextColor={colors.grey}
            autoComplete="name"
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="marcus@yourdealership.com"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />

          <TouchableOpacity style={s.btn} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color={colors.ink} />
              : <Text style={s.btnText}>Start 7 Days Free →</Text>
            }
          </TouchableOpacity>

          <Text style={s.micro}>Card required. You won't be charged until day 8. Cancel anytime before then.</Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, padding: spacing.xl, paddingTop: 56 },
  back: { marginBottom: spacing.xl },
  backText: { color: colors.grey2, fontSize: 14 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginBottom: 6 },
  sub: { fontSize: 13, color: colors.grey2, marginBottom: spacing.xl, lineHeight: 19 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.gold,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  offerCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  offerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  offerLabel: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  offerName: { fontSize: 17, fontWeight: '800', color: colors.white },
  offerPrice: { fontSize: 26, fontWeight: '800', color: colors.white, textAlign: 'right' },
  offerPer: { fontSize: 13, fontWeight: '500', color: colors.grey2 },
  offerCopy: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  featureRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  featureCheck: { color: colors.green, fontSize: 12, marginTop: 2 },
  featureText: { color: colors.grey3, fontSize: 13, flex: 1, lineHeight: 18 },
  form: { gap: spacing.xs },
  label: { fontSize: 11, fontWeight: '600', color: colors.grey3, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.md,
    color: colors.white, fontSize: 15,
  },
  btn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.md,
  },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  micro: { color: colors.grey, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.grey2, fontSize: 14 },
  footerLink: { color: colors.gold, fontWeight: '600', fontSize: 14 },
});
