import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Plan, IndustryKey } from '@/lib/types';
import { INDUSTRY_CONFIG, INDUSTRY_KEYS } from '@/lib/industryConfig';

// Supabase requires email — derived from username, never shown to user
function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@pocketrep.app`;
}

const PLANS: { id: Plan; name: string; price: string; after: string; features: string[] }[] = [
  {
    id: 'pro',
    name: 'Pro — The Closer',
    price: '$29',
    after: '$49/mo after Apr 30',
    features: [
      'Zero-Entry Logging — just talk, Rex files it',
      'Heat Sheet — 3-tier predictive commission radar',
      'Pre-Call Briefs + Rex AI Rebuttals',
      'Full data portability — your book, always',
    ],
  },
  {
    id: 'elite',
    name: 'Elite — Market Leader',
    price: '$47',
    after: '$79/mo after Apr 30',
    features: [
      'Everything in Pro',
      'Proximity Alerts — 500ft trigger on hot leads',
      'Cross-Deal Rex Memory',
      'Rapport Vault + AI Photo Vision',
      'Weekly Pipeline Digest',
    ],
  },
];

export default function SignupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [industry, setIndustry] = useState<IndustryKey>('auto');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<Plan>('pro');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!name || !username || !password) {
      Alert.alert('Fill in all fields');
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      Alert.alert('Username can only contain letters, numbers, and underscores');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const email = usernameToEmail(username);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, plan, username: username.trim(), industry } },
    });

    if (error) {
      setLoading(false);
      if (error.message.toLowerCase().includes('already')) {
        Alert.alert('Username taken', 'That username is already in use. Try a different one.');
      } else {
        Alert.alert('Signup failed', error.message);
      }
      return;
    }

    if (data.user) {
      await supabase.from('profiles').update({
        full_name: name,
        plan,
        industry,
        username: username.trim(),
      }).eq('id', data.user.id);
    }

    setLoading(false);
    // Auth state change in _layout.tsx will redirect to (tabs)
  }

  // ── Step 1: Industry selection ────────────────────────────────────────────
  if (step === 1) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={s.headline}>What do you sell?</Text>
          <Text style={s.sub}>PocketRep tailors everything — templates, Rex's language, and follow-up sequences — to your industry.</Text>

          <View style={s.industryGrid}>
            {INDUSTRY_KEYS.map((key) => {
              const cfg = INDUSTRY_CONFIG[key];
              const active = industry === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.industryCard, active && s.industryCardActive]}
                  onPress={() => setIndustry(key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.industryIcon}>{cfg.icon}</Text>
                  <Text style={[s.industryLabel, active && s.industryLabelActive]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={s.btn} onPress={() => setStep(2)} activeOpacity={0.85}>
            <Text style={s.btnText}>Next: Choose Plan →</Text>
          </TouchableOpacity>

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

  // ── Step 2: Plan selection ────────────────────────────────────────────────
  if (step === 2) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => setStep(1)} style={s.back}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={s.headline}>Start your free trial.</Text>
          <Text style={s.sub}>7 days free. Cancel before day 8 — zero charge.</Text>

          <Text style={s.sectionLabel}>Choose your plan</Text>
          <View style={s.plans}>
            {PLANS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[s.planCard, plan === p.id && s.planCardActive]}
                onPress={() => setPlan(p.id)}
                activeOpacity={0.8}
              >
                {p.id === 'elite' && (
                  <View style={s.popularBadge}>
                    <Text style={s.popularBadgeText}>MARKET LEADER</Text>
                  </View>
                )}
                <View style={s.planTop}>
                  <Text style={[s.planName, plan === p.id && { color: colors.gold }]}>{p.name}</Text>
                  <View>
                    <Text style={s.planPrice}>{p.price}<Text style={s.planPer}>/mo</Text></Text>
                    <Text style={s.planAfter}>{p.after}</Text>
                  </View>
                </View>
                {p.features.map((f, i) => (
                  <View key={i} style={s.featureRow}>
                    <Text style={s.featureCheck}>✓</Text>
                    <Text style={s.featureText}>{f}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.btn, { marginTop: spacing.lg }]} onPress={() => setStep(3)} activeOpacity={0.85}>
            <Text style={s.btnText}>Next: Create Account →</Text>
          </TouchableOpacity>

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

  // ── Step 3: Account details ───────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => setStep(2)} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.headline}>Almost there.</Text>
        <Text style={s.sub}>Create your account to start your 7-day free trial.</Text>

        {/* Industry + plan summary */}
        <View style={s.summaryRow}>
          <View style={s.summaryChip}>
            <Text style={s.summaryChipText}>{INDUSTRY_CONFIG[industry]?.icon} {INDUSTRY_CONFIG[industry]?.label}</Text>
          </View>
          <View style={s.summaryChip}>
            <Text style={s.summaryChipText}>{plan === 'elite' ? '⭐ Elite' : '🔥 Pro'}</Text>
          </View>
        </View>

        {/* Form */}
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

          <Text style={s.label}>Username</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            placeholder="marcuswebb"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="8+ characters"
            placeholderTextColor={colors.grey}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity style={s.btn} onPress={handleSignup} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color={colors.ink} />
              : <Text style={s.btnText}>Start 7-Day Free Trial →</Text>
            }
          </TouchableOpacity>

          <Text style={s.micro}>
            You won't be charged until day 8. Cancel anytime before then.
          </Text>
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
    letterSpacing: 0.1, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  // Industry grid
  industryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  industryCard: {
    width: '22%', aspectRatio: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: 6,
  },
  industryCardActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,168,67,0.08)' },
  industryIcon: { fontSize: 22 },
  industryLabel: { fontSize: 9, fontWeight: '600', color: colors.grey2, textAlign: 'center' },
  industryLabelActive: { color: colors.gold },
  // Summary chips
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryChip: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  summaryChipText: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  // Plans
  plans: { gap: spacing.sm },
  planCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  planCardActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,168,67,0.06)' },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: spacing.xs,
  },
  popularBadgeText: { color: colors.gold2, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  planName: { fontSize: 15, fontWeight: '700', color: colors.white, flex: 1, paddingRight: 8 },
  planPrice: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'right' },
  planPer: { fontSize: 13, fontWeight: '500', color: colors.grey2 },
  planAfter: { fontSize: 11, color: colors.grey, textAlign: 'right' },
  featureRow: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  featureCheck: { color: colors.green, fontSize: 12, marginTop: 2 },
  featureText: { color: colors.grey3, fontSize: 13, flex: 1, lineHeight: 18 },
  // Form
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
