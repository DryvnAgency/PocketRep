import { useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Share, Linking } from 'react-native';
import Constants from 'expo-constants';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, Pill, SectionHead } from './atoms';
import { supabase } from '@/lib/supabase';
import { signOutAndReset } from '@/lib/v2/localSessionClear';
import { shouldShowInstallRow } from './PWAInstallPrompt';
import {
  getRepSetting,
  setRepSetting,
  subscribeRepSettings,
  type RepSettingKey,
} from '@/lib/v2/repSettings';
import { isVehicleFinderEnabled } from '@/lib/v2/rexFeatureFlags';
import { loadSendTime, setSendHour as persistSendHour, formatHour, DEFAULT_SEND_HOUR } from '@/lib/v2/sendTime';
import { usePayPlan } from '@/lib/v2/payPlan';
import PayPlanSummary from './PayPlanSummary';
import SettingEditSheet, { type SettingEditConfig } from './SettingEditSheet';
import type { TabId } from './CustomNavBar';

type ProfileRow = { email: string; full_name: string | null; plan: string };

// Selectable daily send hours (6 AM - 9 PM), shown in the rep's local timezone.
const SEND_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

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
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label}${detail ? `, ${detail}` : ''}` : undefined}
      accessibilityState={{ disabled: !onPress }}
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
  onOpenRexActivity,
  onReplayOnboarding,
  onOpenPayPlan,
  onInstallApp,
  onNavigate,
  onOpenSupport,
  isAdmin,
  onOpenAdminSupport,
  adminOpenTicketCount,
  payPlanRefetchKey = 0,
}: {
  onOpenGamePlan?: () => void;
  onOpenRexActivity?: () => void;
  onReplayOnboarding?: () => void;
  onOpenPayPlan?: () => void;
  onInstallApp?: () => void;
  onNavigate?: (tab: TabId) => void;
  onOpenSupport?: () => void;
  isAdmin?: boolean;
  onOpenAdminSupport?: () => void;
  adminOpenTicketCount?: number;
  payPlanRefetchKey?: number;
} = {}) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ key: EditKey; config: SettingEditConfig } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [sendHour, setSendHourState] = useState(DEFAULT_SEND_HOUR);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [showSendPicker, setShowSendPicker] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  const payPlan = usePayPlan(payPlanRefetchKey);

  useEffect(() => {
    let cancelled = false;
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
      const st = await loadSendTime();
      if (!cancelled) { setSendHourState(st.send_hour); setTimezone(st.timezone); }
      const { data: code } = await supabase.rpc('ensure_my_referral_code');
      if (code && !cancelled) setReferralCode(code);
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id);
      if (!cancelled) setReferralCount(count ?? 0);
    })();
    const unsub = subscribeRepSettings(forceTick);
    return () => { cancelled = true; unsub(); };
  }, []);

  const editSetting = (key: RepSettingKey, title: string, label: string, extra?: Partial<SettingEditConfig>) => {
    setEditTarget({ key, config: { title, label, value: getRepSetting(key), ...extra } });
  };

  const editName = () => {
    setEditTarget({
      key: 'name',
      config: { title: 'Your name', label: 'FULL NAME', value: profile?.full_name ?? '', placeholder: 'Jake Morales' },
    });
  };

  const handleSettingSave = async (value: string) => {
    if (!editTarget) return;
    if (editTarget.key === 'name') {
      if (!value.trim()) throw new Error('Enter your name before saving.');
      if (!userId) throw new Error('Your session is still loading. Try again.');
      const { error } = await supabase.from('profiles').update({ full_name: value }).eq('id', userId);
      if (error) throw new Error("Couldn't save your name. Try again.");
      setProfile(p => (p ? { ...p, full_name: value } : p));
      flash('✓ Name updated');
    } else {
      await setRepSetting(editTarget.key, value);
      flash('✓ Setting updated');
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const copy = async (text: string, label: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        flash(`✓ ${label}`);
        return true;
      }
    } catch { /* handled below */ }
    flash("Couldn't copy — try again");
    return false;
  };

  const fullName = profile?.full_name?.trim() ?? '';
  const displayName = fullName || 'Add your name';
  // Single current product — never render the raw profiles.plan value
  // (would show POCKETREP/PRO/ELITE/REX_LENS verbatim for historical rows).
  const planLabel = 'PocketRep';
  const dealership = getRepSetting('dealership');
  const title = getRepSetting('title');
  const heroSub = [dealership, title].filter(Boolean).join(' · ') || 'Tap to set up your profile';
  const referLink = referralCode
    ? `https://pocketrep.pro/?ref=${encodeURIComponent(referralCode)}`
    : null;

  const [openingBilling, setOpeningBilling] = useState(false);
  const openingBillingRef = useRef(false);
  const openBillingPortal = async () => {
    if (openingBillingRef.current) return;
    openingBillingRef.current = true;
    setOpeningBilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-portal');
      if (error || !data?.url) {
        flash(data?.error === 'no_stripe_customer'
          ? "Billing isn't set up on this account yet"
          : "Couldn't open billing — try again in a moment");
        return;
      }
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') throw new Error('Browser unavailable');
        window.location.assign(data.url);
      } else {
        await Linking.openURL(data.url);
      }
    } catch {
      flash("Couldn't open billing — try again in a moment");
    } finally {
      openingBillingRef.current = false;
      setOpeningBilling(false);
    }
  };

  const shareReferral = async () => {
    if (!referLink) { flash('Loading your referral code…'); return; }
    if (Platform.OS === 'web') {
      await copy(referLink, 'Referral link copied');
      return;
    }
    try {
      await Share.share({
        message: `Give a Month. Get a Month. Sign up for PocketRep with my link and we both get a free month: ${referLink}`,
      });
    } catch { /* user cancelled share sheet */ }
  };

  const appVersion = Constants.expoConfig?.version ?? null;
  const buildNo =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null);
  const versionLine =
    `PocketRep${appVersion ? ` v${appVersion}` : ''}${buildNo ? ` · build ${buildNo}` : ''}`;

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndReset();
    } catch (e) {
      console.warn('sign out failed', e);
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  };

  return (
    <View style={styles.root}>
      <Pressable onPress={editName} style={styles.heroCard} accessibilityRole="button" accessibilityLabel="Edit your name and profile">
        <Avatar name={fullName || profile?.email || 'You'} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroSub}>{heroSub}</Text>
          <View style={styles.heroPills}>
            <Pill color={colors.gold}>{planLabel}</Pill>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <View style={styles.planCard}>
        <View style={{ flex: 1 }}>
          <Label color={colors.grey2}>COMPENSATION PLAN</Label>
          <Text style={styles.planRenews}>Set how your dealership pays you</Text>
        </View>
        <Pressable onPress={() => onOpenPayPlan?.()} style={styles.manageBtn} accessibilityRole="button" accessibilityLabel="Manage compensation plan">
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
        <Row icon="🏢" label="Dealership" detail={dealership || 'Add'}
          onPress={() => editSetting('dealership', 'Dealership', 'DEALERSHIP')} />
        <Row
          icon="🚗"
          label={isVehicleFinderEnabled() ? 'Dealership website' : 'Inventory feed'}
          detail={getRepSetting('inventoryFeed') || (isVehicleFinderEnabled() ? 'Add URL' : 'Not connected')}
          onPress={() => isVehicleFinderEnabled()
            ? editSetting('inventoryFeed', 'Dealership website', 'INVENTORY URL (https)', { placeholder: 'https://www.yourdealership.com', keyboardType: 'url' })
            : editSetting('inventoryFeed', 'Inventory feed', 'FEED STATUS / SOURCE')} />
        <Row icon="🔔" label="Weekly digest" detail="Mondays after 8 AM" chevron={false} />
        <Row icon="⏰" label="Daily send time" detail={formatHour(sendHour)} onPress={() => setShowSendPicker(true)} />
        <Row icon="📊" label="Goals & quota" detail="View →" onPress={() => onNavigate?.('metrics')} />
      </View>

      <SectionHead label="REX" color={colors.gold} />
      <View style={styles.group}>
        <View style={styles.toneRow}>
          <View style={[styles.rowIcon, { backgroundColor: colors.goldBg, borderColor: colors.goldBorder }]}>
            <Text style={{ color: colors.gold, fontSize: 14 }}>🤖</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowLabel}>Rex style</Text>
            <View style={styles.tonePills}>
              {(['Steady', 'Sharp', 'Fire'] as const).map(t => {
                const active = getRepSetting('voiceTone') === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      void setRepSetting('voiceTone', t).catch(() => undefined);
                      forceTick();
                    }}
                    style={[styles.tonePill, active && styles.tonePillActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set Rex style to ${t}`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.tonePillText, active && styles.tonePillTextActive]}>
                      {t === 'Steady' ? '🧘 Steady' : t === 'Sharp' ? '🔪 Sharp' : '🔥 Fire'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      <SectionHead label="LEARN" color={colors.gold} />
      <Pressable onPress={onReplayOnboarding} style={styles.learnCard} accessibilityRole="button" accessibilityLabel="Open sales rep playbook">
        <View style={styles.learnPlay}>
          <Text style={styles.learnPlayIcon}>▶</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.learnTitle}>Sales rep playbook</Text>
          <Text style={styles.learnHint}>8 steps · 5 min · maximize your day</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.gold }]}>›</Text>
      </Pressable>

      {shouldShowInstallRow() ? (
        <Pressable onPress={onInstallApp} style={styles.learnCard} accessibilityRole="button" accessibilityLabel="Install PocketRep app">
          <View style={styles.learnPlay}>
            <Text style={styles.learnPlayIcon}>📲</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.learnTitle}>Install app</Text>
            <Text style={styles.learnHint}>Add to home screen · instant launch</Text>
          </View>
          <Text style={[styles.chevron, { color: colors.gold }]}>›</Text>
        </Pressable>
      ) : null}

      {isAdmin ? (
        <>
          <SectionHead label="ADMIN" color={colors.green} />
          <View style={styles.group}>
            <Row icon="🛟" label="Support inbox"
              detail={adminOpenTicketCount ? `${adminOpenTicketCount} open` : 'No tickets'}
              onPress={onOpenAdminSupport} />
          </View>
        </>
      ) : null}

      <SectionHead label="ACCOUNT" color={colors.grey2} />
      <View style={styles.group}>
        <Row icon="💬" label="Support" detail="Chat with PocketRep"
          onPress={onOpenSupport} />
        <Row icon="✉" label="Email" detail={profile?.email ?? '—'} chevron={false} />
        <Row icon="📱" label="Phone" detail={getRepSetting('phone') || 'Add'}
          onPress={() => editSetting('phone', 'Phone', 'PHONE NUMBER', { keyboardType: 'phone-pad' })} />
        <Row icon="💳" label="Billing" detail={openingBilling ? 'Opening…' : 'Manage subscription'}
          onPress={openBillingPortal} />
        <Row
          icon="🎁"
          label="Give a Month. Get a Month."
          detail={referralCount > 0 ? `${referralCount} referred · tap to copy` : 'Tap to copy referral link'}
          onPress={shareReferral}
        />
      </View>

      <View style={styles.signOut}>
        <Row
          icon="↩"
          label="Sign out"
          danger
          chevron={false}
          onPress={() => setConfirmSignOut(true)}
        />
      </View>

      <Text style={styles.footer}>{versionLine}</Text>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {confirmSignOut ? (
        <View style={styles.confirmRoot}>
          <Pressable
            style={styles.confirmScrim}
            onPress={() => { if (!signingOut) setConfirmSignOut(false); }}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmBody}>You'll need to sign back in to reach your book.</Text>
            <View style={styles.confirmRow}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmCancel]}
                onPress={() => setConfirmSignOut(false)}
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmDanger]}
                onPress={doSignOut}
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel="Confirm sign out"
              >
                <Text style={styles.confirmDangerText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {showSendPicker ? (
        <View style={styles.confirmRoot}>
          <Pressable style={styles.confirmScrim} onPress={() => setShowSendPicker(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Daily send time</Text>
            <Text style={styles.confirmBody}>
              When Rex queues your daily outreach. Shown in your timezone{timezone ? ` (${timezone})` : ''}.
            </Text>
            <View style={styles.sendGrid}>
              {SEND_HOURS.map(h => {
                const isActive = h === sendHour;
                return (
                  <Pressable
                    key={h}
                    style={[styles.sendChip, isActive && styles.sendChipActive]}
                    onPress={async () => {
                      const previous = sendHour;
                      setSendHourState(h);
                      setShowSendPicker(false);
                      try { await persistSendHour(h); flash('✓ Send time updated'); }
                      catch { setSendHourState(previous); flash("Couldn't save send time"); }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set daily send time to ${formatHour(h)}`}
                  >
                    <Text style={[styles.sendChipText, isActive && styles.sendChipTextActive]}>
                      {formatHour(h)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.confirmBtn, styles.confirmCancel, { marginTop: 16 }]}
              onPress={() => setShowSendPicker(false)}
            >
              <Text style={styles.confirmCancelText}>Close</Text>
            </Pressable>
          </View>
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

  confirmRoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 200,
  } as any,
  confirmScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.xl,
    padding: 20,
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  confirmBody: { fontSize: 13, color: colors.grey2, marginTop: 8, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmCancel: { backgroundColor: colors.surface2, borderColor: colors.ink4 },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: colors.white },
  confirmDanger: { backgroundColor: colors.redBg, borderColor: colors.redBorder },
  confirmDangerText: { fontSize: 14, fontWeight: '700', color: colors.red },

  sendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  sendChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ink4,
    backgroundColor: colors.surface2,
  },
  sendChipActive: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  sendChipText: { fontSize: 12, fontWeight: '600', color: colors.grey2 },
  sendChipTextActive: { color: colors.gold },

  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  tonePills: { flexDirection: 'row', gap: 8, marginTop: 6 },
  tonePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ink4,
    backgroundColor: colors.surface2,
  },
  tonePillActive: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  tonePillText: { fontSize: 11, fontWeight: '700', color: colors.grey2 },
  tonePillTextActive: { color: colors.gold },
});
