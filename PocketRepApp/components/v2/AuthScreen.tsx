import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { openMarketing } from '@/lib/v2/links';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';
import { colors, radius } from '@/constants/theme';

export default function AuthScreen(_props: { onTryDemo?: () => Promise<void> } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const kbInset = useWebVisualViewportInset();

  const submit = async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: em, password });
      if (signErr) setError('Email or password is incorrect.');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setError(null);
    setResetSent(false);
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) {
      setError('Enter the email tied to your PocketRep account.');
      return;
    }
    setBusy(true);
    try {
      const redirectTo = Platform.OS === 'web' ? 'https://app.pocketrep.pro/reset-password' : undefined;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        em,
        redirectTo ? { redirectTo } : undefined,
      );
      if (resetErr) {
        setError('We could not send the reset email. Please try again.');
        return;
      }
      setResetSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, kbInset > 0 && ({ paddingBottom: kbInset } as any)]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.brandRow}>
          <View style={styles.mark}><Text style={styles.markText}>P</Text></View>
          <Text style={styles.wordmark}>Pocket<Text style={{ color: colors.gold }}>Rep</Text></Text>
        </View>

        {!forgotMode ? (
          <>
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
                editable={!busy}
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
                editable={!busy}
                onSubmitEditing={() => { void submit(); }}
                returnKeyType="go"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && !busy && styles.pressed, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
              >
                {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.btnText}>Sign in</Text>}
              </Pressable>
              <Pressable
                onPress={() => { setError(null); setResetSent(false); setForgotMode(true); }}
                disabled={busy}
                style={({ pressed }) => [styles.forgotBtn, pressed && !busy && styles.pressed, busy && styles.disabledSoft]}
                accessibilityRole="button"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            </View>
            <View style={styles.footer}>
              <Text style={styles.footerText}>No account yet? </Text>
              <Pressable
                onPress={openMarketing}
                style={({ pressed }) => [styles.footerLinkTarget, pressed && styles.pressed]}
                accessibilityRole="link"
              >
                <Text style={styles.footerLink}>Start free trial</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.headline}>Reset your password.</Text>
            <Text style={styles.sub}>Enter the email tied to your PocketRep account and we'll send you a secure link to create a new password.</Text>
            <View style={styles.form}>
              <Text style={styles.label}>ACCOUNT EMAIL</Text>
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
                editable={!busy}
                onSubmitEditing={() => { void sendReset(); }}
                returnKeyType="send"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {resetSent ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Check your email</Text>
                  <Text style={styles.noticeText}>If that email is registered, we sent a secure password reset link.</Text>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && !busy && styles.pressed, busy && styles.disabled]}
                onPress={sendReset}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
              >
                {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.btnText}>Send Reset Link →</Text>}
              </Pressable>
              <Pressable
                onPress={() => { setError(null); setResetSent(false); setForgotMode(false); }}
                disabled={busy}
                style={({ pressed }) => [styles.backBtn, pressed && !busy && styles.pressed, busy && styles.disabledSoft]}
                accessibilityRole="button"
              >
                <Text style={styles.forgotText}>← Back to sign in</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-top))' as any) : 24,
    paddingBottom: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-bottom))' as any) : 24,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  mark: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  wordmark: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.5 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginBottom: 6 },
  sub: { fontSize: 15, color: colors.grey2, marginBottom: 28, lineHeight: 21 },
  form: { gap: 8 },
  label: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1, marginTop: 8 },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  btn: { minHeight: 50, backgroundColor: colors.gold, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  forgotBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  forgotText: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  backBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  error: { color: colors.red, fontSize: 13, marginTop: 8 },
  notice: { marginTop: 8, padding: 12, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md },
  noticeTitle: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  noticeText: { color: colors.grey2, fontSize: 13, lineHeight: 19, marginTop: 5 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { color: colors.grey2, fontSize: 14 },
  footerLinkTarget: { minHeight: 44, justifyContent: 'center' },
  footerLink: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  disabledSoft: { opacity: 0.45 },
});
