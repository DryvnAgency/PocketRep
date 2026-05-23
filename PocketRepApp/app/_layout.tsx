import { useEffect, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/constants/theme';
import { setupNotificationHandler } from '@/lib/notifications';
import { shouldUseNewUi } from '@/lib/featureFlags';
import NewUiShell from '@/components/NewUiShell';

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
  // v2 UI port — gated by EXPO_PUBLIC_NEW_UI=1 (build-time) or ?v=2 (web).
  // While true, bypass the v1 auth/routing entirely. Production native users
  // see no change until cutover.
  if (shouldUseNewUi()) {
    return (
      <ErrorBoundary>
        <StatusBar style="light" backgroundColor={colors.ink} />
        <NewUiShell />
      </ErrorBoundary>
    );
  }
  return <V1RootLayout />;
}

function V1RootLayout() {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setupNotificationHandler();
  }, []);

  // Auth gate intentionally REMOVED for the v2 port phase (PR #26 scope
  // addition). SignIn / SignUp files still exist under app/(auth)/ but the
  // router never sends users there. If someone lands at /(auth) via a stale
  // bookmark or direct URL, bounce them into the tabs. Re-mount the auth
  // gate in a dedicated PR before shipping to real users.
  useEffect(() => {
    if (segments[0] === '(auth)') {
      router.replace('/(tabs)');
    }
  }, [segments, router]);

  return (
    <ErrorBoundary>
      <StatusBar style="light" backgroundColor={colors.ink} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ErrorBoundary>
  );
}
