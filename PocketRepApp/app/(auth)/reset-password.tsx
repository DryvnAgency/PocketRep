import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [canSetPassword, setCanSetPassword] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setCanSetPassword(!!data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setCanSetPassword(!!session); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function sendReset() {
    const value = email.trim().toLowerCase();
    if (!value || !value.includes('@')) { Alert.alert('Enter your account email'); return; }
    setLoading(true);
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(value, redirectTo ? { redirectTo } : undefined);
    setLoading(false);
    // Deliberately use the same confirmation for existing and unknown emails.
    // Supabase will only deliver mail when the address belongs to an account.
    if (error) { Alert.alert('Unable to send reset email', 'Please try again in a moment.'); return; }
    setRequestSent(true);
  }

  async function updatePassword() {
    if (newPassword.length < 8) { Alert.alert('Password too short', 'Use at least 8 characters.'); return; }
    if (newPassword !== confirm) { Alert.alert('Passwords do not match'); return; }
    setUpdating(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdating(false);
    if (error) { Alert.alert('Could not update password', error.message); return; }
    Alert.alert('Password updated', 'Your PocketRep password has been changed.', [{ text: 'Sign in', onPress: () => router.replace('/(auth)') }]);
  }

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.container}>
      <View style={s.logoWrap}><View style={s.logoMark}><Text style={s.logoMarkText}>P</Text></View><Text style={s.logoText}>Pocket<Text style={{color:colors.gold}}>Rep</Text></Text></View>
      <Text style={s.title}>{canSetPassword ? 'Set a new password.' : 'Reset your password.'}</Text>
      <Text style={s.sub}>{canSetPassword ? 'Choose a new password for your PocketRep account.' : 'Enter the email tied to your account and we’ll send a reset link if an account exists.'}</Text>
      {!canSetPassword ? <>
        <Text style={s.label}>Account email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
        <TouchableOpacity style={s.btn} onPress={sendReset} disabled={loading}>{loading ? <ActivityIndicator color={colors.ink}/> : <Text style={s.btnText}>Send Reset Link →</Text>}</TouchableOpacity>
        {requestSent ? <View style={s.notice}><Text style={s.noticeTitle}>Check your email</Text><Text style={s.noticeText}>If that email is registered, PocketRep sent a password reset link. If it isn't registered, nothing was sent.</Text></View> : null}
      </> : <>
        <Text style={s.label}>New password</Text>
        <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} placeholder="At least 8 characters" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
        <Text style={s.label}>Confirm password</Text>
        <TextInput style={s.input} value={confirm} onChangeText={setConfirm} placeholder="Re-enter password" placeholderTextColor={colors.grey} secureTextEntry autoComplete="new-password" />
        <TouchableOpacity style={s.btn} onPress={updatePassword} disabled={updating}>{updating ? <ActivityIndicator color={colors.ink}/> : <Text style={s.btnText}>Update Password →</Text>}</TouchableOpacity>
      </>}
      <TouchableOpacity onPress={() => router.replace('/(auth)')} style={s.back}><Text style={s.backText}>← Back to sign in</Text></TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:colors.ink},container:{flex:1,justifyContent:'center',padding:spacing.xl},logoWrap:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.xxl},logoMark:{width:38,height:38,borderRadius:radius.sm,backgroundColor:colors.gold,alignItems:'center',justifyContent:'center'},logoMarkText:{color:colors.ink,fontWeight:'800',fontSize:18},logoText:{fontSize:22,fontWeight:'700',color:colors.white,letterSpacing:-.5},title:{fontSize:28,fontWeight:'800',color:colors.white,letterSpacing:-.5,marginBottom:8},sub:{fontSize:15,lineHeight:21,color:colors.grey2,marginBottom:spacing.xl},label:{fontSize:12,fontWeight:'600',color:colors.grey3,letterSpacing:.5,textTransform:'uppercase',marginTop:spacing.sm,marginBottom:6},input:{backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.ink4,borderRadius:radius.sm,padding:spacing.md,color:colors.white,fontSize:15},btn:{backgroundColor:colors.gold,borderRadius:radius.sm,padding:spacing.md+2,alignItems:'center',marginTop:spacing.lg},btnText:{color:colors.ink,fontWeight:'700',fontSize:15},notice:{marginTop:spacing.lg,padding:spacing.md,backgroundColor:colors.goldBg,borderWidth:1,borderColor:colors.goldBorder,borderRadius:radius.md},noticeTitle:{color:colors.gold,fontWeight:'800',fontSize:14},noticeText:{color:colors.grey2,fontSize:13,lineHeight:19,marginTop:5},back:{alignItems:'center',marginTop:spacing.xl,padding:8},backText:{color:colors.gold,fontWeight:'600',fontSize:13}});
