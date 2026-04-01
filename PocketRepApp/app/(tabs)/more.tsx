import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Profile } from '@/lib/types';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';
const REX_MODEL = 'claude-haiku-4-5-20251001';

export default function MoreScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) setProfile(data);
  }

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  async function exportBook() {
    setExportLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setExportLoading(false); return; }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('first_name,last_name,phone,email,vehicle_year,vehicle_make,vehicle_model,mileage,notes,last_contact_date')
      .eq('user_id', user.id);

    if (!contacts?.length) {
      Alert.alert('No contacts', 'Add contacts to your book first.');
      setExportLoading(false);
      return;
    }

    const csv = [
      'First,Last,Phone,Email,Year,Make,Model,Mileage,Last Contact,Notes',
      ...contacts.map(c =>
        [c.first_name, c.last_name, c.phone, c.email, c.vehicle_year, c.vehicle_make,
          c.vehicle_model, c.mileage, c.last_contact_date, `"${(c.notes ?? '').replace(/"/g, '""')}"`
        ].join(',')
      ),
    ].join('\n');

    // Show preview (in a real build, use expo-sharing to export the file)
    Alert.alert('Book export ready', `${contacts.length} contacts\n\nIn a production build this saves to Files. CSV preview:\n\n${csv.slice(0, 200)}…`);
    setExportLoading(false);
  }

  async function buildDigest() {
    if (!ANTHROPIC_KEY) {
      Alert.alert('Anthropic key needed', 'Add ANTHROPIC_KEY to .env for the weekly digest.');
      return;
    }
    setDigestLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDigestLoading(false); return; }

    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [{ data: contacts }, { data: deals }, { data: msgs }] = await Promise.all([
      supabase.from('contacts').select('id,first_name,last_name,heat_tier').eq('user_id', user.id).gte('created_at', oneWeekAgo),
      supabase.from('deals').select('title,front_gross,back_gross,amount').eq('user_id', user.id).gte('created_at', oneWeekAgo),
      supabase.from('rex_messages').select('id').eq('user_id', user.id).gte('created_at', oneWeekAgo),
    ]);

    const totalDeals = deals?.length ?? 0;
    const totalFront = deals?.reduce((s, d) => s + (d.front_gross ?? 0), 0) ?? 0;
    const totalBack = deals?.reduce((s, d) => s + (d.back_gross ?? 0), 0) ?? 0;
    const newContacts = contacts?.length ?? 0;
    const rexConvos = Math.round((msgs?.length ?? 0) / 2);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: REX_MODEL,
        max_tokens: 350,
        messages: [{
          role: 'user',
          content:
            `Write a short weekly digest for a sales rep. Be motivating, direct, data-first. No fluff.\n\n` +
            `Deals logged: ${totalDeals} | Front gross: $${totalFront} | Back gross: $${totalBack}\n` +
            `New contacts added: ${newContacts} | Rex conversations: ${rexConvos}\n` +
            `Rep name: ${profile?.full_name ?? 'Rep'}\n\n` +
            `Format: 3 bullet points covering week highlights + one sharp coaching line at the end.`,
        }],
      }),
    });
    const json = await res.json();
    setDigest(json.content?.[0]?.text ?? 'Could not generate digest.');
    setDigestLoading(false);
  }

  // Treat any non-elite as 'pro'
  const isElite = profile?.plan === 'elite';
  const planLabel = isElite ? 'Elite' : 'Pro';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>More</Text>
      </View>

      {/* Profile card */}
      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{profile?.full_name?.[0] ?? '?'}</Text>
        </View>
        <View>
          <Text style={s.profileName}>{profile?.full_name || 'Your Name'}</Text>
          <Text style={s.profileEmail}>{profile?.email}</Text>
          <View style={s.planBadge}>
            <Text style={s.planBadgeText}>{planLabel.toUpperCase()} PLAN</Text>
          </View>
        </View>
      </View>

      {/* Trial info */}
      {profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date() ? (
        <View style={s.trialBanner}>
          <Text style={s.trialText}>
            🎉 Trial ends {new Date(profile.trial_ends_at).toLocaleDateString()} — no charge before then
          </Text>
        </View>
      ) : null}

      {/* Weekly Digest — Elite only */}
      <Text style={s.section}>Performance</Text>
      {isElite ? (
        <>
          <TouchableOpacity style={s.row} onPress={buildDigest} disabled={digestLoading} activeOpacity={0.8}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>📊</Text>
              <View>
                <Text style={s.rowTitle}>Weekly Digest</Text>
                <Text style={s.rowSub}>Rex reviews your week and coaches you</Text>
              </View>
            </View>
            {digestLoading ? <ActivityIndicator color={colors.gold} /> : <Text style={s.rowArrow}>→</Text>}
          </TouchableOpacity>
          {digest ? (
            <View style={s.digestBox}>
              <Text style={s.digestText}>{digest}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={[s.row, s.rowLocked]}>
          <View style={s.rowLeft}>
            <Text style={s.rowIcon}>📊</Text>
            <View>
              <Text style={s.rowTitle}>Weekly Digest</Text>
              <Text style={s.rowSub}>Rex reviews your week</Text>
            </View>
          </View>
          <View style={s.eliteBadge}><Text style={s.eliteBadgeText}>ELITE</Text></View>
        </View>
      )}

      {/* Data */}
      <Text style={s.section}>Your Data</Text>
      <TouchableOpacity style={s.row} onPress={exportBook} disabled={exportLoading} activeOpacity={0.8}>
        <View style={s.rowLeft}>
          <Text style={s.rowIcon}>📤</Text>
          <View>
            <Text style={s.rowTitle}>Export Contact Book</Text>
            <Text style={s.rowSub}>Download full CSV — your data, always</Text>
          </View>
        </View>
        {exportLoading ? <ActivityIndicator color={colors.gold} /> : <Text style={s.rowArrow}>→</Text>}
      </TouchableOpacity>

      {/* Account */}
      <Text style={s.section}>Account</Text>
      <TouchableOpacity style={s.row} onPress={signOut} activeOpacity={0.8}>
        <View style={s.rowLeft}>
          <Text style={s.rowIcon}>🚪</Text>
          <View>
            <Text style={[s.rowTitle, { color: colors.red }]}>Sign Out</Text>
          </View>
        </View>
        <Text style={s.rowArrow}>→</Text>
      </TouchableOpacity>

      {/* Footer */}
      <Text style={s.footer}>PocketRep · The rep's edge, not the store's</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  content: { paddingBottom: 48 },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: spacing.lg,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.ink4,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.gold, fontWeight: '800', fontSize: 20 },
  profileName: { fontSize: 16, fontWeight: '700', color: colors.white },
  profileEmail: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  planBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
    alignSelf: 'flex-start', marginTop: 6,
  },
  planBadgeText: { color: colors.gold2, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  trialBanner: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.greenBg, borderWidth: 1, borderColor: colors.greenBorder,
    borderRadius: radius.sm, padding: spacing.md,
  },
  trialText: { color: colors.green, fontSize: 12, fontWeight: '600' },
  section: {
    fontSize: 11, fontWeight: '700', color: colors.gold,
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: spacing.lg, marginBottom: spacing.xs, marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, marginHorizontal: spacing.lg,
    borderRadius: radius.md, padding: spacing.md, marginBottom: 2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  rowLocked: { opacity: 0.5 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.white },
  rowSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  rowArrow: { color: colors.grey, fontSize: 16 },
  eliteBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  eliteBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  digestBox: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.ink3, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.ink4,
  },
  digestText: { color: colors.grey3, fontSize: 13, lineHeight: 21 },
  footer: {
    textAlign: 'center', color: colors.grey, fontSize: 11,
    marginTop: spacing.xxl, paddingHorizontal: spacing.lg,
  },
});
