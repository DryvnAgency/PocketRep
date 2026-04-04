import { useEffect, useState, Component } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { setupNotificationHandler } from '@/lib/notifications';

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error('App error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <View style={eb.wrap}>
          <Text style={eb.icon}>⚡</Text>
          <Text style={eb.title}>Something went wrong</Text>
          <Text style={eb.msg}>{this.state.error.message}</Text>
          <TouchableOpacity style={eb.btn} onPress={() => this.setState({ error: null })}>
            <Text style={eb.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const eb = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 40, marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  msg: { fontSize: 13, color: colors.grey2, textAlign: 'center', marginBottom: spacing.xl },
  btn: { backgroundColor: colors.gold, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  btnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Set up push notification display handler (must run before any scheduling)
    setupNotificationHandler();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/(auth)');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, ready, segments]);

  return (
    <ErrorBoundary>
      <StatusBar style="light" backgroundColor={colors.ink} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ErrorBoundary>
  );
}
