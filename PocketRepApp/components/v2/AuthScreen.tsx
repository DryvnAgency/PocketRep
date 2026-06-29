// v2 real per-user sign-in / sign-up (Eduardo's P0 decision #3) — replaces the
// shared-demo auto-sign-in. This screen does plain Supabase email+password auth;
// it does NOT touch demoAuth.ts or any billing code.
//
// ⚠️ Built but NOT yet wired into the boot flow. Wiring it in (show this when
// there's no session, instead of auto-signing-in the demo account) is the GATED
// step Eduardo owns — see docs/MASTER_PLAN.md §"Gated P0 — Eduardo only". With
// the hard-lockout model, a brand-new signup will land on LockoutScreen until
// they subscribe (the access gate decides that, not this screen).

import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/constants/theme';

export default function AuthScreen({ onAuthed }: { onAuthed?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const submit = async () => {
    setError(null);
    setNotice(null);
    const em = email.trim().toLowerCase();
    if (!em || !password) { setError('Enter your email and password.'); return; }
    if (isSignup && password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setBusy(true);
    try {
      if (!isSignup) {
        const { error: signErr } = await supabase.auth.signInWithPassword({ email: em, password });
        if (signErr) { setError('Email or password is incorrect.'); return; }
        onAuthed?.();
      } else {
        const { data, error: signErr } = await supabase.auth.signUp({
          email: em,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signErr) { setError(signErr.message); return; }
        // With hard lockout, the access gate sends a fresh (unpaid) account to
        // LockoutScreen → re-subscribe. If email confirmation is on, there's no
        // session yet, so prompt them to confirm first.
        if (data.session) onAuthed?.();
        else setNotice('Check your email to confirm your account, then sign in.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
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

        <Text style={styles.headline}>{isSignup ? 'Start closing with Rex.' : 'Welcome back, closer.'}</Text>
        <Text style={styles.sub}>{isSignup ? 'Create your account.' : 'Sign in to your book.'}</Text>

        <View style={styles.form}>
          {isSignup ? (
            <>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Jordan Rivera"
                placeholderTextColor={colors.grey}
                autoCapitalize="words"
              />
            </>
          ) : null}

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
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            style={[styles.btn, busy && { opacity: 0.7 }]}
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={isSignup ? 'Create account' : 'Sign in'}
          >
            {busy
              ? <ActivityIndicator color={colors.ink} />
              : <Text style={styles.btnText}>{isSignup ? 'Create account' : 'Sign in'}</Text>}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{isSignup ? 'Already have an account? ' : 'No account yet? '}</Text>
          <Pressable
            onPress={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null); setNotice(null); }}
            accessibilityRole="button"
            accessibilityLabel={isSignup ? 'Switch to sign in' : 'Switch to sign up'}
          >
            <Text style={styles.footerLink}>{isSignup ? 'Sign in' : 'Start free trial'}</Text>
          </Pressable>
        </View>
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
  notice: { color: colors.gold, fontSize: 13, marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: colors.grey2, fontSize: 14 },
  footerLink: { color: colors.gold, fontWeight: '700', fontSize: 14 },
});
