import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { generateQueue, markSentAndLog, markSkipped, type QueueItem } from '@/lib/messageQueue';
import { launchSms } from '@/lib/v2/smsLauncher';
import { supabase } from '@/lib/supabase';

function channelLabel(channel: QueueItem['channel']) {
  if (channel === 'text') return 'TEXT';
  if (channel === 'call') return 'CALL';
  return 'EMAIL';
}

async function launchChannel(item: QueueItem): Promise<boolean> {
  if (item.isDemo) return true;
  if (item.channel === 'text') return (await launchSms({
    contact_id: item.contact_id,
    contact_name: item.contact_name,
    phone: item.phone,
    message: item.message,
    isDemo: item.isDemo,
  })) === 'opened';

  if (item.channel === 'email') {
    const email = (item.email ?? '').trim();
    if (!email) return false;
    try {
      await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(`Follow-up with ${item.contact_name}`)}&body=${encodeURIComponent(item.message)}`);
      return true;
    } catch {
      return false;
    }
  }

  const digits = (item.phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return false;
  try {
    await Linking.openURL(`tel:${digits}`);
    return true;
  } catch {
    return false;
  }
}

export default function FollowUpQueue() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setItems([]); return; }
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle();
      const plan = String(profile?.plan ?? 'pro');
      const next = await generateQueue(user.id, plan);
      setItems(next);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load follow-ups.');
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (item: QueueItem, action: 'work' | 'skip') => {
    const key = `${item.contact_id}:${item.sequence_id}:${item.step_number}`;
    setBusyKey(key);
    setError(null);
    try {
      if (action === 'work') {
        const opened = await launchChannel(item);
        if (!opened) throw new Error(`Couldn't open ${item.channel}. Check the contact's ${item.channel === 'email' ? 'email address' : 'phone number'}.`);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You are signed out.');
      if (action === 'skip') await markSkipped(item, user.id);
      else await markSentAndLog(item, user.id);
      setItems(prev => (prev ?? []).filter(x => x !== item));
    } catch (e: any) {
      setError(e?.message ?? 'That follow-up could not be completed.');
    } finally {
      setBusyKey(null);
    }
  };

  if (items === null) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SEQUENCE FOLLOW-UPS</Text>
          <Text style={styles.title}>{items.length ? `${items.length} ready to work` : 'You’re caught up'}</Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refresh} accessibilityRole="button" accessibilityLabel="Refresh follow-ups">
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <Text style={styles.empty}>Enroll customers in a sequence and their due steps will appear here.</Text>
      ) : (
        items.map(item => {
          const key = `${item.contact_id}:${item.sequence_id}:${item.step_number}`;
          const busy = busyKey === key;
          return (
            <View key={key} style={styles.card}>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{item.contact_name || 'Unnamed customer'}</Text>
                    {item.isDemo ? <Text style={styles.demo}>DEMO</Text> : null}
                  </View>
                  <Text style={styles.meta}>STEP {item.step_number} · {channelLabel(item.channel)} · DUE {item.due_date}</Text>
                </View>
              </View>
              <Text style={styles.message} numberOfLines={4}>{item.message || 'No message template — work this step manually.'}</Text>
              <View style={styles.actions}>
                <Pressable disabled={busy} onPress={() => void act(item, 'skip')} style={styles.skip}>
                  <Text style={styles.skipText}>Skip</Text>
                </Pressable>
                <Pressable disabled={busy} onPress={() => void act(item, 'work')} style={styles.work}>
                  <Text style={styles.workText}>{busy ? 'Working…' : item.isDemo ? 'Simulate' : `Work ${channelLabel(item.channel)}`}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 14, marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 17, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  refresh: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.gold, fontSize: 20, fontWeight: '700' },
  error: { color: colors.red, fontSize: 11, marginBottom: 8 },
  empty: { color: colors.grey2, fontSize: 12, lineHeight: 18, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, padding: 14 },
  card: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, padding: 14, marginBottom: 7 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  demo: { color: colors.gold, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  meta: { color: colors.grey, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, marginTop: 4 },
  message: { color: colors.grey2, fontSize: 12, lineHeight: 18, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  skip: { borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9 },
  skipText: { color: colors.grey2, fontSize: 12, fontWeight: '700' },
  work: { flex: 1, backgroundColor: colors.gold, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  workText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
});
