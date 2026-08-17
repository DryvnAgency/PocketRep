// v2 real per-user SIGN-IN — the default when there's no session (wired in
// AppShell.tsx). Plain Supabase email+password auth; does not call demoAuth.ts
// directly (the optional onTryDemo prop is the caller's demo hook — see AppShell's
// handleTryDemo).
//
// Acquisition (new signup) is routed to the marketing landing page (openMarketing)
// for now — the in-app email-confirmation flow is deferred (the "link not provided"
// blocker lives in the Supabase email template), so this screen is sign-in-only.
// Existing users sign in here; new users create/subscribe on pocketrep.pro.

import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { openMarketing } from '@/lib/v2/links';
import { colors, radius } from '@/constants/theme';

export default function AuthScreen({
  onTryDemo,
}: {
  // Present only where the demo is reachable (web) — see AppShell. Errors thrown
  // here surface inline exactly like a failed sign-in, instead of the button
  // silently doing nothing.
  onTryDemo?: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !password) { setError('Enter your email and password.'); return; }

    setBusy(true);
    try {
      // No onAuthed callback needed here: AppShell's onAuthStateChange listener
      // is the single source of truth for the transition and picks up the
      // resulting SIGNED_IN event on its own (fires before this await resolves).
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: em, password });
      if (signErr) { setError('Email or password is incorrect.'); return; }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    if (!onTryDemo || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onTryDemo();
    } catch (e: any) {
      setError(e?.message ?? 'Could not start the demo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>P</Text></View>
          <Text style={styles.wordmark}>Pocket<Text style={{ color: colors.gold }}>Rep</Text></Text>
        </View>

        <Text style={styles.headline}>Welcome back, closer.</Text>
        <Text style={styles.sub}>Sign in to your book.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.grey}
            secureTextEntry
            autoComplete="password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, busy && { opacity: 0.7 }]}
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {busy
              ? <ActivityIndicator color={colors.ink} />
              : <Text style={styles.btnText}>Sign in</Text>}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account yet? </Text>
          <Pressable
            onPress={openMarketing}
            accessibilityRole="button"
            accessibilityLabel="Start free trial at pocketrep.pro"
          >
            <Text style={styles.footerLink}>Start free trial</Text>
          </Pressable>
        </View>

        {onTryDemo ? (
          <Pressable
            onPress={tryDemo}
            disabled={busy}
            style={[styles.demoLink, busy && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Try the live demo"
          >
            <Text style={styles.demoLinkText}>Just want to look around? Try the live demo →</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  mark: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  wordmark: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.5 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginBottom: 6 },
  sub: { fontSize: 15, color: colors.grey2, marginBottom: 28 },
  form: { gap: 8 },
  label: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0, marginTop: 8 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    color: colors.white, fontSize: 15, fontWeight: '600',
  },
  btn: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  error: { color: colors.red, fontSize: 13, marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: colors.grey2, fontSize: 14 },
  footerLink: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  demoLink: { alignItems: 'center', marginTop: 20 },
  demoLinkText: { color: colors.grey, fontSize: 13 },
});
