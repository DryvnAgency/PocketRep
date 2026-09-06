import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Platform, Pressable } from 'react-native';
import { colors } from '@/constants/theme';
import CustomNavBar, { TabId } from './CustomNavBar';
import TabBar from './TabBar';
import HeatSheetTab from './HeatSheetTab';
import ContactsTab, { CallQueue } from './ContactsTab';
import ContactDetail from './ContactDetail';
import ProfileTab from './ProfileTab';
import MetricsTab from './MetricsTab';
import DealLogger, { type DealLoggerPrefill } from './DealLogger';
import DealDetail from './DealDetail';
import BulkTagFlow from './BulkTagFlow';
import AddContactModal from './AddContactModal';
import ImportContactsModal from './ImportContactsModal';
import RexOnboarding from './RexOnboarding';
import PWAInstallPrompt, { shouldAutoPrompt } from './PWAInstallPrompt';
import GamePlanSheet from './GamePlanSheet';
import WorkMyBookSheet from './WorkMyBookSheet';
import SoldBookGuide, { type SoldBookWave } from './SoldBookGuide';
import RexActivityViewer from './RexActivityViewer';
import BlastSequenceDrafter from './BlastSequenceDrafter';
import StalledLeadsAnalysis from './StalledLeadsAnalysis';
import NurtureReviewer from './NurtureReviewer';
import PayPlanEditor from './PayPlanEditor';
import NotificationsCenter from './NotificationsCenter';
import RexCoach, { type RexCoachMission } from './RexCoach';
import SupportChat from './SupportChat';
import AdminSupportDashboard from './AdminSupportDashboard';
import OwnerControlCenter from './admin/OwnerControlCenter';
import VehicleFinderModal from './VehicleFinderModal';
import LockoutScreen from './LockoutScreen';
import AuthScreen from './AuthScreen';
import { createBlastDraft, type BlastDraft } from '@/lib/v2/blastSequences';
import { warmBrain } from '@/lib/v2/aiProxy';
import { rolloverCoachLog } from '@/lib/v2/coachLog';
import { usePayPlan } from '@/lib/v2/payPlan';
import { analyzeStalledLeads, type StalledReport, type StalledRecommendation } from '@/lib/v2/stalledLeads';
import { useNotifications } from '@/lib/v2/notifications';
import { ensureDemoSession } from '@/lib/v2/demoAuth';
import { clearLocalSessionState, signOutAndReset } from '@/lib/v2/localSessionClear';
import { openMarketing } from '@/lib/v2/links';
import { materializeDueResponses, clearDemoSim } from '@/lib/v2/demoBlastSim';
import { registerForPush } from '@/lib/v2/pushNotifications';
import { useContacts, type V2Contact } from '@/lib/v2/useContacts';
import { useTags } from '@/lib/v2/useTags';
import { deleteTag } from '@/lib/v2/tagMutations';
import type { V2DealRich } from '@/lib/v2/useUserDeals';
import { hasCompletedOnboarding, markOnboardingComplete, syncOnboardingFromProfile, hasSeenSoldBookNudge, markSoldBookNudgeSeen } from '@/lib/v2/rexSettings';
import { isRexOnboardingEnabled, isContactImportEnabled, isVehicleFinderEnabled } from '@/lib/v2/rexFeatureFlags';
import type { CreateBlastSequencePayload, FindVehiclesPayload } from '@/lib/v2/rexActions';
import { useAccessGate } from '@/lib/v2/accessGate';
import { supabase } from '@/lib/supabase';
import { captureTimezone } from '@/lib/v2/sendTime';
import { checkIsAdmin, countOpenTickets } from '@/lib/v2/supportChat';
import { hydrateRepSettings } from '@/lib/v2/repSettings';
import { enrollContactInSequence } from '@/lib/v2/useSequences';

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dealLoggerOpen, setDealLoggerOpen] = useState(false);
  const [dealLoggerPrefill, setDealLoggerPrefill] = useState<DealLoggerPrefill | undefined>();
  const [dealsRefetchKey, setDealsRefetchKey] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<V2DealRich | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [tagsRefetchKey, setTagsRefetchKey] = useState(0);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [vehicleFinderOpen, setVehicleFinderOpen] = useState(false);
  const [vehicleFinderPrefill, setVehicleFinderPrefill] = useState<FindVehiclesPayload | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(false);
  const [gamePlanOpen, setGamePlanOpen] = useState(false);
  const [workBookOpen, setWorkBookOpen] = useState(false);
  const [callQueueContacts, setCallQueueContacts] = useState<V2Contact[] | null>(null);
  const [rexActivityOpen, setRexActivityOpen] = useState(false);
  const [blastDraft, setBlastDraft] = useState<BlastDraft | null>(null);
  const [stalledOpen, setStalledOpen] = useState(false);
  const [stalledReport, setStalledReport] = useState<StalledReport | null>(null);
  const [stalledLoading, setStalledLoading] = useState(false);
  const [nurtureReviewerOpen, setNurtureReviewerOpen] = useState(false);
  const [nurtureRefetchKey, setNurtureRefetchKey] = useState(0);
  const [payPlanOpen, setPayPlanOpen] = useState(false);
  const [payPlanRefetchKey, setPayPlanRefetchKey] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [rexCoachOpen, setRexCoachOpen] = useState(false);
  const [soldBookPromptWave, setSoldBookPromptWave] = useState<SoldBookWave | null>(null);
  const [soldBookGuideWave, setSoldBookGuideWave] = useState<SoldBookWave | null>(null);
  const [soldBookMission, setSoldBookMission] = useState<RexCoachMission | null>(null);
  const [soldBookMissionIds, setSoldBookMissionIds] = useState<string[]>([]);
  const soldBookNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soldBookDraftingRef = useRef(false);
  const installPromptContinuesOnboardingRef = useRef(false);
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [adminSupportOpen, setAdminSupportOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpenTicketCount, setAdminOpenTicketCount] = useState(0);
  const [rexActionError, setRexActionError] = useState<string | null>(null);
  const [contactActionNotice, setContactActionNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const payPlan = usePayPlan(payPlanRefetchKey, authReady);
  const access = useAccessGate(authReady);

  const { contacts, error, patchLocal, reload: reloadContacts } = useContacts(authReady);
  const contactsRef = useRef<V2Contact[] | null>(contacts);
  contactsRef.current = contacts;

  const armSoldBookNudge = () => {
    if (soldBookNudgeTimerRef.current) clearTimeout(soldBookNudgeTimerRef.current);
    soldBookNudgeTimerRef.current = setTimeout(() => {
      const realContacts = (contactsRef.current ?? []).filter(contact => !contact.isDemo);
      if (realContacts.length === 0 && !hasSeenSoldBookNudge()) setSoldBookPromptWave('last_month');
    }, 3 * 60 * 1000);
  };

  useEffect(() => () => {
    if (soldBookNudgeTimerRef.current) clearTimeout(soldBookNudgeTimerRef.current);
  }, []);

  const startSoldBookGuide = (wave: SoldBookWave) => {
    if (wave === 'last_month') markSoldBookNudgeSeen();
    setSoldBookPromptWave(null);
    setSoldBookGuideWave(wave);
  };

  const startFirstRealMission = () => {
    if (soldBookNudgeTimerRef.current) {
      clearTimeout(soldBookNudgeTimerRef.current);
      soldBookNudgeTimerRef.current = null;
    }
    const realContacts = (contactsRef.current ?? []).filter(contact => !contact.isDemo);
    if (realContacts.length > 0 || hasSeenSoldBookNudge()) return;
    startSoldBookGuide('last_month');
  };

  const finishGuideWithRex = (wave: SoldBookWave, ids: string[]) => {
    setSoldBookGuideWave(null);
    setSoldBookMissionIds(ids);
    setSoldBookMission(wave === 'last_month' ? 'sold_book_last_month' : 'sold_book_previous_month');
    setRexCoachOpen(true);
  };

  const finishSoldBookMission = async () => {
    if (!soldBookMission || soldBookMissionIds.length === 0 || soldBookDraftingRef.current) return;
    soldBookDraftingRef.current = true;
    try {
      const chosen = (contactsRef.current ?? []).filter(contact => soldBookMissionIds.includes(contact.id) && !contact.isDemo && !contact.doNotContact);
      if (chosen.length === 0) throw new Error('No sendable sold customers were found.');
      const isLastMonth = soldBookMission === 'sold_book_last_month';
      const draft = await createBlastDraft({
        intent: isLastMonth
          ? 'Warm ownership outreach to customers I sold last month. Check how the vehicle is treating them and offer useful ownership help. Referral language only when context supports it.'
          : 'Warm ownership outreach to customers I sold the month before last. Reconnect around ownership, useful help, second delivery, or a natural referral opportunity when appropriate.',
        filterSummary: `${chosen.length} ${isLastMonth ? 'last-month' : 'previous-month'} sold customer${chosen.length === 1 ? '' : 's'}`,
        promotion: {}, contacts: chosen,
      });
      setBlastDraft(draft);
      setRexCoachOpen(false);
    } catch (e: any) {
      setRexActionError(e?.message ?? 'Could not build the sold-customer Text Queue.');
    } finally { soldBookDraftingRef.current = false; }
  };

  const reloadContactsRef = useRef(reloadContacts);
  reloadContactsRef.current = reloadContacts;
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const fired = await materializeDueResponses();
      if (!cancelled && fired > 0) reloadContactsRef.current();
    };
    void tick();
    const iv = setInterval(() => { void tick(); }, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const tags = useTags(tagsRefetchKey, authReady);
  const { items: notifItems, unread: notifUnread } = useNotifications(contacts, nurtureRefetchKey, authReady);
  const activeCount = useMemo(() => (contacts ?? []).filter(c => c.tier === 'hot' || c.tier === 'warm').length, [contacts]);
  const totalCount = contacts?.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    const lastUserIdRef = { current: null as string | null };
    let sessionClear: Promise<void> = Promise.resolve();
    const finishBoot = async () => {
      await sessionClear;
      if (cancelled) return;
      await hydrateRepSettings();
      if (cancelled) return;
      await syncOnboardingFromProfile().catch(() => undefined);
      if (cancelled) return;
      setNeedsAuth(false);
      try {
        const admin = await checkIsAdmin();
        if (cancelled) return;
        setIsAdmin(admin);
        if (admin) countOpenTickets().then(c => { if (!cancelled) setAdminOpenTicketCount(c); }).catch(() => {});
      } catch {}
      if (cancelled) return;
      setAuthReady(true);
      warmBrain();
      rolloverCoachLog().catch(() => undefined);
      if (!hasCompletedOnboarding()) setOnboardingOpen(true);
      registerForPush().catch(() => undefined);
      captureTimezone().catch(() => undefined);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) { lastUserIdRef.current = session.user.id; finishBoot(); }
      else setNeedsAuth(true);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_IN' && session?.user) {
        if (lastUserIdRef.current === session.user.id) return;
        lastUserIdRef.current = session.user.id;
        finishBoot();
      } else if (event === 'SIGNED_OUT') {
        lastUserIdRef.current = null;
        installPromptContinuesOnboardingRef.current = false;
        setNeedsAuth(true); setAuthReady(false); setActive('heat'); setSearchFocusKey(0); setSelectedId(null);
        setDealLoggerOpen(false); setDealLoggerPrefill(undefined); setSelectedDeal(null); setBulkTagOpen(false);
        setAddContactOpen(false); setImportOpen(false); setVehicleFinderOpen(false); setVehicleFinderPrefill(null);
        setOnboardingOpen(false); setInstallPromptOpen(false); setGamePlanOpen(false); setWorkBookOpen(false);
        setCallQueueContacts(null); setRexActivityOpen(false); setBlastDraft(null); setStalledOpen(false); setStalledReport(null);
        setStalledLoading(false); setNurtureReviewerOpen(false); setPayPlanOpen(false); setNotifOpen(false); setRexCoachOpen(false);
        setSoldBookPromptWave(null); setSoldBookGuideWave(null); setSoldBookMission(null); setSoldBookMissionIds([]);
        if (soldBookNudgeTimerRef.current) clearTimeout(soldBookNudgeTimerRef.current);
        setSupportChatOpen(false); setAdminSupportOpen(false); setIsAdmin(false); setAdminOpenTicketCount(0);
        setRexActionError(null); setContactActionNotice(null); setRefreshing(false);
        sessionClear = clearLocalSessionState().catch(() => undefined);
        void sessionClear.finally(() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
        });
      }
    });
    return () => { cancelled = true; authSub.subscription.unsubscribe(); };
  }, []);

  const handleTryDemo = async () => { await ensureDemoSession(); };

  useEffect(() => {
    if (!rexActionError) return;
    const id = setTimeout(() => setRexActionError(null), 6000);
    return () => clearTimeout(id);
  }, [rexActionError]);
  useEffect(() => {
    if (!contactActionNotice) return;
    const id = setTimeout(() => setContactActionNotice(null), 3500);
    return () => clearTimeout(id);
  }, [contactActionNotice]);

  const handleOrbPress = () => setRexCoachOpen(true);
  const selected = selectedId ? contacts?.find(c => c.id === selectedId) ?? null : null;
  const openDealLogger = (prefill?: DealLoggerPrefill) => { setDealLoggerPrefill(prefill); setDealLoggerOpen(true); };
  const openVehicleFinder = (prefill?: FindVehiclesPayload) => { setVehicleFinderPrefill(prefill ?? null); setVehicleFinderOpen(true); };

  const openStalledAnalysis = async (opts?: { daysSilentThreshold?: number; includeDead?: boolean }) => {
    setStalledOpen(true); setStalledReport(null); setStalledLoading(true);
    try { setStalledReport(await analyzeStalledLeads({ daysSilentThreshold: opts?.daysSilentThreshold ?? 7, includeDead: opts?.includeDead ?? false })); }
    catch (e) { console.warn('stalled analysis failed', e); setRexActionError('Could not analyze stalled leads. Try again.'); }
    finally { setStalledLoading(false); }
  };

  const openBlastFromRex = async (payload: CreateBlastSequencePayload) => {
    // DNC contacts must never be drafted into a Rex-initiated blast, even
    // though the eventual send is separately blocked by launchSms — drafting
    // still exposes their notes to the AI provider and shows a ready-to-send
    // card for someone who opted out.
    const chosen = (contacts ?? []).filter(contact => payload.contact_ids.includes(contact.id) && !contact.doNotContact);
    if (chosen.length === 0) throw new Error('No matching contacts were found for that blast.');
    try {
      setBlastDraft(await createBlastDraft({ intent: payload.intent, filterSummary: payload.filter_summary, promotion: payload.promotion ?? {}, contacts: chosen }));
      setRexCoachOpen(false);
    } catch (error: any) { setRexActionError(error?.message ?? 'Could not draft the blast. Try again.'); throw error; }
  };

  const resolveFreshContact = async (contactId: string): Promise<V2Contact> => {
    let contact = contactsRef.current?.find(c => c.id === contactId) ?? null;
    if (!contact) { await reloadContacts(); await new Promise(resolve => setTimeout(resolve, 75)); contact = contactsRef.current?.find(c => c.id === contactId) ?? null; }
    if (!contact) throw new Error('Customer was saved, but the card is still refreshing. Try again.');
    return contact;
  };

  const draftFirstThankYou = async (contactId: string) => {
    const contact = await resolveFreshContact(contactId);
    setBlastDraft(await createBlastDraft({
      intent: 'Immediate first thank-you after a new customer interaction. Use the customer’s actual vehicle, trade, timing, notes, and relationship context when present. Sound like a sharp human salesperson, not a CRM. Thank them, reinforce that the rep is their point of contact, and create one natural next step. Do not invent pricing, promotions, urgency, or facts.',
      filterSummary: `First thank-you · ${contact.name}`, promotion: {}, contacts: [contact],
    }));
    setRexCoachOpen(false);
  };

  const enrollFreshUpFromRex = async (contactId: string) => {
    const { data: sequence, error: sequenceError } = await supabase.from('sequences').select('id').eq('is_template', true).eq('name', 'Fresh Up - 14 Day').maybeSingle();
    if (sequenceError) throw sequenceError;
    if (!sequence?.id) throw new Error('Fresh Up — 14 Day is not available yet.');
    await enrollContactInSequence(contactId, sequence.id);
    setContactActionNotice('Added to Fresh Up — 14 Day');
  };

  const startWorkBookTextQueue = async (chosen: V2Contact[]) => {
    if (chosen.length === 0) return;
    try {
      setBlastDraft(await createBlastDraft({
        intent: 'Work my book with individualized follow-up based on each customer’s real context, relationship, vehicle, timing, and last-touch history. Create a natural reason to reconnect. Do not repeat one generic message across the list. Do not fabricate promotions or urgency.',
        filterSummary: `${chosen.length} Rex-prioritized customer${chosen.length === 1 ? '' : 's'}`, promotion: {}, contacts: chosen,
      }));
      setWorkBookOpen(false);
    } catch (e: any) { setRexActionError(e?.message ?? 'Could not build the Text Queue. Try again.'); }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (active === 'metrics') setDealsRefetchKey(k => k + 1);
      else if (active === 'profile') setPayPlanRefetchKey(k => k + 1);
      else await reloadContacts();
    } finally { setRefreshing(false); }
  }, [active, reloadContacts]);

  const closeTopOverlay = () => {
    if (supportChatOpen) { setSupportChatOpen(false); return; }
    if (adminSupportOpen) { setAdminSupportOpen(false); return; }
    if (rexCoachOpen) { setRexCoachOpen(false); return; }
    if (soldBookGuideWave) { setSoldBookGuideWave(null); return; }
    if (notifOpen) { setNotifOpen(false); return; }
    if (stalledOpen) { setStalledOpen(false); setStalledReport(null); return; }
    if (nurtureReviewerOpen) { setNurtureReviewerOpen(false); return; }
    if (payPlanOpen) { setPayPlanOpen(false); return; }
    if (blastDraft) { setBlastDraft(null); return; }
    if (callQueueContacts) { setCallQueueContacts(null); return; }
    if (rexActivityOpen) { setRexActivityOpen(false); return; }
    if (gamePlanOpen) { setGamePlanOpen(false); return; }
    if (workBookOpen) { setWorkBookOpen(false); return; }
    if (addContactOpen) { setAddContactOpen(false); return; }
    if (importOpen) { setImportOpen(false); return; }
    if (vehicleFinderOpen) { setVehicleFinderOpen(false); setVehicleFinderPrefill(null); return; }
    if (bulkTagOpen) { setBulkTagOpen(false); return; }
    if (selectedDeal) { setSelectedDeal(null); return; }
    if (dealLoggerOpen) { setDealLoggerOpen(false); return; }
    if (selectedId) { setSelectedId(null); return; }
  };
  const anyOverlayOpen = supportChatOpen || adminSupportOpen || rexCoachOpen || !!soldBookGuideWave || notifOpen || stalledOpen || nurtureReviewerOpen || payPlanOpen || !!blastDraft || gamePlanOpen || workBookOpen || !!callQueueContacts || rexActivityOpen || addContactOpen || importOpen || vehicleFinderOpen || bulkTagOpen || !!selectedDeal || dealLoggerOpen || !!selectedId;
  const closeTopRef = useRef(closeTopOverlay); closeTopRef.current = closeTopOverlay;
  const anyOverlayOpenRef = useRef(anyOverlayOpen); anyOverlayOpenRef.current = anyOverlayOpen;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPop = () => {
      if (anyOverlayOpenRef.current) { closeTopRef.current(); window.history.pushState({ pocketrepOverlay: true }, ''); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (anyOverlayOpen) window.history.pushState({ pocketrepOverlay: true }, '');
  }, [anyOverlayOpen]);

  if (needsAuth) return <AuthScreen onTryDemo={Platform.OS === 'web' ? handleTryDemo : undefined} />;
  if (access.status === 'locked') return <LockoutScreen reason={access.reason} onResubscribe={() => openMarketing()} onSignOut={() => { signOutAndReset(); }} />;
  if (isAdmin && authReady) return <View style={styles.root}><OwnerControlCenter onSignOut={() => signOutAndReset()} /></View>;

  return (
    <View style={styles.root}>
      <CustomNavBar active={active} unread={notifUnread} activeCount={activeCount} totalCount={totalCount}
        onNotifications={() => setNotifOpen(true)} onSearch={() => { setActive('contacts'); setSearchFocusKey(k => k + 1); }} onUpgrade={() => setActive('profile')} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />}>
        {!authReady ? <Text style={styles.placeholder}>Signing in…</Text> : active === 'heat' ? (
          <HeatSheetTab contacts={contacts} error={error} onRetry={reloadContacts} onSelect={c => setSelectedId(c.id)} onAddContact={() => setAddContactOpen(true)}
            onImportContacts={isContactImportEnabled() ? () => setImportOpen(true) : undefined} nurtureRefetchKey={nurtureRefetchKey}
            onOpenNurture={() => setNurtureReviewerOpen(true)} onAnalyzeStalled={() => openStalledAnalysis()} onOpenGamePlan={() => setWorkBookOpen(true)} />
        ) : active === 'contacts' ? (
          <ContactsTab contacts={contacts} error={error} onRetry={reloadContacts} tags={tags} onSelect={c => setSelectedId(c.id)} onBulkTag={() => setBulkTagOpen(true)}
            onAddContact={() => setAddContactOpen(true)} onImportContacts={isContactImportEnabled() ? () => setImportOpen(true) : undefined}
            onFindVehicles={isVehicleFinderEnabled() ? () => openVehicleFinder() : undefined} searchFocusKey={searchFocusKey}
            onDeleteTag={async (name) => { try { await deleteTag(name); } catch (e) { console.warn('deleteTag failed', e); } setTagsRefetchKey(k => k + 1); reloadContacts(); }} />
        ) : active === 'profile' ? (
          <ProfileTab onOpenGamePlan={() => setWorkBookOpen(true)} onOpenRexActivity={() => setRexActivityOpen(true)} onReplayOnboarding={() => setOnboardingOpen(true)}
            onOpenPayPlan={() => setPayPlanOpen(true)} onInstallApp={() => { installPromptContinuesOnboardingRef.current = false; setInstallPromptOpen(true); }}
            onNavigate={setActive} onOpenSupport={() => setSupportChatOpen(true)} isAdmin={isAdmin} onOpenAdminSupport={() => setAdminSupportOpen(true)}
            adminOpenTicketCount={adminOpenTicketCount} payPlanRefetchKey={payPlanRefetchKey} />
        ) : <MetricsTab refetchKey={dealsRefetchKey} onLogDeal={() => openDealLogger()} onSelectDeal={d => setSelectedDeal(d)} />}
      </ScrollView>

      <TabBar active={active} onChange={setActive} orbState="idle" onOrbPress={handleOrbPress} />

      {selected ? <ContactDetail contact={selected} allContacts={contacts ?? []} onOpenContact={(id) => setSelectedId(id)} onClose={() => setSelectedId(null)}
        onLocalUpdate={(next: V2Contact) => patchLocal(next.id, next)} onDeleted={() => { reloadContacts(); setSelectedId(null); setContactActionNotice('Contact removed from your book'); }}
        dealsRefetchKey={dealsRefetchKey} onLogDeal={() => openDealLogger({ name: selected.name, vehicle: selected.vehicle, contactId: selected.id })} /> : null}

      <DealLogger open={dealLoggerOpen} prefill={dealLoggerPrefill} onClose={() => setDealLoggerOpen(false)} onSaved={() => setDealsRefetchKey(k => k + 1)} />
      <DealDetail deal={selectedDeal} onClose={() => setSelectedDeal(null)} onDeleted={() => setDealsRefetchKey(k => k + 1)} />
      <BulkTagFlow open={bulkTagOpen} contacts={contacts ?? []} allTags={tags} onClose={() => setBulkTagOpen(false)} onApplied={() => { setTagsRefetchKey(k => k + 1); reloadContacts(); }} />
      <AddContactModal open={addContactOpen} allContacts={contacts ?? []} onClose={() => setAddContactOpen(false)} onCreated={() => { clearDemoSim(); reloadContacts(); setActive('contacts'); }} />
      <ImportContactsModal open={importOpen} allContacts={contacts ?? []} onClose={() => setImportOpen(false)} onImported={(count) => { clearDemoSim(); reloadContacts(); setActive('contacts'); setContactActionNotice(`${count} contact${count === 1 ? '' : 's'} imported`); }} />
      {isVehicleFinderEnabled() ? <VehicleFinderModal open={vehicleFinderOpen} prefill={vehicleFinderPrefill} onClose={() => { setVehicleFinderOpen(false); setVehicleFinderPrefill(null); }} /> : null}

      <RexOnboarding open={onboardingOpen} onClose={(completed) => {
        if (completed) { void markOnboardingComplete(); armSoldBookNudge(); }
        setOnboardingOpen(false);
        if (!completed) return;
        if (shouldAutoPrompt()) {
          installPromptContinuesOnboardingRef.current = true;
          setTimeout(() => setInstallPromptOpen(true), 600);
        } else {
          installPromptContinuesOnboardingRef.current = false;
          setTimeout(startFirstRealMission, 300);
        }
      }} />

      {soldBookPromptWave ? (
        <View style={styles.soldBookPromptRoot}>
          <Pressable style={styles.soldBookPromptScrim} onPress={() => { if (soldBookPromptWave === 'last_month') markSoldBookNudgeSeen(); setSoldBookPromptWave(null); }} />
          <View style={styles.soldBookPromptCard}>
            <Text style={styles.soldBookPromptKicker}>REX · FIRST REAL MISSION</Text>
            <Text style={styles.soldBookPromptTitle}>{soldBookPromptWave === 'last_month' ? 'Ready to try this with your customers?' : 'Nice. Now add the month before that.'}</Text>
            <Text style={styles.soldBookPromptBody}>{soldBookPromptWave === 'last_month'
              ? 'Start with people you sold last month. Tell Rex the name, number, vehicle and whatever you remember. When you hit Done, Rex builds the Text Queue.'
              : 'Add the previous month while the first outreach has time to work. Rex will build the next personalized queue the same way.'}</Text>
            <Pressable onPress={() => startSoldBookGuide(soldBookPromptWave)} style={styles.soldBookPromptPrimary}><Text style={styles.soldBookPromptPrimaryText}>{soldBookPromptWave === 'last_month' ? 'START WITH LAST MONTH' : 'ADD PREVIOUS MONTH'}</Text></Pressable>
            <Pressable onPress={() => { if (soldBookPromptWave === 'last_month') markSoldBookNudgeSeen(); setSoldBookPromptWave(null); }} style={styles.soldBookPromptSecondary}><Text style={styles.soldBookPromptSecondaryText}>Not now</Text></Pressable>
          </View>
        </View>
      ) : null}

      <SoldBookGuide open={!!soldBookGuideWave} wave={soldBookGuideWave} existingContacts={contacts ?? []} onClose={() => setSoldBookGuideWave(null)} onFinishWithRex={async (ids) => {
        if (!soldBookGuideWave) return;
        const wave = soldBookGuideWave;
        await reloadContacts();
        setTimeout(() => finishGuideWithRex(wave, ids), 50);
      }} />

      <PWAInstallPrompt open={installPromptOpen} onClose={() => {
        setInstallPromptOpen(false);
        if (!installPromptContinuesOnboardingRef.current) return;
        installPromptContinuesOnboardingRef.current = false;
        setTimeout(startFirstRealMission, 150);
      }} />

      <WorkMyBookSheet open={workBookOpen} contacts={contacts ?? []} onClose={() => setWorkBookOpen(false)} onStartCallQueue={(rows) => { setWorkBookOpen(false); setCallQueueContacts(rows); }}
        onStartTextQueue={startWorkBookTextQueue} onOpenSequences={() => { setWorkBookOpen(false); setGamePlanOpen(true); }} />
      <GamePlanSheet open={gamePlanOpen} onClose={() => setGamePlanOpen(false)} />
      {callQueueContacts ? <CallQueue contacts={callQueueContacts} onClose={() => setCallQueueContacts(null)} /> : null}
      <RexActivityViewer open={rexActivityOpen} contacts={contacts ?? []} onClose={() => setRexActivityOpen(false)} />

      <BlastSequenceDrafter open={!!blastDraft} draft={blastDraft} contacts={contacts ?? []} onClose={() => {
        setBlastDraft(null);
        if (soldBookMission) { setSoldBookMission(null); setSoldBookMissionIds([]); }
      }} onSent={() => {
        const finishedMission = soldBookMission;
        setBlastDraft(null); reloadContacts(); setSoldBookMission(null); setSoldBookMissionIds([]);
        if (finishedMission === 'sold_book_last_month') setTimeout(() => setSoldBookPromptWave('previous_month'), 500);
      }} />

      <PayPlanEditor open={payPlanOpen} plan={payPlan} onClose={() => setPayPlanOpen(false)} onSaved={() => setPayPlanRefetchKey(k => k + 1)} />
      <NurtureReviewer open={nurtureReviewerOpen} onClose={() => setNurtureReviewerOpen(false)} onChanged={() => setNurtureRefetchKey(k => k + 1)} />
      <NotificationsCenter open={notifOpen} items={notifItems} onClose={() => setNotifOpen(false)} onOpenContact={(id) => setSelectedId(id)} onOpenNurture={() => setNurtureReviewerOpen(true)} onChanged={() => setNurtureRefetchKey(k => k + 1)} />

      <RexCoach open={rexCoachOpen} onClose={() => setRexCoachOpen(false)} contacts={contacts ?? []} payPlan={payPlan} initialContactId={selected?.id ?? null}
        mission={soldBookMission} missionCount={soldBookMissionIds.length} onFinishMission={finishSoldBookMission} onOpenContact={(id) => setSelectedId(id)}
        onDraftFirstText={draftFirstThankYou} onEnrollFreshUp={enrollFreshUpFromRex} onActed={async (action, result) => {
          const t = action.type;
          if (t === 'create_blast_sequence') { await openBlastFromRex(action.payload); return; }
          if (t === 'log_deal') setDealsRefetchKey(k => k + 1);
          if (t === 'add_contact' || t === 'update_notes' || t === 'schedule_followup' || t === 'retier_contact') await reloadContacts();
          if (soldBookMission && t === 'add_contact' && result?.openContactId) setSoldBookMissionIds(prev => prev.includes(result.openContactId!) ? prev : [...prev, result.openContactId!]);
          if (t === 'create_reminder') setNurtureRefetchKey(k => k + 1);
          if (t === 'find_vehicles' && isVehicleFinderEnabled()) { setRexCoachOpen(false); openVehicleFinder(action.payload); }
        }} />

      <SupportChat open={supportChatOpen} onClose={() => setSupportChatOpen(false)} />
      {isAdmin ? <AdminSupportDashboard open={adminSupportOpen} onClose={() => { setAdminSupportOpen(false); countOpenTickets().then(setAdminOpenTicketCount).catch(() => {}); }} /> : null}
      <StalledLeadsAnalysis open={stalledOpen} report={stalledReport} loading={stalledLoading} onClose={() => { setStalledOpen(false); setStalledReport(null); }} onKilled={() => reloadContacts()}
        onOpenContact={(id) => { setStalledOpen(false); setStalledReport(null); setSelectedId(id); }} onDispatchBlast={(rows: StalledRecommendation[]) => {
          setBlastDraft({ sequence_id: '', intent: 'Re-engage stalled leads', filter_summary: `${rows.length} re-engagement${rows.length === 1 ? '' : 's'}`, promotion: {}, drafted_steps: rows.map(r => ({
            contact_id: r.contact_id, contact_name: r.contact_name, language: r.suggested_language, message: r.suggested_opener, game_plan: r.reason,
            hook_used: r.recommendation === 'PUSH' ? 'calendar_event' : 'rapport', char_count: r.suggested_opener.length,
          })) });
        }} />

      {rexActionError ? <View style={styles.errorBanner} pointerEvents="box-none"><Text style={styles.errorBannerText}>{rexActionError}</Text></View> : null}
      {contactActionNotice ? <View style={styles.noticeBanner} pointerEvents="none" accessibilityLiveRegion="polite"><Text style={styles.noticeBannerText}>✓ {contactActionNotice}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  content: { flex: 1 },
  contentInner: { paddingBottom: 20 },
  placeholder: { fontSize: 13, fontWeight: '500', color: colors.grey2, marginHorizontal: 16, lineHeight: 19, marginTop: 18 },
  errorBanner: { position: 'absolute', left: 12, right: 12, bottom: 168, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.red, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  errorBannerText: { color: colors.red, fontSize: 13, fontWeight: '600' },
  noticeBanner: { position: 'absolute', left: 12, right: 12, bottom: 168, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  noticeBannerText: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  soldBookPromptRoot: { ...StyleSheet.absoluteFillObject, zIndex: 94, alignItems: 'center', justifyContent: 'flex-end' } as any,
  soldBookPromptScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.78)' } as any,
  soldBookPromptCard: { width: '100%', paddingHorizontal: 22, paddingTop: 22, paddingBottom: Platform.OS === 'web' ? ('max(28px, env(safe-area-inset-bottom))' as any) : 28, backgroundColor: colors.ink2, borderTopWidth: 1, borderTopColor: colors.goldBorder, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  soldBookPromptKicker: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  soldBookPromptTitle: { color: colors.white, fontSize: 24, lineHeight: 29, fontWeight: '800', marginTop: 8 },
  soldBookPromptBody: { color: colors.grey3, fontSize: 14, lineHeight: 21, marginTop: 10 },
  soldBookPromptPrimary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.gold, marginTop: 18 },
  soldBookPromptPrimaryText: { color: colors.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  soldBookPromptSecondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  soldBookPromptSecondaryText: { color: colors.grey2, fontSize: 12, fontWeight: '700' },
});
