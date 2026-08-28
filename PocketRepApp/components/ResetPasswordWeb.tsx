import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/constants/theme';

export default function ResetPasswordWeb() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || !!session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const update = async () => {
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateErr) { setError('We could not update your password. The reset link may have expired.'); return; }
    setDone(true);
    setTimeout(() => { window.location.href = 'https://app.pocketrep.pro'; }, 900);
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.brandRow}><View style={styles.mark}><Text style={styles.markText}>P</Text></View><Text style={styles.wordmark}>Pocket<Text style={{ color: colors.gold }}>Rep</Text></Text></View>
        {done ? <>
          <Text style={styles.title}>Password updated.</Text>
          <Text style={styles.sub}>Taking you back into PocketRep…</Text>
        </> : <>
          <Text style={styles.title}>Reset your password.</Text>
          <Text style={styles.sub}>{ready ? 'Choose a new password for your PocketRep account.' : 'Open this page from the password reset email to continue.'}</Text>
          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="Re-enter your password" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, (!ready || busy) && { opacity: 0.6 }]} onPress={update} disabled={!ready || busy}>
            {busy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.btnText}>Update Password →</Text>}
          </Pressable>
          <Pressable style={styles.back} onPress={() => { window.location.href = 'https://app.pocketrep.pro'; }}><Text style={styles.backText}>← Back to sign in</Text></Pressable>
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  mark: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  wordmark: { fontSize: 22, fontWeight: '700', color: colors.white },
  title: { fontSize: 28, fontWeight: '800', color: colors.white, marginBottom: 8 },
  sub: { fontSize: 15, lineHeight: 21, color: colors.grey2, marginBottom: 24 },
  label: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, color: colors.white, fontSize: 15 },
  btn: { backgroundColor: colors.gold, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  btnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  error: { color: colors.red, fontSize: 13, marginTop: 10 },
  back: { alignItems: 'center', marginTop: 18, padding: 8 },
  backText: { color: colors.gold, fontWeight: '700', fontSize: 13 },
});
