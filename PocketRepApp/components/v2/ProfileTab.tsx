import { useEffect, useReducer, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, Pill, SectionHead } from './atoms';
import { supabase } from '@/lib/supabase';
import {
  getAlwaysListenEnabled,
  setAlwaysListenEnabled,
} from '@/lib/v2/rexSettings';
import {
  getRepSetting,
  setRepSetting,
  subscribeRepSettings,
  type RepSettingKey,
} from '@/lib/v2/repSettings';
import { sendTestPush } from '@/lib/v2/pushNotifications';
import { usePayPlan } from '@/lib/v2/payPlan';
import PayPlanSummary from './PayPlanSummary';
import SettingEditSheet, { type SettingEditConfig } from './SettingEditSheet';
import type { TabId } from './CustomNavBar';

type ProfileRow = { email: string; full_name: string | null; plan: string };

// `name` is a pseudo-key that maps to profiles.full_name; the rest map to repSettings.
type EditKey = RepSettingKey | 'name';

function Row({
  icon, label, detail, danger, chevron = true, onPress,
}: {
  icon: string;
  label: string;
  detail?: string;
  danger?: boolean;
  chevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && { backgroundColor: colors.goldBg },
      ]}
    >
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
      {detail ? <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text> : null}
      {chevron ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

export default function ProfileTab({
  onOpenGamePlan,
  onReplayOnboarding,
  onOpenPayPlan,
  onNavigate,
  payPlanRefetchKey = 0,
}: {
  onOpenGamePlan?: () => void;
  onReplayOnboarding?: () => void;
  onOpenPayPlan?: () => void;
  onNavigate?: (tab: TabId) => void;
  payPlanRefetchKey?: number;
} = {}) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [alwaysListen, setAlwaysListen] = useState<boolean>(false);
  const [editTarget, setEditTarget] = useState<{ key: EditKey; config: SettingEditConfig } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const payPlan = usePayPlan(payPlanRefetchKey);

  useEffect(() => {
    let cancelled = false;
    setAlwaysListen(getAlwaysListenEnabled());
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('email,full_name,plan')
        .eq('id', user.id)
        .maybeSingle();
      if (data && !cancelled) setProfile(data as ProfileRow);
    })();
    const unsub = subscribeRepSettings(forceTick);
    return () => { cancelled = true; unsub(); };
  }, []);

  const toggleListen = (next: boolean) => {
    setAlwaysListen(next);
    setAlwaysListenEnabled(next);
  };

  const editSetting = (key: RepSettingKey, title: string, label: string, extra?: Partial<SettingEditConfig>) => {
    setEditTarget({ key, config: { title, label, value: getRepSetting(key), ...extra } });
  };

  const editName = () => {
    setEditTarget({
      key: 'name',
      config: { title: 'Your name', label: 'FULL NAME', value: profile?.full_name ?? '', placeholder: 'Jake Morales' },
    });
  };

  const handleSettingSave = (value: string) => {
    if (!editTarget) return;
    if (editTarget.key === 'name') {
      setProfile(p => (p ? { ...p, full_name: value } : p));
      if (userId) {
        supabase.from('profiles').update({ full_name: value }).eq('id', userId)
          .then(undefined, (e: any) => console.warn('save name failed', e));
      }
    } else {
      setRepSetting(editTarget.key, value);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch { /* ignore */ }
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  const displayName = profile?.full_name?.trim() || 'Jake Morales';
  const planLabel = (profile?.plan ?? 'pro').toUpperCase();
  const dealership = getRepSetting('dealership');
  const title = getRepSetting('title');
  const referLink = `https://app.pocketrep.pro/?ref=${encodeURIComponent(profile?.email ?? 'rep')}`;

  return (
    <View style={styles.root}>
      <Pressable onPress={editName} style={styles.heroCard}>
        <Avatar name={displayName} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroSub}>{dealership} · {title}</Text>
          <View style={styles.heroPills}>
            <Pill color={colors.gold}>{planLabel}</Pill>
            <Pill color={colors.green}>34 MO STREAK</Pill>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <View style={styles.planCard}>
        <View style={{ flex: 1 }}>
          <Label color={colors.grey2}>PLAN · {planLabel} ANNUAL</Label>
          <Text style={styles.planRenews}>Renews Aug 12, 2026</Text>
        </View>
        <Pressable onPress={() => onOpenPayPlan?.()} style={styles.manageBtn}>
          <Text style={styles.manageText}>MANAGE</Text>
        </Pressable>
      </View>

      <SectionHead label="COMPENSATION" color={colors.gold} />
      {payPlan ? (
        <PayPlanSummary plan={payPlan} onEdit={() => onOpenPayPlan?.()} />
      ) : null}
      <View style={[styles.group, { marginTop: 8 }]}>
        <Row icon="◐" label="Game Plan" detail="Sequences & templates" onPress={onOpenGamePlan} />
      </View>

      <SectionHead label="WORKSPACE" color={colors.grey2} />
      <View style={styles.group}>
        <Row icon="🏢" label="Dealership" detail={dealership}
          onPress={() => editSetting('dealership', 'Dealership', 'DEALERSHIP')} />
        <Row icon="🚗" label="Inventory feed" detail={getRepSetting('inventoryFeed')}
          onPress={() => editSetting('inventoryFeed', 'Inventory feed', 'FEED STATUS / SOURCE')} />
        <Row icon="🔔" label="Weekly digest" detail="View →" onPress={() => onNavigate?.('heat')} />
        <Row icon="📊" label="Goals & quota" detail="22 / 32" onPress={() => onNavigate?.('metrics')} />
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
        <Row icon="🤖" label="Voice & tone" detail={getRepSetting('voiceTone')}
          onPress={() => editSetting('voiceTone', 'Voice & tone', 'HOW SHOULD REX SOUND?')} />
        <Row icon="🔐" label="Data sources" detail={getRepSetting('dataSources')}
          onPress={() => editSetting('dataSources', 'Data sources', 'CONNECTED SOURCES')} />
        <Row icon="📝" label="Custom prompts" detail={getRepSetting('customPrompts')}
          onPress={() => editSetting('customPrompts', 'Custom prompts', 'YOUR SAVED PROMPTS', { multiline: true })} />
        <Pressable
          onPress={async () => {
            const result = await sendTestPush();
            console.log('[push] test result', result);
          }}
        >
          <Row icon="🔔" label="Send a test push" detail="ping →" chevron={false} />
        </Pressable>
      </View>

      <SectionHead label="LEARN" color={colors.gold} />
      <Pressable onPress={onReplayOnboarding} style={styles.learnCard}>
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
        <Row icon="✉" label="Email" detail={profile?.email ?? '—'}
          onPress={() => profile?.email && copy(profile.email, 'Email copied')} />
        <Row icon="📱" label="Phone" detail={getRepSetting('phone')}
          onPress={() => editSetting('phone', 'Phone', 'PHONE NUMBER', { keyboardType: 'phone-pad' })} />
        <Row icon="🔒" label="Security" detail={getRepSetting('security')}
          onPress={() => editSetting('security', 'Security', 'SIGN-IN METHOD')} />
        <Row icon="↗" label="Refer a rep" detail="$50 each"
          onPress={() => copy(referLink, 'Referral link copied')} />
      </View>

      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={styles.signOut}
      >
        <Row icon="↩" label="Sign out" danger chevron={false} />
      </Pressable>

      <Text style={styles.footer}>PocketRep v3.2.4 · build 1042</Text>

      {copied ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>✓ {copied}</Text>
        </View>
      ) : null}

      <SettingEditSheet
        config={editTarget?.config ?? null}
        onSave={handleSettingSave}
        onClose={() => setEditTarget(null)}
      />
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
  rowDetail: { fontSize: 13, color: colors.grey2, maxWidth: 160 },
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

  toast: {
    position: 'absolute',
    left: 0, right: 0, bottom: 40,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: colors.ink3,
    borderWidth: 1,
    borderColor: colors.gold,
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
