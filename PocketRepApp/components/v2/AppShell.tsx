import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Platform } from 'react-native';
import { colors } from '@/constants/theme';
import CustomNavBar, { TabId } from './CustomNavBar';
import TabBar from './TabBar';
import { OrbState } from './HeyRexOrb';
import HeatSheetTab from './HeatSheetTab';
import ContactsTab from './ContactsTab';
import ContactDetail from './ContactDetail';
import ProfileTab from './ProfileTab';
import MetricsTab from './MetricsTab';
import DealLogger, { type DealLoggerPrefill } from './DealLogger';
import DealDetail from './DealDetail';
import BulkTagFlow from './BulkTagFlow';
import AddContactModal from './AddContactModal';
import ImportContactsModal from './ImportContactsModal';
import RexDisclosure from './RexDisclosure';
import HeyRexSheet from './HeyRexSheet';
import RexOnboarding from './RexOnboarding';
import GamePlanSheet from './GamePlanSheet';
import RexActivityViewer from './RexActivityViewer';
import BlastSequenceDrafter from './BlastSequenceDrafter';
import StalledLeadsAnalysis from './StalledLeadsAnalysis';
import NurtureReviewer from './NurtureReviewer';
import PayPlanEditor from './PayPlanEditor';
import NotificationsCenter from './NotificationsCenter';
import RexCoach from './RexCoach';
import LockoutScreen from './LockoutScreen';
import AuthScreen from './AuthScreen';
import { createBlastDraft, type BlastDraft } from '@/lib/v2/blastSequences';
import { warmBrain } from '@/lib/v2/aiProxy';
import { rolloverCoachLog } from '@/lib/v2/coachLog';
import { usePayPlan } from '@/lib/v2/payPlan';
import {
  analyzeStalledLeads,
  type StalledReport,
  type StalledRecommendation,
} from '@/lib/v2/stalledLeads';
import { scheduleNurtureBlast } from '@/lib/v2/nurtureEngine';
import { useNotifications } from '@/lib/v2/notifications';
import { ensureDemoSession } from '@/lib/v2/demoAuth';
import { clearLocalSessionState, signOutAndReset } from '@/lib/v2/localSessionClear';
import { registerForPush } from '@/lib/v2/pushNotifications';
import { useContacts, type V2Contact } from '@/lib/v2/useContacts';
import { useTags } from '@/lib/v2/useTags';
import { deleteTag } from '@/lib/v2/tagMutations';
import type { V2DealRich } from '@/lib/v2/useUserDeals';
import {
  getAlwaysListenEnabled,
  hasSeenDisclosure,
  markDisclosureSeen,
  setAlwaysListenEnabled,
  subscribeAlwaysListen,
  hasCompletedOnboarding,
  markOnboardingComplete,
  syncOnboardingFromProfile,
} from '@/lib/v2/rexSettings';
import { useHeyRex } from '@/lib/v2/useHeyRex';
import { isContactImportEnabled } from '@/lib/v2/rexFeatureFlags';
import { useAccessGate } from '@/lib/v2/accessGate';
import { supabase } from '@/lib/supabase';
import { captureTimezone } from '@/lib/v2/sendTime';

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [authReady, setAuthReady] = useState(false);
  // True once we've checked for a session and found none — renders AuthScreen
  // instead of the app shell. Stays false (shell shows "Signing in…") while the
  // initial session check is still in flight, so there's no AuthScreen flash for
  // a returning signed-in visitor.
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
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [alwaysListen, setAlwaysListen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [gamePlanOpen, setGamePlanOpen] = useState(false);
  const [rexActivityOpen, setRexActivityOpen] = useState(false);
  const [blastDraft, setBlastDraft] = useState<BlastDraft | null>(null);
  const [blastDrafting, setBlastDrafting] = useState(false);
  const [stalledOpen, setStalledOpen] = useState(false);
  const [stalledReport, setStalledReport] = useState<StalledReport | null>(null);
  const [stalledLoading, setStalledLoading] = useState(false);
  const [nurtureReviewerOpen, setNurtureReviewerOpen] = useState(false);
  const [nurtureRefetchKey, setNurtureRefetchKey] = useState(0);
  const [schedulingNurture, setSchedulingNurture] = useState(false);
  const [payPlanOpen, setPayPlanOpen] = useState(false);
  const [payPlanRefetchKey, setPayPlanRefetchKey] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [rexCoachOpen, setRexCoachOpen] = useState(false);
  const [rexActionError, setRexActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const payPlan = usePayPlan(payPlanRefetchKey);
  // HARD LOCKOUT gate — inert until Eduardo wires the real subscription read in
  // accessGate.ts (it returns 'allowed' today, so no behavior change). See the
  // early return below + docs/MASTER_PLAN.md §"Gated P0 — Eduardo only".
  const access = useAccessGate();

  const { contacts, error, patchLocal, reload: reloadContacts } = useContacts();
  const tags = useTags(tagsRefetchKey);
  const tagNames = useMemo(() => tags.map(t => t.name), [tags]);
  const { items: notifItems, unread: notifUnread } = useNotifications(
    contacts,
    nurtureRefetchKey,
  );
  // "active" = hot + warm leads (the rep's working pipeline).
  const activeCount = useMemo(
    () => (contacts ?? []).filter(c => c.tier === 'hot' || c.tier === 'warm').length,
    [contacts],
  );
  const totalCount = contacts?.length ?? 0;

  const rex = useHeyRex({
    enabled: authReady && alwaysListen,
    contacts: contacts ?? [],
    tagNames,
    onOpenContact: setSelectedId,
    activeScreen: active,
    selectedContactId: selectedId,
  });

  // P0-1: real sign-in. Every visitor used to be silently auto-signed into one
  // shared demo account here; now we check for an actual session and, if there
  // isn't one, render AuthScreen instead (the demo is still reachable, but only
  // via an explicit "Try the demo" tap — see handleTryDemo). onAuthStateChange
  // is the single source of truth for session presence, so a real sign-in/up
  // (AuthScreen's own supabase calls), a demo sign-in (handleTryDemo below), and
  // a sign-out (LockoutScreen's onSignOut) all flow through the same path.
  useEffect(() => {
    let cancelled = false;
    // Audit finding (MED): Supabase's onAuthStateChange re-fires SIGNED_IN for
    // the SAME user on every tab-visibility-change recovery, not just on a real
    // sign-in — without this guard, finishBoot() (network calls: profile sync,
    // warmBrain, timezone capture) would redundantly re-run on every alt-tab.
    // Also closes the cold-boot race where getSession().then() and the listener
    // can both resolve for the same session near-simultaneously.
    const lastUserIdRef = { current: null as string | null };

    const finishBoot = async () => {
      // Hydrate the localStorage cache from the canonical profile flag so a
      // fresh browser doesn't show the playbook again to a user who already
      // ran through it on another device.
      await syncOnboardingFromProfile().catch(() => undefined);
      if (cancelled) return;
      setNeedsAuth(false);
      setAuthReady(true);
      setAlwaysListen(getAlwaysListenEnabled());
      // Warm the ai-proxy brain on launch so the rep's first Rex call (coach or
      // voice) isn't a 30-60s cold start.
      warmBrain();
      // NEW 6: at the local-day boundary, collapse yesterday's coach log into a
      // recap summary and start today fresh.
      rolloverCoachLog().catch(() => undefined);
      if (!hasSeenDisclosure()) {
        setDisclosureOpen(true);
      } else if (!hasCompletedOnboarding()) {
        setOnboardingOpen(true);
      }
      // Fire-and-forget — push registration is silent on web/unsupported devices.
      registerForPush().catch(() => undefined);
      // Best-effort: record the rep's device timezone on their profile (P2-A3) so
      // the nurture scheduler can later deliver at their local send hour.
      captureTimezone().catch(() => undefined);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        lastUserIdRef.current = session.user.id;
        finishBoot();
      } else {
        setNeedsAuth(true);
      }
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_IN' && session?.user) {
        if (lastUserIdRef.current === session.user.id) return; // redundant re-notify, not a real transition
        lastUserIdRef.current = session.user.id;
        finishBoot();
      } else if (event === 'SIGNED_OUT') {
        lastUserIdRef.current = null;
        setNeedsAuth(true);
        setAuthReady(false);
        // Cross-account leak guard (audit finding, HIGH): AppShell never
        // unmounts across a sign-out/sign-in transition, so useContacts/
        // useTags/usePayPlan/useUserDeals/useNotifications all keep the
        // PREVIOUS rep's data in memory until each independently refetches —
        // a real risk on a shared/kiosk device (rep A signs out, rep B signs
        // in on the same tab and briefly sees rep A's book). A full reload is
        // the simplest guarantee that every hook's state — these five and any
        // other in-memory cache — starts genuinely empty for whoever signs in
        // next. Web only; on native there is no cheap reload equivalent, but
        // native has no real distribution yet (this go-live is web-first).
        //
        // The reload alone isn't enough: several per-user PREFERENCES survive
        // it in localStorage (always-listen mic consent + disclosure-seen,
        // onboarding-seen, the coach chat log) — clearLocalSessionState()
        // closes that (audit finding, HIGH — without it, the next sign-in on
        // this device could inherit always-listening mic consent they never
        // gave).
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          clearLocalSessionState();
          window.location.reload();
        }
      }
    });

    const unsubAlwaysListen = subscribeAlwaysListen(setAlwaysListen);
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      unsubAlwaysListen();
    };
  }, []);

  // The demo stays reachable, but only as an explicit tap on AuthScreen (not an
  // automatic sign-in) — the resulting SIGNED_IN event is picked up by the
  // listener above, so this just needs to trigger the sign-in and let a real
  // failure propagate (AuthScreen shows it) instead of silently doing nothing.
  const handleTryDemo = async () => {
    await ensureDemoSession();
  };

  // Map listener state to the orb visual
  useEffect(() => {
    if (!alwaysListen) { setOrbState('idle'); return; }
    if (rex.state === 'awake') setOrbState('listening');
    else if (rex.thinking || rex.state === 'processing') setOrbState('processing');
    else if (rex.executing) setOrbState('saved');
    else setOrbState('idle');
  }, [rex.state, rex.thinking, rex.executing, alwaysListen]);

  // Surface mic problems on the always-listen path + auto-clear voice-action
  // errors — replaces the old silent console.warns so failures are visible.
  useEffect(() => {
    if (rex.state === 'denied') {
      setRexActionError('Microphone access is blocked. Enable it in your browser settings to use Hey Rex.');
    } else if (rex.state === 'unsupported') {
      setRexActionError("Voice isn't supported in this browser. On iPhone, tap the gold Rex orb to chat instead; on desktop, use Chrome.");
    }
  }, [rex.state]);

  useEffect(() => {
    if (!rexActionError) return;
    const id = setTimeout(() => setRexActionError(null), 6000);
    return () => clearTimeout(id);
  }, [rexActionError]);

  // Tapping the orb opens the Rex Coach chat. Voice ("Hey Rex") remains the
  // only thing that triggers the action-taking assistant — the orb visual still
  // animates with the listener state (see the effect above), but a tap is just
  // the doorway to coaching. A pending voice action is cancelled from the
  // HeyRexSheet's own Cancel button.
  const handleOrbPress = () => setRexCoachOpen(true);

  const selected = selectedId
    ? contacts?.find(c => c.id === selectedId) ?? null
    : null;

  const openDealLogger = (prefill?: DealLoggerPrefill) => {
    setDealLoggerPrefill(prefill);
    setDealLoggerOpen(true);
  };

  // Opens the Stalled Leads analysis overlay and runs the analyzer. Reachable
  // both from a Rex voice action and the Heat Sheet "Review stalled leads" button.
  const openStalledAnalysis = async (opts?: { daysSilentThreshold?: number; includeDead?: boolean }) => {
    setStalledOpen(true);
    setStalledReport(null);
    setStalledLoading(true);
    try {
      const report = await analyzeStalledLeads({
        // 7d (not 14) so a lead that's already flagged "overdue" (4d+) on the
        // Heat Sheet also surfaces here — keeps the two views consistent.
        daysSilentThreshold: opts?.daysSilentThreshold ?? 7,
        includeDead: opts?.includeDead ?? false,
      });
      setStalledReport(report);
    } catch (e) {
      console.warn('stalled analysis failed', e);
      setRexActionError('Could not analyze stalled leads. Try again.');
    } finally {
      setStalledLoading(false);
    }
  };

  const handleRexConfirm = async () => {
    const actionType = rex.action?.type;
    const blastPayload = rex.action?.type === 'create_blast_sequence' ? rex.action.payload : null;
    const stalledPayload = rex.action?.type === 'analyze_stalled_leads' ? rex.action.payload : null;
    const nurturePayload = rex.action?.type === 'schedule_nurture_blast' ? rex.action.payload : null;
    // P2-R3: a chain bundles several writes — capture its steps before confirm()
    // clears the action so we can refresh exactly the surfaces those steps touched.
    const chainSteps = rex.action?.type === 'chain' ? (rex.action.payload.steps ?? []) : [];
    const result = await rex.confirm();
    // Refresh writers' downstream state
    if (actionType === 'log_deal') {
      setDealsRefetchKey(k => k + 1);
    }
    if (actionType === 'add_contact'
      || actionType === 'update_notes'
      || actionType === 'delete_contact'
      || actionType === 'schedule_followup'
      || actionType === 'retier_contact'
      || actionType === 'batch_action'
    ) {
      reloadContacts();
    }
    // A reminder (single action or inside a chain) needs the bell badge to refresh
    // (useNotifications is keyed on nurtureRefetchKey — same as RexCoach.onActed).
    if (actionType === 'create_reminder') setNurtureRefetchKey(k => k + 1);
    // P2-R3: a chain can mix deal + contact + reminder writes — refresh each surface
    // any of its steps actually touched.
    if (actionType === 'chain') {
      const stepTypes = new Set(chainSteps.map(s => s.type));
      if (stepTypes.has('log_deal')) setDealsRefetchKey(k => k + 1);
      if (stepTypes.has('create_reminder')) setNurtureRefetchKey(k => k + 1);
      if (stepTypes.has('add_contact') || stepTypes.has('update_notes')
        || stepTypes.has('delete_contact') || stepTypes.has('schedule_followup')
        || stepTypes.has('retier_contact') || stepTypes.has('batch_action')
      ) {
        reloadContacts();
      }
    }
    if (result?.openContactId) {
      setSelectedId(result.openContactId);
    }
    // Nurture blast: write pending drafts then open the reviewer.
    if (nurturePayload) {
      setSchedulingNurture(true);
      try {
        await scheduleNurtureBlast({
          trigger: nurturePayload.trigger,
          audience: nurturePayload.audience,
          customIntent: nurturePayload.custom_intent,
        });
        setNurtureRefetchKey(k => k + 1);
        setNurtureReviewerOpen(true);
      } catch (e) {
        console.warn('nurture blast failed', e);
        setRexActionError('Could not queue the nurture blast. Try again.');
      } finally {
        setSchedulingNurture(false);
      }
    }
    // Stalled lead analysis: open the overlay, run the analyzer in parallel.
    if (stalledPayload) {
      await openStalledAnalysis({
        daysSilentThreshold: stalledPayload.days_silent_threshold ?? 14,
        includeDead: stalledPayload.include_dead ?? false,
      });
    }
    // Blast sequence: confirm just opens the drafter. The drafter handles its
    // own send-loop and DB writes; we kick off the per-contact brain call now.
    if (blastPayload && (contacts?.length ?? 0) > 0) {
      const selected = (contacts ?? []).filter(c => blastPayload.contact_ids.includes(c.id));
      if (selected.length > 0) {
        setBlastDrafting(true);
        try {
          const draft = await createBlastDraft({
            intent: blastPayload.intent,
            filterSummary: blastPayload.filter_summary,
            promotion: blastPayload.promotion ?? {},
            contacts: selected,
          });
          setBlastDraft(draft);
        } catch (e) {
          console.warn('blast draft failed', e);
          setRexActionError('Could not draft the blast. Try again.');
        } finally {
          setBlastDrafting(false);
        }
      }
    }
  };

  // Pull-to-refresh on the main scroll — reloads the active tab's data.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (active === 'metrics') {
        setDealsRefetchKey(k => k + 1);
      } else if (active === 'profile') {
        setPayPlanRefetchKey(k => k + 1);
      } else {
        await reloadContacts();
      }
    } finally {
      setRefreshing(false);
    }
  }, [active, reloadContacts]);

  // Web back button → peel the topmost overlay instead of leaving the app.
  const closeTopOverlay = () => {
    if (rexCoachOpen) { setRexCoachOpen(false); return; }
    if (notifOpen) { setNotifOpen(false); return; }
    if (stalledOpen) { setStalledOpen(false); setStalledReport(null); return; }
    if (nurtureReviewerOpen) { setNurtureReviewerOpen(false); return; }
    if (payPlanOpen) { setPayPlanOpen(false); return; }
    if (blastDraft) { setBlastDraft(null); return; }
    if (rexActivityOpen) { setRexActivityOpen(false); return; }
    if (gamePlanOpen) { setGamePlanOpen(false); return; }
    if (addContactOpen) { setAddContactOpen(false); return; }
    if (importOpen) { setImportOpen(false); return; }
    if (bulkTagOpen) { setBulkTagOpen(false); return; }
    if (selectedDeal) { setSelectedDeal(null); return; }
    if (dealLoggerOpen) { setDealLoggerOpen(false); return; }
    if (selectedId) { setSelectedId(null); return; }
  };
  const anyOverlayOpen =
    rexCoachOpen || notifOpen || stalledOpen || nurtureReviewerOpen || payPlanOpen ||
    !!blastDraft || gamePlanOpen || rexActivityOpen || addContactOpen || importOpen || bulkTagOpen || !!selectedDeal ||
    dealLoggerOpen || !!selectedId;
  const closeTopRef = useRef(closeTopOverlay);
  closeTopRef.current = closeTopOverlay;
  const anyOverlayOpenRef = useRef(anyOverlayOpen);
  anyOverlayOpenRef.current = anyOverlayOpen;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPop = () => {
      if (anyOverlayOpenRef.current) {
        closeTopRef.current();
        // keep a trap state so the next Back peels the next overlay layer
        window.history.pushState({ pocketrepOverlay: true }, '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // One trap when the first overlay opens; onPop re-pushes for deeper layers.
    if (anyOverlayOpen) window.history.pushState({ pocketrepOverlay: true }, '');
  }, [anyOverlayOpen]);

  // P0-1: no session -> real sign-in/up, with the demo as an explicit fallback
  // (checked before the lockout gate below — an unauthenticated visitor should
  // see "sign in", not "your subscription lapsed").
  if (needsAuth) {
    return (
      <AuthScreen onTryDemo={Platform.OS === 'web' ? handleTryDemo : undefined} />
    );
  }

  // HARD LOCKOUT: when the access gate reports a lapsed account, block the whole
  // app behind the re-subscribe wall. Inert today (gate returns 'allowed').
  // TODO(Eduardo): make useAccessGate read the real subscription state once the
  // Stripe webhook writes it onto profiles (see docs/MASTER_PLAN.md §"Gated P0").
  if (access.status === 'locked') {
    return (
      <LockoutScreen
        reason={access.reason}
        onResubscribe={() => { /* TODO(Eduardo): open Stripe checkout / billing portal */ }}
        onSignOut={() => { signOutAndReset(); }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <CustomNavBar
        active={active}
        unread={notifUnread}
        activeCount={activeCount}
        totalCount={totalCount}
        onNotifications={() => setNotifOpen(true)}
        onSearch={() => setActive('contacts')}
        onUpgrade={() => setActive('profile')}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
      >
        {!authReady ? (
          <Text style={styles.placeholder}>Signing in…</Text>
        ) : active === 'heat' ? (
          <HeatSheetTab
            contacts={contacts}
            error={error}
            onRetry={reloadContacts}
            onSelect={c => setSelectedId(c.id)}
            nurtureRefetchKey={nurtureRefetchKey}
            onOpenNurture={() => setNurtureReviewerOpen(true)}
            onAnalyzeStalled={() => openStalledAnalysis()}
          />
        ) : active === 'contacts' ? (
          <ContactsTab
            contacts={contacts}
            error={error}
            onRetry={reloadContacts}
            tags={tags}
            onSelect={c => setSelectedId(c.id)}
            onBulkTag={() => setBulkTagOpen(true)}
            onAddContact={() => setAddContactOpen(true)}
            onImportContacts={isContactImportEnabled() ? () => setImportOpen(true) : undefined}
            onDeleteTag={async (name) => {
              try { await deleteTag(name); } catch (e) { console.warn('deleteTag failed', e); }
              setTagsRefetchKey(k => k + 1);
              reloadContacts();
            }}
          />
        ) : active === 'profile' ? (
          <ProfileTab
            onOpenGamePlan={() => setGamePlanOpen(true)}
            onOpenRexActivity={() => setRexActivityOpen(true)}
            onReplayOnboarding={() => setOnboardingOpen(true)}
            onOpenPayPlan={() => setPayPlanOpen(true)}
            onNavigate={setActive}
            payPlanRefetchKey={payPlanRefetchKey}
          />
        ) : (
          <MetricsTab
            refetchKey={dealsRefetchKey}
            onLogDeal={() => openDealLogger()}
            onSelectDeal={d => setSelectedDeal(d)}
          />
        )}
      </ScrollView>

      <TabBar active={active} onChange={setActive} orbState={orbState} onOrbPress={handleOrbPress} />

      {selected ? (
        <ContactDetail
          contact={selected}
          allContacts={contacts ?? []}
          onOpenContact={(id) => setSelectedId(id)}
          onClose={() => setSelectedId(null)}
          onLocalUpdate={(next: V2Contact) => patchLocal(next.id, next)}
          onDeleted={() => { reloadContacts(); setSelectedId(null); }}
          dealsRefetchKey={dealsRefetchKey}
          onLogDeal={() => openDealLogger({
            name: selected.name,
            vehicle: selected.vehicle,
            contactId: selected.id,
          })}
        />
      ) : null}

      <DealLogger
        open={dealLoggerOpen}
        prefill={dealLoggerPrefill}
        onClose={() => setDealLoggerOpen(false)}
        onSaved={() => setDealsRefetchKey(k => k + 1)}
      />

      <DealDetail
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onDeleted={() => setDealsRefetchKey(k => k + 1)}
      />

      <BulkTagFlow
        open={bulkTagOpen}
        contacts={contacts ?? []}
        allTags={tags}
        onClose={() => setBulkTagOpen(false)}
        onApplied={() => {
          setTagsRefetchKey(k => k + 1);
          reloadContacts();
        }}
      />

      <AddContactModal
        open={addContactOpen}
        allContacts={contacts ?? []}
        onClose={() => setAddContactOpen(false)}
        onCreated={() => { reloadContacts(); setActive('contacts'); }}
      />

      <ImportContactsModal
        open={importOpen}
        allContacts={contacts ?? []}
        onClose={() => setImportOpen(false)}
        onImported={() => { reloadContacts(); setActive('contacts'); }}
      />

      <RexDisclosure
        open={disclosureOpen}
        onEnable={() => {
          setAlwaysListenEnabled(true);
          setAlwaysListen(true);
          markDisclosureSeen();
          setDisclosureOpen(false);
          if (!hasCompletedOnboarding()) setOnboardingOpen(true);
        }}
        onDecline={() => {
          setAlwaysListenEnabled(false);
          setAlwaysListen(false);
          markDisclosureSeen();
          setDisclosureOpen(false);
          if (!hasCompletedOnboarding()) setOnboardingOpen(true);
        }}
      />

      {/* First-run onboarding: the Rex interview. The old static-carousel
          duplicate (components/v2/Onboarding.tsx) was removed in the onboarding
          consolidation, so this is the single onboarding path. */}
      <RexOnboarding
        open={onboardingOpen}
        onClose={() => {
          markOnboardingComplete();
          setOnboardingOpen(false);
        }}
      />

      <GamePlanSheet
        open={gamePlanOpen}
        onClose={() => setGamePlanOpen(false)}
      />

      <RexActivityViewer
        open={rexActivityOpen}
        contacts={contacts ?? []}
        onClose={() => setRexActivityOpen(false)}
      />

      <HeyRexSheet
        state={rex.state}
        partial={rex.partial}
        thinking={rex.thinking || blastDrafting || schedulingNurture}
        streamingSay={rex.streamingSay}
        speaking={rex.speaking}
        action={rex.action}
        executing={rex.executing}
        error={rex.error}
        contacts={contacts ?? []}
        onConfirm={handleRexConfirm}
        onCancel={rex.cancel}
        onOpenContact={(id) => setSelectedId(id)}
      />

      <BlastSequenceDrafter
        open={!!blastDraft}
        draft={blastDraft}
        contacts={contacts ?? []}
        onClose={() => setBlastDraft(null)}
        onSent={() => {
          setBlastDraft(null);
          reloadContacts();
        }}
      />

      <PayPlanEditor
        open={payPlanOpen}
        plan={payPlan}
        onClose={() => setPayPlanOpen(false)}
        onSaved={() => setPayPlanRefetchKey(k => k + 1)}
      />

      <NurtureReviewer
        open={nurtureReviewerOpen}
        onClose={() => setNurtureReviewerOpen(false)}
        onChanged={() => setNurtureRefetchKey(k => k + 1)}
      />

      <NotificationsCenter
        open={notifOpen}
        items={notifItems}
        onClose={() => setNotifOpen(false)}
        onOpenContact={(id) => { setSelectedId(id); }}
        onOpenNurture={() => setNurtureReviewerOpen(true)}
        onChanged={() => setNurtureRefetchKey(k => k + 1)}
      />

      <RexCoach
        open={rexCoachOpen}
        onClose={() => setRexCoachOpen(false)}
        contacts={contacts ?? []}
        payPlan={payPlan}
        onOpenContact={(id) => setSelectedId(id)}
        onActed={(action) => {
          // Mirror handleRexConfirm's refresh, by action type.
          const t = action.type;
          if (t === 'log_deal') setDealsRefetchKey(k => k + 1);
          if (t === 'add_contact' || t === 'update_notes' || t === 'schedule_followup' || t === 'retier_contact') {
            reloadContacts();
          }
          if (t === 'create_reminder') setNurtureRefetchKey(k => k + 1); // refresh the bell
        }}
      />

      <StalledLeadsAnalysis
        open={stalledOpen}
        report={stalledReport}
        loading={stalledLoading}
        onClose={() => { setStalledOpen(false); setStalledReport(null); }}
        onKilled={() => { reloadContacts(); }}
        onDispatchBlast={(rows: StalledRecommendation[]) => {
          // Use the stalled openers as the starting blast — synthesize a
          // BlastDraft directly (no second brain call) so the rep can review
          // + edit + send in the same flow.
          const draft: BlastDraft = {
            sequence_id: '',
            intent: 'Re-engage stalled leads',
            filter_summary: `${rows.length} re-engagement${rows.length === 1 ? '' : 's'}`,
            promotion: {},
            drafted_steps: rows.map(r => ({
              contact_id: r.contact_id,
              contact_name: r.contact_name,
              language: r.suggested_language,
              message: r.suggested_opener,
              game_plan: r.reason,
              hook_used: r.recommendation === 'PUSH' ? 'calendar_event' : 'rapport',
              char_count: r.suggested_opener.length,
            })),
          };
          setBlastDraft(draft);
        }}
      />

      {rexActionError ? (
        <View style={styles.errorBanner} pointerEvents="box-none">
          <Text style={styles.errorBannerText}>{rexActionError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 20,
  },
  placeholder: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.grey2,
    marginHorizontal: 16,
    lineHeight: 19,
    marginTop: 18,
  },
  errorBanner: {
    position: 'absolute',
    left: 12, right: 12, bottom: 168,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorBannerText: { color: colors.red, fontSize: 13, fontWeight: '600' },
});
