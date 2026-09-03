import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';

const RESET_REDIRECT_URL = 'https://app.pocketrep.pro/reset-password';

function readRecoveryUrlState(): { hasRecoveryToken: boolean; error: string | null } {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { hasRecoveryToken: false, error: null };
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const errorDescription = hash.get('error_description') ?? query.get('error_description');
  const type = hash.get('type') ?? query.get('type');
  const hasToken = Boolean(hash.get('access_token') || query.get('code') || query.get('token_hash'));

  return {
    hasRecoveryToken: type === 'recovery' && hasToken,
    error: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : null,
  };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;
    const urlState = readRecoveryUrlState();
    if (urlState.error && active) setRecoveryError(urlState.error);

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setRecoveryReady(true);
        setRecoveryError(null);
        setCheckingRecovery(false);
      }
    });

    // The browser may finish parsing the recovery URL before React mounts.
    // Only accept an already-created session when this URL itself contains
    // recovery-token evidence, then verify the user with Supabase Auth.
    if (urlState.hasRecoveryToken) {
      supabase.auth.getUser().then(({ data, error }) => {
        if (!active) return;
        if (!error && data.user) {
          setRecoveryReady(true);
          setRecoveryError(null);
        } else if (!urlState.error) {
          setRecoveryError('This reset link is invalid or has expired. Request a new one below.');
        }
        setCheckingRecovery(false);
      });
    } else {
      setCheckingRecovery(false);
    }

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendReset() {
    const value = email.trim().toLowerCase();
    if (!value || !value.includes('@')) { Alert.alert('Enter your account email'); return; }
    setLoading(true);
    setRequestSent(false);
    setRecoveryError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(value, {
      redirectTo: RESET_REDIRECT_URL,
    });
    setLoading(false);
    // Deliberately use the same confirmation for existing and unknown emails.
    if (error) { Alert.alert('Unable to send reset email', 'Please try again in a moment.'); return; }
    setRequestSent(true);
  }

  async function updatePassword() {
    if (!recoveryReady) {
      setRecoveryError('Open a fresh PocketRep reset link from your email before choosing a new password.');
      return;
    }
    if (newPassword.length < 8) { Alert.alert('Password too short', 'Use at least 8 characters.'); return; }
    if (newPassword !== confirm) { Alert.alert('Passwords do not match'); return; }

    setUpdating(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setUpdating(false);
      Alert.alert('Could not update password', error.message);
      return;
    }

    // Recovery links create a temporary authenticated session. End it after
    // the password changes so the user proves the new password on sign-in.
    await supabase.auth.signOut();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, '/reset-password');
    }
    setRecoveryReady(false);
    setUpdating(false);
    setUpdated(true);
  }

  if (checkingRecovery) {
    return <View style={s.root}><View style={s.container}><ActivityIndicator color={colors.gold} /></View></View>;
  }

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.container}>
      <View style={s.logoWrap}><View style={s.logoMark}><Text style={s.logoMarkText}>P</Text></View><Text style={s.logoText}>Pocket<Text style={{color:colors.gold}}>Rep</Text></Text></View>

      {updated ? <>
        <Text style={s.title}>Password updated.</Text>
        <Text style={s.sub}>Your new PocketRep password is saved. Sign in with it to get back to your book.</Text>
        <TouchableOpacity style={s.btn} onPress={() => router.replace('/(auth)')}>
          <Text style={s.btnText}>Go to Sign In →</Text>
        </TouchableOpacity>
      </> : recoveryReady ? <>
        <Text style={s.title}>Create a new password.</Text>
        <Text style={s.sub}>Choose a new password for your PocketRep account.</Text>
        <Text style={s.label}>New password</Text>
        <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} placeholder="At least 8 characters" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
        <Text style={s.label}>Confirm password</Text>
        <TextInput style={s.input} value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
        <TouchableOpacity style={s.btn} onPress={updatePassword} disabled={updating}>{updating ? <ActivityIndicator color={colors.ink}/> : <Text style={s.btnText}>Save New Password →</Text>}</TouchableOpacity>
      </> : <>
        <Text style={s.title}>Reset your password.</Text>
        <Text style={s.sub}>Enter the email tied to your account and we’ll send a secure PocketRep reset link.</Text>
        {recoveryError ? <View style={s.errorNotice}><Text style={s.errorTitle}>Reset link unavailable</Text><Text style={s.noticeText}>{recoveryError}</Text></View> : null}
        <Text style={s.label}>Account email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
        <TouchableOpacity style={s.btn} onPress={sendReset} disabled={loading}>{loading ? <ActivityIndicator color={colors.ink}/> : <Text style={s.btnText}>Send Reset Link →</Text>}</TouchableOpacity>
        {requestSent ? <View style={s.notice}><Text style={s.noticeTitle}>Check your email</Text><Text style={s.noticeText}>If that email is registered, we sent a secure reset link. Open that link on this device to choose your new password.</Text></View> : null}
      </>}

      {!updated ? <TouchableOpacity onPress={() => router.replace('/(auth)')} style={s.back}><Text style={s.backText}>← Back to sign in</Text></TouchableOpacity> : null}
    </View>
  </KeyboardAvoidingView>;
}

const s=StyleSheet.create({root:{flex:1,backgroundColor:colors.ink},container:{flex:1,justifyContent:'center',padding:spacing.xl},logoWrap:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.xxl},logoMark:{width:38,height:38,borderRadius:radius.sm,backgroundColor:colors.gold,alignItems:'center',justifyContent:'center'},logoMarkText:{color:colors.ink,fontWeight:'800',fontSize:18},logoText:{fontSize:22,fontWeight:'700',color:colors.white,letterSpacing:-.5},title:{fontSize:28,fontWeight:'800',color:colors.white,letterSpacing:-.5,marginBottom:8},sub:{fontSize:15,lineHeight:21,color:colors.grey2,marginBottom:spacing.xl},label:{fontSize:12,fontWeight:'600',color:colors.grey3,letterSpacing:.5,textTransform:'uppercase',marginTop:spacing.sm,marginBottom:6},input:{backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.sm,padding:spacing.md,color:colors.white,fontSize:15},btn:{backgroundColor:colors.gold,borderRadius:radius.sm,padding:spacing.md+2,alignItems:'center',marginTop:spacing.lg},btnText:{color:colors.ink,fontWeight:'700',fontSize:15},notice:{marginTop:spacing.lg,padding:spacing.md,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,borderRadius:radius.md},errorNotice:{marginBottom:spacing.md,padding:spacing.md,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.red,borderRadius:radius.md},noticeTitle:{color:colors.gold,fontWeight:'800',fontSize:14},errorTitle:{color:colors.red,fontWeight:'800',fontSize:14},noticeText:{color:colors.grey2,fontSize:13,lineHeight:19,marginTop:5},back:{alignItems:'center',marginTop:spacing.xl,padding:8},backText:{color:colors.gold,fontWeight:'600',fontSize:13}});
