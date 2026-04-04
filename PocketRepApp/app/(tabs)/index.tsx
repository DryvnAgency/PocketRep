import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, heatConfig } from '@/constants/theme';
import type { Contact, Profile } from '@/lib/types';
import Onboarding from '@/components/Onboarding';
import { scheduleContactReminders, requestNotificationPermission } from '@/lib/notifications';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}
const NOTIF_CHECK_KEY = 'pocketrep_notif_checked_';  // + YYYY-MM-DD

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

// ── Heat score engine (runs client-side, no server needed) ──────────────────
function calcHeatScore(c: Contact): { score: number; tier: 'hot' | 'warm' | 'watch'; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const today = new Date();

  // Lease ending within 60 days = hot signal
  if (c.lease_end_date) {
    const daysToLease = Math.floor((new Date(c.lease_end_date).getTime() - today.getTime()) / 86400000);
    if (daysToLease <= 30) { score += 40; reasons.push('lease ends soon'); }
    else if (daysToLease <= 60) { score += 25; reasons.push('lease ending in 60 days'); }
  }

  // High annual mileage = approaching limit faster
  if (c.annual_mileage && c.annual_mileage > 20000) { score += 15; reasons.push('high mileage'); }

  // Purchase date 2–4 years ago = prime trade-up window
  if (c.purchase_date) {
    const yearsSince = (today.getTime() - new Date(c.purchase_date).getTime()) / (365.25 * 86400000);
    if (yearsSince >= 2 && yearsSince <= 4) { score += 20; reasons.push('prime trade-up window'); }
  }

  // Hasn't been contacted in 60+ days
  if (c.last_contact_date) {
    const daysSince = Math.floor((today.getTime() - new Date(c.last_contact_date).getTime()) / 86400000);
    if (daysSince >= 60) { score += 10; reasons.push('not contacted recently'); }
    if (daysSince >= 120) { score += 10; }
  } else {
    score += 15; reasons.push('never contacted');
  }

  // Buying urgency logged by HeyRex
  if ((c as any).buying_urgency === 'high') { score += 25; reasons.push('high buying urgency'); }
  else if ((c as any).buying_urgency === 'medium') { score += 10; reasons.push('active interest'); }

  const tier: 'hot' | 'warm' | 'watch' =
    score >= 50 ? 'hot' : score >= 25 ? 'warm' : 'watch';

  return { score, tier, reason: reasons.slice(0, 2).join(' · ') || 'in your book' };
}

export default function HeatSheetScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followUpContacts, setFollowUpContacts] = useState<Contact[]>([]);
  const [hotContacts, setHotContacts] = useState<Contact[]>([]);
  const [warmContacts, setWarmContacts] = useState<Contact[]>([]);
  const [watchContacts, setWatchContacts] = useState<Contact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [briefContact, setBriefContact] = useState<Contact | null>(null);
  const [briefText, setBriefText] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);

  async function scheduleDailyFollowUpNotifications(contacts: Contact[]) {
    if (Platform.OS === 'web') return;
    const today = new Date().toISOString().split('T')[0];
    const storageKey = `${NOTIF_CHECK_KEY}${today}`;
    const storage = AsyncStorage;
    if (!storage) return;
    try {
      const already = await storage.getItem(storageKey);
      if (already) return; // already scheduled today
      await requestNotificationPermission();
      // Schedule reminders for any contact with a follow_up_date or lease_end_date
      let count = 0;
      for (const c of contacts) {
        if (c.follow_up_date || c.lease_end_date || (c as any).personal_events?.length) {
          count += await scheduleContactReminders({
            contactId: c.id,
            contactName: `${c.first_name} ${c.last_name}`.trim(),
            followUpDate: c.follow_up_date,
            leaseEndDate: c.lease_end_date,
            personalEvents: (c as any).personal_events ?? [],
          });
        }
      }
      await storage.setItem(storageKey, String(count));
    } catch {}
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: prof }, { data: contacts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('contacts').select('*').eq('user_id', user.id),
    ]);

    if (prof) setProfile(prof);
    if (contacts?.length) scheduleDailyFollowUpNotifications(contacts);

    if (contacts) {
      const today = new Date().toISOString().split('T')[0];

      // Follow-ups set by Hey Rex (due today or overdue)
      const followUps = contacts
        .filter(c => c.follow_up_date && c.follow_up_date <= today)
        .sort((a, b) => (a.follow_up_date ?? '').localeCompare(b.follow_up_date ?? ''));
      setFollowUpContacts(followUps);

      // Score every contact, then partition by tier
      const scored = contacts.map((c) => {
        const { score, tier, reason } = calcHeatScore(c);
        return { ...c, heat_score: score, heat_tier: tier, heat_reason: reason } as Contact;
      }).sort((a, b) => (b.heat_score ?? 0) - (a.heat_score ?? 0));

      setHotContacts(scored.filter(c => c.heat_tier === 'hot').slice(0, 5));
      setWarmContacts(scored.filter(c => c.heat_tier === 'warm').slice(0, 5));
      setWatchContacts(scored.filter(c => c.heat_tier === 'watch').slice(0, 5));
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openBrief(contact: Contact) {
    setBriefContact(contact);
    setBriefText('');
    setBriefLoading(true);

    if (!ANTHROPIC_KEY) {
      setBriefText(
        `Pre-call brief for ${contact.first_name} ${contact.last_name}:\n\n` +
        `• Heat signal: ${contact.heat_reason ?? 'in your book'}\n` +
        `• Vehicle: ${[contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ') || 'not logged'}\n` +
        `• Last contacted: ${contact.last_contact_date ?? 'never'}\n` +
        `• Notes: ${contact.notes ?? 'none logged'}\n\n` +
        `Add your ANTHROPIC_KEY to get AI-generated briefs.`
      );
      setBriefLoading(false);
      return;
    }

    const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ');
    const prompt =
      `You are Rex, an AI sales assistant for a top automotive sales rep. ` +
      `Write a tight 4-bullet pre-call brief (no headers, no fluff) for this customer:\n\n` +
      `Name: ${contact.first_name} ${contact.last_name}\n` +
      `Vehicle: ${vehicle || 'unknown'}\n` +
      `Mileage: ${contact.mileage ?? 'unknown'} | Annual: ${contact.annual_mileage ?? 'unknown'}\n` +
      `Lease ends: ${contact.lease_end_date ?? 'N/A'}\n` +
      `Last contact: ${contact.last_contact_date ?? 'never'}\n` +
      `Heat reason: ${contact.heat_reason ?? 'in book'}\n` +
      `Rep notes: ${contact.notes ?? 'none'}\n\n` +
      `Bullets: why they're hot, what to lead with, one risk to avoid, suggested first line to open the call.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const json = await res.json();
      setBriefText(json.content?.[0]?.text ?? 'Could not generate brief.');
    } catch {
      setBriefText('Failed to reach Rex. Check your API key and connection.');
    }
    setBriefLoading(false);
  }

  const allEmpty = hotContacts.length === 0 && warmContacts.length === 0 && watchContacts.length === 0;

  return (
    <View style={s.root}>
      <Onboarding />
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Heat Sheet</Text>
          <Text style={s.headerSub}>Who to call today</Text>
        </View>
        <View style={s.planBadge}>
          <Text style={s.planBadgeText}>{(profile?.plan ?? 'pro').toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        {allEmpty ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No contacts yet</Text>
            <Text style={s.emptySub}>Add your first customer in the Book tab — the Heat Sheet will score them automatically.</Text>
          </View>
        ) : (
          <>
            {/* Follow-ups set by Hey Rex */}
            {followUpContacts.length > 0 && (
              <View style={fu.section}>
                <View style={fu.header}>
                  <Text style={fu.icon}>📅</Text>
                  <Text style={fu.title}>FOLLOW UP TODAY</Text>
                  <View style={fu.pill}>
                    <Text style={fu.pillText}>{followUpContacts.length}</Text>
                  </View>
                </View>
                {followUpContacts.map(c => (
                  <TouchableOpacity key={c.id} style={fu.card} onPress={() => openBrief(c)} activeOpacity={0.8}>
                    <View style={fu.cardLeft}>
                      <Text style={fu.name}>{c.first_name} {c.last_name}</Text>
                      {c.notes ? <Text style={fu.note} numberOfLines={2}>{c.notes}</Text> : null}
                    </View>
                    <View style={fu.briefBtn}>
                      <Text style={fu.briefBtnText}>Brief</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TierSection title="HOT" tier="hot" contacts={hotContacts} onBrief={openBrief} />
            <TierSection title="WARM" tier="warm" contacts={warmContacts} onBrief={openBrief} />
            <TierSection title="WATCH" tier="watch" contacts={watchContacts} onBrief={openBrief} />
          </>
        )}
      </ScrollView>

      {/* Pre-call Brief Modal */}
      <Modal visible={!!briefContact} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                Pre-call Brief — {briefContact?.first_name} {briefContact?.last_name}
              </Text>
              <TouchableOpacity onPress={() => setBriefContact(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {briefLoading
              ? <View style={s.briefLoading}><ActivityIndicator color={colors.gold} /><Text style={s.briefLoadingText}>Rex is reading your notes…</Text></View>
              : <ScrollView style={s.briefScroll}><Text style={s.briefText}>{briefText}</Text></ScrollView>
            }

            <TouchableOpacity style={s.briefCallBtn} onPress={() => setBriefContact(null)}>
              <Text style={s.briefCallBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Tier section component ────────────────────────────────────────────────────
function TierSection({
  title, tier, contacts, onBrief,
}: {
  title: string;
  tier: 'hot' | 'warm' | 'watch';
  contacts: Contact[];
  onBrief: (c: Contact) => void;
}) {
  if (contacts.length === 0) return null;
  const cfg = heatConfig[tier];

  return (
    <View style={ts.section}>
      <View style={ts.tierHeader}>
        <Text style={ts.tierIcon}>{cfg.icon}</Text>
        <Text style={[ts.tierLabel, { color: cfg.color }]}>{title}</Text>
        <View style={[ts.tierPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[ts.tierPillText, { color: cfg.color }]}>{contacts.length}</Text>
        </View>
      </View>
      {contacts.map((c) => (
        <HeatCard key={c.id} contact={c} cfg={cfg} onBrief={onBrief} />
      ))}
    </View>
  );
}

function HeatCard({
  contact: c, cfg, onBrief,
}: {
  contact: Contact;
  cfg: typeof heatConfig['hot'];
  onBrief: (c: Contact) => void;
}) {
  const vehicle = [c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ');

  return (
    <View style={[hc.card, { borderLeftColor: cfg.color }]}>
      <View style={hc.top}>
        <View style={hc.nameWrap}>
          <Text style={hc.name}>{c.first_name} {c.last_name}</Text>
          {vehicle ? <Text style={hc.vehicle}>{vehicle}</Text> : null}
        </View>
        <TouchableOpacity style={hc.briefBtn} onPress={() => onBrief(c)} activeOpacity={0.8}>
          <Text style={hc.briefBtnText}>Brief</Text>
        </TouchableOpacity>
      </View>
      {c.heat_reason ? (
        <View style={[hc.reasonRow, { backgroundColor: cfg.bg }]}>
          <Text style={[hc.reason, { color: cfg.color }]}>{c.heat_reason}</Text>
        </View>
      ) : null}
      <View style={hc.meta}>
        {c.phone ? <Text style={hc.metaText}>📞 {c.phone}</Text> : null}
        {c.last_contact_date
          ? <Text style={hc.metaText}>Last: {new Date(c.last_contact_date).toLocaleDateString()}</Text>
          : <Text style={hc.metaText}>Never contacted</Text>
        }
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  planBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },
  planBadgeText: { color: colors.gold2, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 32 },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalSheet: {
    backgroundColor: colors.ink2,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, paddingBottom: 36,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: colors.ink4,
    borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.white, flex: 1 },
  modalClose: { color: colors.grey2, fontSize: 18, paddingLeft: 12 },
  briefLoading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  briefLoadingText: { color: colors.grey2, fontSize: 13 },
  briefScroll: { maxHeight: 300 },
  briefText: { color: colors.grey3, fontSize: 14, lineHeight: 22 },
  briefCallBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  briefCallBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});

const ts = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  tierIcon: { fontSize: 14 },
  tierLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tierPill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1 },
  tierPillText: { fontSize: 10, fontWeight: '700' },
});

const fu = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  icon: { fontSize: 14 },
  title: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.gold, flex: 1 },
  pill: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700', color: colors.gold },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLeft: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.white },
  note: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  briefBtn: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4,
  },
  briefBtnText: { color: colors.gold, fontSize: 11, fontWeight: '700' },
});

const hc = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameWrap: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.white },
  vehicle: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  briefBtn: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4,
  },
  briefBtnText: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  reasonRow: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  reason: { fontSize: 11, fontWeight: '600' },
  meta: { flexDirection: 'row', gap: spacing.md },
  metaText: { fontSize: 11, color: colors.grey2 },
});
