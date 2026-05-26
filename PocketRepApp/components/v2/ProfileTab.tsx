import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, Pill, SectionHead } from './atoms';
import { supabase } from '@/lib/supabase';
import {
  getAlwaysListenEnabled,
  setAlwaysListenEnabled,
} from '@/lib/v2/rexSettings';

type ProfileRow = { email: string; full_name: string | null; plan: string };

function Row({
  icon, label, detail, danger, chevron = true,
}: {
  icon: string;
  label: string;
  detail?: string;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [
      styles.row,
      pressed && { backgroundColor: colors.goldBg },
    ]}>
      <View style={[
        styles.rowIcon,
        danger
          ? { backgroundColor: colors.redBg, borderColor: colors.redBorder }
          : { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
      ]}>
        <Text style={{ color: danger ? colors.red : colors.gold, fontSize: 14 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.red }]}>{label}</Text>
      </View>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      {chevron ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

export default function ProfileTab() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [alwaysListen, setAlwaysListen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setAlwaysListen(getAlwaysListenEnabled());
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('profiles')
        .select('email,full_name,plan')
        .eq('id', user.id)
        .maybeSingle();
      if (data && !cancelled) setProfile(data as ProfileRow);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleListen = (next: boolean) => {
    setAlwaysListen(next);
    setAlwaysListenEnabled(next);
  };

  const displayName = profile?.full_name?.trim() || 'Jake Morales';
  const planLabel = (profile?.plan ?? 'pro').toUpperCase();

  return (
    <View style={styles.root}>
      <View style={styles.heroCard}>
        <Avatar name={displayName} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroSub}>BMW of Pleasanton · Senior Advisor</Text>
          <View style={styles.heroPills}>
            <Pill color={colors.gold}>{planLabel}</Pill>
            <Pill color={colors.green}>34 MO STREAK</Pill>
          </View>
        </View>
      </View>

      <View style={styles.planCard}>
        <View style={{ flex: 1 }}>
          <Label color={colors.grey2}>PLAN · {planLabel} ANNUAL</Label>
          <Text style={styles.planRenews}>Renews Aug 12, 2026</Text>
        </View>
        <View style={styles.manageBtn}>
          <Text style={styles.manageText}>MANAGE</Text>
        </View>
      </View>

      <SectionHead label="COMPENSATION" color={colors.gold} />
      <View style={styles.group}>
        <Row icon="💵" label="Pay plan" detail="Edit" />
        <Row icon="📈" label="Commission MTD" detail="$4,280" />
      </View>

      <SectionHead label="WORKSPACE" color={colors.grey2} />
      <View style={styles.group}>
        <Row icon="🏢" label="Dealership" detail="Pleasanton" />
        <Row icon="🚗" label="Inventory feed" detail="Synced 4m ago" />
        <Row icon="🔔" label="Weekly digest" detail="Mon 7AM" />
        <Row icon="📊" label="Goals & quota" detail="22 / 32" />
      </View>

      <SectionHead label="REX" color={colors.gold} />
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: colors.goldBg, borderColor: colors.goldBorder }]}>
            <Text style={{ color: colors.gold, fontSize: 14 }}>🎙</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowLabel}>Always listen for “Hey Rex”</Text>
            <Text style={styles.rowSub}>Wake word + 4s silence trigger</Text>
          </View>
          <Switch
            value={alwaysListen}
            onValueChange={toggleListen}
            trackColor={{ false: colors.ink4, true: colors.gold }}
            thumbColor={alwaysListen ? colors.ink : colors.grey2}
          />
        </View>
        <Row icon="🤖" label="Voice & tone" detail="Direct" />
        <Row icon="🔐" label="Data sources" detail="3 connected" />
        <Row icon="📝" label="Custom prompts" detail="7 saved" />
      </View>

      <SectionHead label="LEARN" color={colors.gold} />
      <Pressable style={styles.learnCard}>
        <View style={styles.learnPlay}>
          <Text style={styles.learnPlayIcon}>▶</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.learnTitle}>Sales rep playbook</Text>
          <Text style={styles.learnHint}>8 steps · 5 min · maximize your day</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.gold }]}>›</Text>
      </Pressable>

      <SectionHead label="ACCOUNT" color={colors.grey2} />
      <View style={styles.group}>
        <Row icon="✉" label="Email" detail={profile?.email ?? '—'} />
        <Row icon="📱" label="Phone" detail="(925) ••• 4421" />
        <Row icon="🔒" label="Security" detail="Face ID" />
        <Row icon="↗" label="Refer a rep" detail="$50 each" />
      </View>

      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={styles.signOut}
      >
        <Row icon="↩" label="Sign out" danger chevron={false} />
      </Pressable>

      <Text style={styles.footer}>PocketRep v3.2.4 · build 1042</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 30 },

  heroCard: {
    margin: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroName: { fontSize: 18, fontWeight: '700', color: colors.white, letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: colors.grey2, marginTop: 3 },
  heroPills: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },

  planCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  planRenews: { fontSize: 13, color: colors.grey3, marginTop: 6 },
  manageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.full,
  },
  manageText: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 1.0 },

  group: {
    marginHorizontal: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.white, letterSpacing: -0.1 },
  rowSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  rowDetail: { fontSize: 13, color: colors.grey2 },
  chevron: { color: colors.grey, fontSize: 14 },

  learnCard: {
    marginHorizontal: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  learnPlay: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnPlayIcon: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  learnTitle: { fontSize: 14, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  learnHint: { fontSize: 11, color: colors.gold, marginTop: 3, letterSpacing: 0.3 },

  signOut: {
    marginHorizontal: 14,
    marginTop: 24,
    marginBottom: 8,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  footer: {
    textAlign: 'center',
    paddingVertical: 10,
    fontSize: 11,
    color: colors.grey,
    fontFamily: 'Menlo',
  },
});
