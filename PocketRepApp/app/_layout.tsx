import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
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
    <>
      <StatusBar style="light" backgroundColor={colors.ink} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
