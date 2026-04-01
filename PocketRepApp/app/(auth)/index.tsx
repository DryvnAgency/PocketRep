import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';

// Supabase requires an email — we derive one from the username transparently
function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@pocketrep.app`;
}

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username || !password) {
      Alert.alert('Fill in both fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', 'Username or password is incorrect.');
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <View style={s.logoMark}>
            <Text style={s.logoMarkText}>P</Text>
          </View>
          <Text style={s.logoText}>Pocket<Text style={{ color: colors.gold }}>Rep</Text></Text>
        </View>

        <Text style={s.headline}>Welcome back, closer.</Text>
        <Text style={s.sub}>Sign in to your book.</Text>

        <View style={s.form}>
          <Text style={s.label}>Username</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Your username"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.grey}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color={colors.ink} />
              : <Text style={s.btnText}>Sign In →</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>No account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={s.footerLink}>Start free trial</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.xxl },
  logoMark: {
    width: 38, height: 38, borderRadius: radius.sm,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  logoMarkText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  logoText: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.5 },
  headline: { fontSize: 28, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginBottom: 6 },
  sub: { fontSize: 15, color: colors.grey2, marginBottom: spacing.xxl },
  form: { gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: colors.grey3, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm,
    padding: spacing.md,
    color: colors.white, fontSize: 15,
  },
  btn: {
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    padding: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.grey2, fontSize: 14 },
  footerLink: { color: colors.gold, fontWeight: '600', fontSize: 14 },
});
