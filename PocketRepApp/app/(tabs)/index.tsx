// ─── Heat Sheet — Home Tab ────────────────────────────────────────────────────
// PocketRep — ported from Snack HeatSheetScreen

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Platform, StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { C, openSmsComposer, openPhoneDialer, confirmRemoveFromHeatSheet, STRIPE } from '@/lib/constants';
import { contactService, sequenceService, sequenceAssignmentService } from '@/lib/services';
import {
  Avatar, HeatBadge, SwipeableRow, AssignSequenceModal,
  GoldBtn, EmptyState, LoadingScreen, ErrorBanner,
} from '@/components/shared';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function heatReason(score: number): string {
  if (score >= 80) return 'High priority — prime window open';
  if (score >= 60) return 'Not contacted in 30+ days';
  if (score >= 40) return 'Needs a check-in soon';
  return 'Low urgency — keep warm';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HeatSheetScreen() {
  const router = useRouter();

  const [contacts, setContacts]       = useState<any[]>([]);
  const [sequences, setSequences]     = useState<any[]>([]);
  const [profile, setProfile]         = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState('');
  const [seqContact, setSeqContact]   = useState<any>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, string>>({});

  // ─── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError('');
    try {
      const { authService } = await import('@/lib/services');
      const [topContacts, allSeqs, user] = await Promise.all([
        contactService.getTopByHeatScore(5),
        sequenceService.getAll(),
        authService.getUser().catch(() => null),
      ]);

      setContacts(topContacts);
      setSequences(allSeqs);
      if (user) setProfile(user);

      // Build assignment map for sequence modal
      const map: Record<string, string> = {};
      await Promise.all(
        topContacts.map(async (c: any) => {
          const sid = await sequenceAssignmentService.getAssignedSequenceId(c);
          if (sid) map[c.id] = sid;
        })
      );
      setAssignedMap(map);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Heat Sheet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleSelectContact = useCallback(async (contact: any) => {
    try {
      if (AsyncStorage) {
        await AsyncStorage.setItem('pocketrep_selected_contact', JSON.stringify(contact));
      }
    } catch {}
    router.push('/(tabs)/contacts');
  }, [router]);

  const handleText = useCallback((contact: any) => {
    if (!contact?.phone) {
      Alert.alert('No Phone', 'This contact has no phone number on file.');
      return;
    }
    openSmsComposer({ phones: [contact.phone] }).catch((e: any) =>
      Alert.alert('Error', e?.message || 'Could not open SMS.')
    );
  }, []);

  const handleCall = useCallback((contact: any) => {
    if (!contact?.phone) {
      Alert.alert('No Phone', 'This contact has no phone number on file.');
      return;
    }
    openPhoneDialer(contact.phone).catch((e: any) =>
      Alert.alert('Error', e?.message || 'Could not open dialer.')
    );
  }, []);

  const handleNote = useCallback(async (contact: any) => {
    try {
      if (AsyncStorage) {
        await AsyncStorage.setItem('pocketrep_selected_contact', JSON.stringify(contact));
      }
    } catch {}
    router.push('/(tabs)/contacts');
  }, [router]);

  const handleRemoveFromHeatSheet = useCallback((contact: any) => {
    confirmRemoveFromHeatSheet(contact, async () => {
      try {
        await contactService.update(contact.id, { heat_score: 0 });
        setContacts(prev => prev.filter(c => c.id !== contact.id));
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not remove contact.');
      }
    });
  }, []);

  const handleAssignSequence = useCallback(async (seq: any) => {
    if (!seqContact) return;
    try {
      await sequenceAssignmentService.assignToContact(seqContact.id, seq.id);
      setAssignedMap(prev => ({ ...prev, [seqContact.id]: seq.id }));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not assign sequence.');
    } finally {
      setSeqContact(null);
    }
  }, [seqContact]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const hasHighPriority = contacts.some(c => (c.heat_score ?? 0) > 75);
  const firstName = profile?.full_name?.split(' ')[0] || profile?.username || 'Rep';
  const plan: string = profile?.plan || 'solo';

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen message="Loading Heat Sheet..." />;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>Hey, {firstName}</Text>
          <Text style={s.dateLabel}>{todayLabel()}</Text>
        </View>
        <TouchableOpacity
          style={s.planBadge}
          onPress={() => router.push('/(tabs)/more')}
          activeOpacity={0.8}
        >
          <Text style={s.planBadgeText}>{plan.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* ── High-priority warning banner ── */}
      {hasHighPriority && (
        <View style={s.warningBanner}>
          <Text style={s.warningIcon}>🔥</Text>
          <Text style={s.warningText}>
            You have high-priority contacts ready to close — act today.
          </Text>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.gold}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {!!error && (
          <ErrorBanner message={error} onDismiss={() => setError('')} />
        )}

        {contacts.length === 0 ? (
          /* ── Empty state ── */
          <View style={s.emptyWrap}>
            <EmptyState
              icon="🔥"
              title="Your Heat Sheet is empty"
              subtitle="Add contacts to start tracking who to reach out to today."
            />
            <View style={s.emptyActions}>
              <GoldBtn
                label="Import Contacts"
                onPress={() => router.push('/(tabs)/contacts')}
                style={{ marginBottom: 10 }}
              />
              <GoldBtn
                label="Add Manually"
                outline
                onPress={() => router.push('/(tabs)/contacts')}
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>TOP CONTACTS TODAY</Text>

            {contacts.map((contact, index) => {
              const score = contact.heat_score ?? 0;
              const reason = heatReason(score);
              const tags: string[] = (contact.tags || []).slice(0, 3);
              const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();

              return (
                <SwipeableRow
                  key={contact.id}
                  style={s.rowWrap}
                  rightActions={[
                    {
                      label: 'Remove',
                      icon: '🗑',
                      backgroundColor: C.red,
                      onPress: () => handleRemoveFromHeatSheet(contact),
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={s.card}
                    activeOpacity={0.88}
                    onPress={() => handleSelectContact(contact)}
                  >
                    {/* Rank badge */}
                    <View style={s.rankBadge}>
                      <Text style={s.rankText}>#{index + 1}</Text>
                    </View>

                    {/* Avatar */}
                    <Avatar
                      name={fullName || '?'}
                      photoUri={contact.photo_uri}
                      size={44}
                    />

                    {/* Main content */}
                    <View style={s.cardBody}>
                      <View style={s.cardTopRow}>
                        <Text style={s.contactName} numberOfLines={1}>
                          {fullName || 'Unknown'}
                        </Text>
                        <HeatBadge score={score} />
                      </View>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <View style={s.tagsRow}>
                          {tags.map(tag => (
                            <View key={tag} style={s.tagPill}>
                              <Text style={s.tagText}>#{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Heat reason */}
                      <Text style={s.heatReason} numberOfLines={1}>
                        {reason}
                      </Text>

                      {/* Quick actions */}
                      <View style={s.actionsRow}>
                        <TouchableOpacity
                          style={s.actionBtn}
                          onPress={() => handleText(contact)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.actionIcon}>📱</Text>
                          <Text style={s.actionLabel}>Text</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.actionBtn}
                          onPress={() => handleCall(contact)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.actionIcon}>📞</Text>
                          <Text style={s.actionLabel}>Call</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.actionBtn}
                          onPress={() => handleNote(contact)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.actionIcon}>📝</Text>
                          <Text style={s.actionLabel}>Note</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={s.actionBtn}
                          onPress={() => setSeqContact(contact)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.actionIcon}>🔁</Text>
                          <Text style={s.actionLabel}>Seq</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                </SwipeableRow>
              );
            })}

            {/* Add contact button */}
            <View style={s.addBtnWrap}>
              <GoldBtn
                label="+ Add a contact"
                onPress={() => router.push('/(tabs)/contacts')}
              />
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Assign Sequence Modal ── */}
      <AssignSequenceModal
        visible={!!seqContact}
        contact={seqContact}
        sequences={sequences}
        assignedId={seqContact ? assignedMap[seqContact.id] : undefined}
        onClose={() => setSeqContact(null)}
        onAssigned={handleAssignSequence}
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

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.select({ ios: 56, android: 36 }),
    paddingBottom: 14,
    backgroundColor: C.ink2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.4,
  },
  dateLabel: {
    fontSize: 12,
    color: C.grey2,
    marginTop: 2,
  },
  planBadge: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgeText: {
    color: C.gold2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(212,168,67,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: C.goldBorder,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  warningIcon: {
    fontSize: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: C.gold,
    fontWeight: '600',
    lineHeight: 17,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },

  // ── Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },

  // ── Contact card row
  rowWrap: {
    marginBottom: 10,
    borderRadius: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
  },

  // ── Rank badge
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.ink3,
    borderWidth: 1,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.grey2,
  },

  // ── Card body
  cardBody: {
    flex: 1,
    gap: 5,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contactName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },

  // ── Tags
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tagPill: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 10,
    color: C.grey2,
    fontWeight: '600',
  },

  // ── Heat reason
  heatReason: {
    fontSize: 11,
    color: C.grey3,
    lineHeight: 15,
    marginTop: 1,
  },

  // ── Quick actions
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 8,
    paddingVertical: 7,
  },
  actionIcon: {
    fontSize: 12,
  },
  actionLabel: {
    fontSize: 11,
    color: C.grey3,
    fontWeight: '600',
  },

  // ── Empty state
  emptyWrap: {
    marginTop: 24,
  },
  emptyActions: {
    paddingHorizontal: 24,
    marginTop: 8,
  },

  // ── Add contact button
  addBtnWrap: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
});
