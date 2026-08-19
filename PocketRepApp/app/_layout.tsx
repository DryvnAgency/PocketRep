import { useEffect, useState, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/constants/theme';
import { setupNotificationHandler } from '@/lib/notifications';
import { shouldUseNewUi } from '@/lib/featureFlags';
import NewUiShell from '@/components/NewUiShell';
import ResetPasswordWeb from '@/components/ResetPasswordWeb';
import { supabase } from '@/lib/supabase';
import { clearLocalSessionState } from '@/lib/v2/localSessionClear';
import { log } from '@/lib/v2/logger';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) { log.error('error-boundary', error.message, { name: error.name, stack: error.stack, componentStack: info?.componentStack }); }
  render() {
    if (this.state.error) return <View style={eb.wrap}><Text style={eb.icon}>⚡</Text><Text style={eb.title}>Something went wrong</Text><Text style={eb.msg}>{this.state.error.message}</Text><TouchableOpacity style={eb.btn} onPress={() => this.setState({ error: null })}><Text style={eb.btnText}>Try again</Text></TouchableOpacity></View>;
    return this.props.children;
  }
}
const eb = StyleSheet.create({ wrap: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, icon: { fontSize: 40, marginBottom: spacing.md }, title: { fontSize: 20, fontWeight: '700', color: colors.white, marginBottom: spacing.sm }, msg: { fontSize: 13, color: colors.grey2, textAlign: 'center', marginBottom: spacing.xl }, btn: { backgroundColor: colors.gold, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 } });

export default function RootLayout() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname === '/reset-password') {
    return <ErrorBoundary><StatusBar style="light" backgroundColor={colors.ink} /><ResetPasswordWeb /></ErrorBoundary>;
  }
  if (shouldUseNewUi()) return <ErrorBoundary><StatusBar style="light" backgroundColor={colors.ink} /><NewUiShell /></ErrorBoundary>;
  return <V1RootLayout />;
}

function V1RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setupNotificationHandler(); }, []);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => { if (!cancelled) { setSignedIn(!!session?.user); setReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (!cancelled) { setSignedIn(!!session?.user); setReady(true); } });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!signedIn && !inAuth) router.replace('/(auth)');
    if (signedIn && inAuth) router.replace('/(tabs)');
  }, [ready, signedIn, segments, router]);
  if (!ready) return <ErrorBoundary><StatusBar style="light" backgroundColor={colors.ink} /><View style={eb.wrap}><Text style={eb.msg}>Checking your session…</Text></View></ErrorBoundary>;
  return <ErrorBoundary><StatusBar style="light" backgroundColor={colors.ink} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}><Stack.Screen name="(auth)" /><Stack.Screen name="(tabs)" /></Stack></ErrorBoundary>;
}
