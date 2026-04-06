// ─── Profile / More Screen ────────────────────────────────────────────────────
// PocketRep — ported from Snack ProfileScreen
// Sub-views: Account Settings, Notifications, Subscription, Sunday Digest picker

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Pressable,
  Switch, TextInput, StyleSheet, Alert, ActivityIndicator,
  Linking, Platform, StatusBar,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/services';
import { C, STRIPE, DIGEST_TIME_KEY } from '@/lib/constants';
import { Avatar, GoldBtn } from '@/components/shared';
import { scheduleWeeklyDigest, cancelWeeklyDigest } from '@/lib/notifications';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

// ─── Types ────────────────────────────────────────────────────────────────────
type SubView = 'home' | 'account' | 'notifications' | 'subscription';

interface NotifPrefs {
  heatSheet7am: boolean;
  sequenceStepDue: boolean;
  followUpOverdue: boolean;
  weeklySummary: boolean;
}

interface EditForm {
  full_name: string;
  phone: string;
  rep_name_for_ai: string;
  company_name: string;
}

// ─── Shared header with back arrow ────────────────────────────────────────────
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={s.subHeader}>
      <TouchableOpacity style={s.backBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={s.backArrow}>←</Text>
      </TouchableOpacity>
      <Text style={s.subHeaderTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

// ─── Menu row ─────────────────────────────────────────────────────────────────
function MenuRow({
  icon, title, subtitle, onPress, right, destructive = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={s.menuRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress && !right}
    >
      <View style={s.menuRowLeft}>
        <Text style={s.menuRowIcon}>{icon}</Text>
        <View style={s.menuRowText}>
          <Text style={[s.menuRowTitle, destructive && { color: C.red }]}>{title}</Text>
          {!!subtitle && <Text style={s.menuRowSub}>{subtitle}</Text>}
        </View>
      </View>
      {right ?? (onPress ? <Text style={s.menuRowArrow}>›</Text> : null)}
    </TouchableOpacity>
  );
}

// ─── Feature pill for subscription cards ─────────────────────────────────────
function FeaturePill({ label }: { label: string }) {
  return (
    <View style={s.featurePill}>
      <Text style={s.featurePillText}>✓ {label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MoreScreen() {
  // ── Navigation state
  const [view, setView] = useState<SubView>('home');

  // ── Profile
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Account Settings edit
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    full_name: '', phone: '', rep_name_for_ai: '', company_name: '',
  });

  // ── Notifications prefs (local state — persist via AsyncStorage if desired)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    heatSheet7am: true,
    sequenceStepDue: true,
    followUpOverdue: true,
    weeklySummary: false,
  });

  // ── Sunday digest
  const [digestTime, setDigestTime]     = useState<{ hour: number; minute: number } | null>(null);
  const [showDigestPicker, setShowDigestPicker] = useState(false);
  const [pickerHour, setPickerHour]     = useState(9);   // 1–12 display
  const [pickerAmPm, setPickerAmPm]     = useState<'AM' | 'PM'>('AM');
  const [pickerMinute, setPickerMinute] = useState(0);   // 0, 15, 30, 45

  // ─── Load profile ──────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const user = await authService.getUser();
      if (user) {
        setProfile(user);
        setEditForm({
          full_name: user.full_name || '',
          phone: user.phone || '',
          rep_name_for_ai: user.rep_name_for_ai || '',
          company_name: user.company_name || '',
        });
      }
    } catch {}
    setProfileLoading(false);
  }, []);

  const loadDigestTime = useCallback(async () => {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(DIGEST_TIME_KEY);
      if (raw) setDigestTime(JSON.parse(raw));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadDigestTime();
    }, [loadProfile, loadDigestTime])
  );

  // ─── Account Settings: save ────────────────────────────────────────────────
  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await authService.updateProfile(editForm);
      setProfile((prev: any) => ({ ...prev, ...editForm }));
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }, [editForm]);

  // ─── Sunday digest: save ───────────────────────────────────────────────────
  const saveDigestSchedule = useCallback(async () => {
    const hour24 = pickerAmPm === 'PM'
      ? pickerHour === 12 ? 12 : pickerHour + 12
      : pickerHour === 12 ? 0  : pickerHour;
    const saved = { hour: hour24, minute: pickerMinute };
    try {
      await scheduleWeeklyDigest(hour24, pickerMinute);
      if (AsyncStorage) {
        await AsyncStorage.setItem(DIGEST_TIME_KEY, JSON.stringify(saved));
      }
      setDigestTime(saved);
    } catch {
      Alert.alert('Error', 'Could not schedule digest. Check notification permissions.');
    }
    setShowDigestPicker(false);
  }, [pickerHour, pickerAmPm, pickerMinute]);

  // ─── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function formatDigestTime(dt: { hour: number; minute: number }) {
    const ampm = dt.hour >= 12 ? 'PM' : 'AM';
    const h = dt.hour % 12 || 12;
    const m = String(dt.minute).padStart(2, '0');
    return `${h}:${m} ${ampm}`;
  }

  function openDigestPicker() {
    if (digestTime) {
      setPickerHour(digestTime.hour % 12 || 12);
      setPickerAmPm(digestTime.hour >= 12 ? 'PM' : 'AM');
      setPickerMinute(digestTime.minute);
    }
    setShowDigestPicker(true);
  }

  const plan: string = profile?.plan || 'solo';
  const username: string = profile?.username || '';
  const fullName: string = profile?.full_name || 'Your Name';
  const isElite = plan === 'elite';
  const isPro = plan === 'pro' || isElite;

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-VIEW: Account Settings
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'account') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <SubHeader title="Account Settings" onBack={() => { setEditing(false); setView('home'); }} />

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Avatar + username */}
          <View style={s.accountAvatarRow}>
            <Avatar name={fullName} size={64} />
            <View style={{ marginTop: 10 }}>
              {!!username && (
                <Text style={s.accountUsername}>@{username}</Text>
              )}
              <Text style={s.accountEmail}>{profile?.email || ''}</Text>
            </View>
          </View>

          {/* Edit / Save toggle */}
          <View style={s.editToggleRow}>
            {editing ? (
              <>
                <TouchableOpacity
                  style={s.cancelEditBtn}
                  onPress={() => {
                    setEditing(false);
                    setEditForm({
                      full_name: profile?.full_name || '',
                      phone: profile?.phone || '',
                      rep_name_for_ai: profile?.rep_name_for_ai || '',
                      company_name: profile?.company_name || '',
                    });
                  }}
                >
                  <Text style={s.cancelEditText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.saveBtn}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={C.ink} size="small" />
                    : <Text style={s.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={s.editBtn} onPress={() => setEditing(true)}>
                <Text style={s.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Fields */}
          <View style={s.fieldGroup}>
            <FieldRow
              label="Full Name"
              value={editForm.full_name}
              editing={editing}
              placeholder="Your full name"
              onChangeText={v => setEditForm(f => ({ ...f, full_name: v }))}
            />
            <FieldRow
              label="Email"
              value={profile?.email || ''}
              editing={false}
              locked
              placeholder=""
              onChangeText={() => {}}
            />
            <FieldRow
              label="Phone"
              value={editForm.phone}
              editing={editing}
              placeholder="e.g. 5551234567"
              keyboardType="phone-pad"
              onChangeText={v => setEditForm(f => ({ ...f, phone: v }))}
            />
            <FieldRow
              label="AI Rep Name"
              value={editForm.rep_name_for_ai}
              editing={editing}
              placeholder="Name Rex calls you"
              onChangeText={v => setEditForm(f => ({ ...f, rep_name_for_ai: v }))}
            />
            <FieldRow
              label="Company"
              value={editForm.company_name}
              editing={editing}
              placeholder="Your dealership / company"
              onChangeText={v => setEditForm(f => ({ ...f, company_name: v }))}
            />
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-VIEW: Notifications
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'notifications') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <SubHeader title="Notifications" onBack={() => setView('home')} />

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={s.notifSectionLabel}>PUSH NOTIFICATIONS</Text>

          <NotifToggleRow
            icon="🔥"
            title="Heat Sheet 7AM"
            subtitle="Daily reminder to check your top contacts"
            value={notifPrefs.heatSheet7am}
            onValueChange={v => setNotifPrefs(p => ({ ...p, heatSheet7am: v }))}
          />
          <NotifToggleRow
            icon="📋"
            title="Sequence step due"
            subtitle="Notified when a follow-up step is ready"
            value={notifPrefs.sequenceStepDue}
            onValueChange={v => setNotifPrefs(p => ({ ...p, sequenceStepDue: v }))}
          />
          <NotifToggleRow
            icon="⏰"
            title="Follow-up overdue"
            subtitle="Alert when a contact follow-up date has passed"
            value={notifPrefs.followUpOverdue}
            onValueChange={v => setNotifPrefs(p => ({ ...p, followUpOverdue: v }))}
          />
          <NotifToggleRow
            icon="📊"
            title="Weekly summary"
            subtitle="Sunday digest push notification"
            value={notifPrefs.weeklySummary}
            onValueChange={v => setNotifPrefs(p => ({ ...p, weeklySummary: v }))}
          />

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUB-VIEW: Subscription & Upgrade
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'subscription') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <SubHeader title="Subscription & Upgrade" onBack={() => setView('home')} />

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Current plan */}
          <View style={s.currentPlanCard}>
            <View style={s.currentPlanTop}>
              <Text style={s.currentPlanLabel}>CURRENT PLAN</Text>
              <View style={s.planBadgeSmall}>
                <Text style={s.planBadgeSmallText}>{plan.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={s.currentPlanFounder}>Founding member — 40% off forever</Text>
            <TouchableOpacity
              style={s.manageBillingBtn}
              onPress={() => Linking.openURL('https://billing.stripe.com/p/login/pocketrep')}
            >
              <Text style={s.manageBillingText}>Manage Billing →</Text>
            </TouchableOpacity>
          </View>

          {/* Pro plan */}
          <View style={[s.planCard, isPro && s.planCardCurrent]}>
            <View style={s.planCardHeader}>
              <View>
                <Text style={s.planCardName}>Pro</Text>
                <Text style={s.planCardPrice}>
                  <Text style={s.planCardPriceMain}>$29</Text>
                  <Text style={s.planCardPriceSub}>/mo</Text>
                  {'  '}
                  <Text style={s.planCardPriceWas}>was $49</Text>
                </Text>
              </View>
              {isPro && !isElite && (
                <View style={s.currentBadge}>
                  <Text style={s.currentBadgeText}>CURRENT</Text>
                </View>
              )}
            </View>
            <View style={s.featureList}>
              <FeaturePill label="50-contact mass texts" />
              <FeaturePill label="Rex AI coaching" />
              <FeaturePill label="Sequence builder" />
              <FeaturePill label="Heat sheet tracking" />
              <FeaturePill label="Full contact book" />
            </View>
            {!isPro && (
              <TouchableOpacity
                style={s.upgradeBtn}
                onPress={() => Linking.openURL(STRIPE.pro)}
                activeOpacity={0.85}
              >
                <Text style={s.upgradeBtnText}>UPGRADE TO PRO →</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Elite plan */}
          <View style={[s.planCard, isElite && s.planCardCurrent]}>
            <View style={s.planCardHeader}>
              <View>
                <Text style={[s.planCardName, { color: C.gold }]}>Elite</Text>
                <Text style={s.planCardPrice}>
                  <Text style={s.planCardPriceMain}>$47</Text>
                  <Text style={s.planCardPriceSub}>/mo</Text>
                  {'  '}
                  <Text style={s.planCardPriceWas}>was $79</Text>
                </Text>
              </View>
              {isElite && (
                <View style={s.currentBadge}>
                  <Text style={s.currentBadgeText}>CURRENT</Text>
                </View>
              )}
            </View>
            <View style={s.featureList}>
              <FeaturePill label="Everything in Pro" />
              <FeaturePill label="100-contact mass texts" />
              <FeaturePill label="Rex memory across sessions" />
              <FeaturePill label="Sunday digest coaching" />
              <FeaturePill label="Priority support" />
              <FeaturePill label="Early feature access" />
            </View>
            {!isElite && (
              <TouchableOpacity
                style={[s.upgradeBtn, s.upgradeBtnGold]}
                onPress={() => Linking.openURL(STRIPE.elite)}
                activeOpacity={0.85}
              >
                <Text style={[s.upgradeBtnText, { color: C.ink }]}>UPGRADE TO ELITE →</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOME VIEW (default)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={s.profileCard}>
          {profileLoading ? (
            <ActivityIndicator color={C.gold} />
          ) : (
            <>
              <Avatar name={fullName} size={56} />
              <View style={s.profileCardInfo}>
                <Text style={s.profileCardName}>{fullName}</Text>
                {!!username && <Text style={s.profileCardUsername}>@{username}</Text>}
                <TouchableOpacity
                  style={s.profilePlanBadge}
                  onPress={() => setView('subscription')}
                  activeOpacity={0.8}
                >
                  <Text style={s.profilePlanBadgeText}>{plan.toUpperCase()} PLAN</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Settings section */}
        <Text style={s.sectionLabel}>SETTINGS</Text>
        <MenuRow
          icon="👤"
          title="Account Settings"
          subtitle="Name, phone, AI rep name, company"
          onPress={() => setView('account')}
        />
        <MenuRow
          icon="🔔"
          title="Notifications"
          subtitle="Heat sheet, sequences, follow-ups"
          onPress={() => setView('notifications')}
        />
        <MenuRow
          icon="⚡"
          title="Subscription & Upgrade"
          subtitle={`Current plan: ${plan.charAt(0).toUpperCase() + plan.slice(1)}`}
          onPress={() => setView('subscription')}
        />

        {/* Elite section */}
        <Text style={s.sectionLabel}>ELITE</Text>
        <MenuRow
          icon="📅"
          title="Sunday Digest"
          subtitle={digestTime
            ? `Scheduled: Sundays at ${formatDigestTime(digestTime)}`
            : 'Set time for weekly digest'}
          onPress={openDigestPicker}
          right={
            !isElite ? (
              <View style={s.elitePill}>
                <Text style={s.elitePillText}>ELITE</Text>
              </View>
            ) : undefined
          }
        />

        {/* Account section */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <MenuRow
          icon="🚪"
          title="Sign Out"
          destructive
          onPress={handleSignOut}
        />

        <Text style={s.footer}>PocketRep · The rep's edge, not the store's</Text>
        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Sunday Digest Time Picker Modal ── */}
      <Modal visible={showDigestPicker} animationType="fade" transparent>
        <Pressable style={s.dpOverlay} onPress={() => setShowDigestPicker(false)}>
          <Pressable style={s.dpSheet} onPress={e => e.stopPropagation()}>
            <Text style={s.dpTitle}>📅 Sunday Digest Time</Text>
            <Text style={s.dpSub}>
              Choose when Rex sends your weekly recap every Sunday.
            </Text>

            {/* Hour chips */}
            <Text style={s.dpLabel}>HOUR</Text>
            <View style={s.dpRow}>
              {[6, 7, 8, 9, 10, 11, 12].map(h => (
                <TouchableOpacity
                  key={h}
                  style={[s.dpChip, pickerHour === h && s.dpChipActive]}
                  onPress={() => setPickerHour(h)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dpChipText, pickerHour === h && s.dpChipTextActive]}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AM/PM chips */}
            <Text style={s.dpLabel}>AM / PM</Text>
            <View style={s.dpRow}>
              {(['AM', 'PM'] as const).map(ap => (
                <TouchableOpacity
                  key={ap}
                  style={[s.dpChip, pickerAmPm === ap && s.dpChipActive]}
                  onPress={() => setPickerAmPm(ap)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dpChipText, pickerAmPm === ap && s.dpChipTextActive]}>
                    {ap}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Minute chips */}
            <Text style={s.dpLabel}>MINUTE</Text>
            <View style={s.dpRow}>
              {[0, 15, 30, 45].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.dpChip, pickerMinute === m && s.dpChipActive]}
                  onPress={() => setPickerMinute(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dpChipText, pickerMinute === m && s.dpChipTextActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.dpActions}>
              <TouchableOpacity
                style={s.dpCancel}
                onPress={() => setShowDigestPicker(false)}
                activeOpacity={0.8}
              >
                <Text style={s.dpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dpConfirm}
                onPress={saveDigestSchedule}
                activeOpacity={0.85}
              >
                <Text style={s.dpConfirmText}>Schedule →</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Field row component (used in Account Settings) ───────────────────────────
function FieldRow({
  label, value, editing, locked, placeholder, keyboardType, onChangeText,
}: {
  label: string;
  value: string;
  editing: boolean;
  locked?: boolean;
  placeholder: string;
  keyboardType?: any;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      {editing && !locked ? (
        <TextInput
          style={s.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.grey}
          keyboardType={keyboardType || 'default'}
          autoCapitalize="none"
        />
      ) : (
        <View style={[s.fieldDisplay, locked && s.fieldDisplayLocked]}>
          <Text style={[s.fieldDisplayText, !value && s.fieldDisplayPlaceholder]}>
            {value || placeholder}
          </Text>
          {locked && <Text style={s.fieldLockedIcon}>🔒</Text>}
        </View>
      )}
    </View>
  );
}

// ─── Notification toggle row ──────────────────────────────────────────────────
function NotifToggleRow({
  icon, title, subtitle, value, onValueChange,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={s.notifRow}>
      <View style={s.menuRowLeft}>
        <Text style={s.menuRowIcon}>{icon}</Text>
        <View style={s.menuRowText}>
          <Text style={s.menuRowTitle}>{title}</Text>
          <Text style={s.menuRowSub}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.border2, true: C.goldBorder }}
        thumbColor={value ? C.gold : C.grey2}
        ios_backgroundColor={C.border2}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.ink,
  },

  // ── Header (home)
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.select({ ios: 56, android: 36 }),
    paddingBottom: 14,
    backgroundColor: C.ink2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.4,
  },

  // ── Sub-view header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 56, android: 36 }),
    paddingBottom: 14,
    backgroundColor: C.ink2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 18,
    color: C.text,
    lineHeight: 22,
  },
  subHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  // ── Section labels
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 20,
  },

  // ── Profile card (home)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
  },
  profileCardInfo: {
    flex: 1,
    gap: 3,
  },
  profileCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  profileCardUsername: {
    fontSize: 12,
    color: C.grey2,
  },
  profilePlanBadge: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  profilePlanBadgeText: {
    color: C.gold2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Menu row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface2,
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.border,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuRowIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  menuRowText: {
    flex: 1,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  menuRowSub: {
    fontSize: 11,
    color: C.grey2,
    marginTop: 2,
  },
  menuRowArrow: {
    fontSize: 20,
    color: C.grey,
  },

  // ── Elite pill
  elitePill: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  elitePillText: {
    color: C.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Footer
  footer: {
    textAlign: 'center',
    color: C.grey,
    fontSize: 11,
    marginTop: 32,
    marginHorizontal: 20,
  },

  // ══ Account Settings ══
  accountAvatarRow: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 16,
    gap: 6,
  },
  accountUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  accountEmail: {
    fontSize: 12,
    color: C.grey2,
    textAlign: 'center',
    marginTop: 2,
  },
  editToggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  editBtn: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editBtnText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  cancelEditBtn: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelEditText: {
    color: C.grey2,
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: C.gold,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  saveBtnText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Field rows
  fieldGroup: {
    marginHorizontal: 16,
    gap: 2,
  },
  fieldRow: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  fieldInput: {
    fontSize: 14,
    color: C.text,
    padding: 0,
    margin: 0,
  },
  fieldDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldDisplayLocked: {
    opacity: 0.55,
  },
  fieldDisplayText: {
    fontSize: 14,
    color: C.text,
  },
  fieldDisplayPlaceholder: {
    color: C.grey,
    fontStyle: 'italic',
  },
  fieldLockedIcon: {
    fontSize: 12,
  },

  // ══ Notifications ══
  notifSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface2,
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.border,
  },

  // ══ Subscription ══
  currentPlanCard: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 14,
    padding: 16,
  },
  currentPlanTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  currentPlanLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  planBadgeSmall: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planBadgeSmallText: {
    color: C.gold2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  currentPlanFounder: {
    fontSize: 12,
    color: C.gold,
    fontWeight: '600',
    marginBottom: 12,
  },
  manageBillingBtn: {
    alignSelf: 'flex-start',
  },
  manageBillingText: {
    fontSize: 13,
    color: C.gold,
    fontWeight: '600',
  },
  planCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
  },
  planCardCurrent: {
    borderColor: C.goldBorder,
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planCardName: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  planCardPrice: {
    fontSize: 13,
    color: C.grey2,
  },
  planCardPriceMain: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
  },
  planCardPriceSub: {
    fontSize: 13,
    color: C.grey2,
  },
  planCardPriceWas: {
    fontSize: 11,
    color: C.grey,
    textDecorationLine: 'line-through',
  },
  currentBadge: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadgeText: {
    color: C.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  featurePill: {
    backgroundColor: C.ink3,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  featurePillText: {
    fontSize: 11,
    color: C.grey3,
    fontWeight: '500',
  },
  upgradeBtn: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  upgradeBtnGold: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  upgradeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 0.6,
  },

  // ══ Digest picker modal ══
  dpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  dpSheet: {
    backgroundColor: C.ink2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    paddingBottom: Platform.select({ ios: 40, android: 28 }),
  },
  dpTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
    marginBottom: 4,
  },
  dpSub: {
    color: C.grey2,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 18,
  },
  dpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 7,
    marginTop: 12,
  },
  dpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  dpChip: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    minWidth: 48,
    alignItems: 'center',
  },
  dpChipActive: {
    backgroundColor: C.goldBg,
    borderColor: C.goldBorder,
  },
  dpChipText: {
    color: C.grey2,
    fontSize: 13,
    fontWeight: '600',
  },
  dpChipTextActive: {
    color: C.gold,
  },
  dpActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  dpCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dpCancelText: {
    color: C.grey2,
    fontWeight: '600',
    fontSize: 14,
  },
  dpConfirm: {
    flex: 2,
    backgroundColor: C.gold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dpConfirmText: {
    color: C.ink,
    fontWeight: '800',
    fontSize: 14,
  },
});
