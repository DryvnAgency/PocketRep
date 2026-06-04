import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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
import RexDisclosure from './RexDisclosure';
import HeyRexSheet from './HeyRexSheet';
import Onboarding from './Onboarding';
import GamePlanSheet from './GamePlanSheet';
import BlastSequenceDrafter from './BlastSequenceDrafter';
import StalledLeadsAnalysis from './StalledLeadsAnalysis';
import NurtureReviewer from './NurtureReviewer';
import PayPlanEditor from './PayPlanEditor';
import NotificationsCenter from './NotificationsCenter';
import RexCoach from './RexCoach';
import { createBlastDraft, type BlastDraft } from '@/lib/v2/blastSequences';
import { warmBrain } from '@/lib/v2/aiProxy';
import { usePayPlan } from '@/lib/v2/payPlan';
import {
  analyzeStalledLeads,
  type StalledReport,
  type StalledRecommendation,
} from '@/lib/v2/stalledLeads';
import { scheduleNurtureBlast } from '@/lib/v2/nurtureEngine';
import { useNotifications } from '@/lib/v2/notifications';
import { ensureDemoSession } from '@/lib/v2/demoAuth';
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

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [authReady, setAuthReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dealLoggerOpen, setDealLoggerOpen] = useState(false);
  const [dealLoggerPrefill, setDealLoggerPrefill] = useState<DealLoggerPrefill | undefined>();
  const [dealsRefetchKey, setDealsRefetchKey] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<V2DealRich | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [tagsRefetchKey, setTagsRefetchKey] = useState(0);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [alwaysListen, setAlwaysListen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [gamePlanOpen, setGamePlanOpen] = useState(false);
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
  const payPlan = usePayPlan(payPlanRefetchKey);

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
  });

  useEffect(() => {
    ensureDemoSession().finally(async () => {
      // Hydrate the localStorage cache from the canonical profile flag so a
      // fresh browser doesn't show the playbook again to a user who already
      // ran through it on another device.
      await syncOnboardingFromProfile().catch(() => undefined);
      setAuthReady(true);
      setAlwaysListen(getAlwaysListenEnabled());
      // Warm the ai-proxy brain on launch so the rep's first Rex call (coach or
      // voice) isn't a 30-60s cold start.
      warmBrain();
      if (!hasSeenDisclosure()) {
        setDisclosureOpen(true);
      } else if (!hasCompletedOnboarding()) {
        setOnboardingOpen(true);
      }
      // Fire-and-forget — push registration is silent on web/unsupported devices.
      registerForPush().catch(() => undefined);
    });
    return subscribeAlwaysListen(setAlwaysListen);
  }, []);

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
      setRexActionError("Voice isn't supported in this browser — try Chrome or Safari.");
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
      >
        {!authReady ? (
          <Text style={styles.placeholder}>Signing in…</Text>
        ) : active === 'heat' ? (
          <HeatSheetTab
            contacts={contacts}
            error={error}
            onSelect={c => setSelectedId(c.id)}
            nurtureRefetchKey={nurtureRefetchKey}
            onOpenNurture={() => setNurtureReviewerOpen(true)}
            onAnalyzeStalled={() => openStalledAnalysis()}
          />
        ) : active === 'contacts' ? (
          <ContactsTab
            contacts={contacts}
            error={error}
            tags={tags}
            onSelect={c => setSelectedId(c.id)}
            onBulkTag={() => setBulkTagOpen(true)}
            onAddContact={() => setAddContactOpen(true)}
            onDeleteTag={async (name) => {
              try { await deleteTag(name); } catch (e) { console.warn('deleteTag failed', e); }
              setTagsRefetchKey(k => k + 1);
              reloadContacts();
            }}
          />
        ) : active === 'profile' ? (
          <ProfileTab
            onOpenGamePlan={() => setGamePlanOpen(true)}
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

      <Onboarding
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
