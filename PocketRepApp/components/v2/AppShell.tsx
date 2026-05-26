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
import BulkTagFlow from './BulkTagFlow';
import AddContactModal from './AddContactModal';
import RexDisclosure from './RexDisclosure';
import HeyRexSheet from './HeyRexSheet';
import Onboarding from './Onboarding';
import GamePlanSheet from './GamePlanSheet';
import BlastSequenceDrafter from './BlastSequenceDrafter';
import StalledLeadsAnalysis from './StalledLeadsAnalysis';
import NurtureReviewer from './NurtureReviewer';
import { createBlastDraft, type BlastDraft } from '@/lib/v2/blastSequences';
import {
  analyzeStalledLeads,
  type StalledReport,
  type StalledRecommendation,
} from '@/lib/v2/stalledLeads';
import { scheduleNurtureBlast } from '@/lib/v2/nurtureEngine';
import { ensureDemoSession } from '@/lib/v2/demoAuth';
import { registerForPush } from '@/lib/v2/pushNotifications';
import { useContacts, type V2Contact } from '@/lib/v2/useContacts';
import { useTags } from '@/lib/v2/useTags';
import {
  getAlwaysListenEnabled,
  hasSeenDisclosure,
  markDisclosureSeen,
  setAlwaysListenEnabled,
  subscribeAlwaysListen,
  hasCompletedOnboarding,
  markOnboardingComplete,
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

  const { contacts, error, patchLocal, reload: reloadContacts } = useContacts();
  const tags = useTags(tagsRefetchKey);
  const tagNames = useMemo(() => tags.map(t => t.name), [tags]);

  const rex = useHeyRex({
    enabled: authReady && alwaysListen,
    contacts: contacts ?? [],
    tagNames,
  });

  useEffect(() => {
    ensureDemoSession().finally(() => {
      setAuthReady(true);
      setAlwaysListen(getAlwaysListenEnabled());
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

  const cycleOrb = () => {
    // With always-listen on, the orb is driven by the listener — tap to cancel
    // a pending action. With it off, fall back to the demo cycle.
    if (alwaysListen) {
      if (rex.action || rex.state !== 'idle') rex.cancel();
      return;
    }
    const order: OrbState[] = ['idle', 'listening', 'processing', 'saved'];
    const next = order[(order.indexOf(orbState) + 1) % order.length];
    setOrbState(next);
    if (next === 'saved') {
      setTimeout(() => setOrbState('idle'), 1800);
    }
  };

  const selected = selectedId
    ? contacts?.find(c => c.id === selectedId) ?? null
    : null;

  const openDealLogger = (prefill?: DealLoggerPrefill) => {
    setDealLoggerPrefill(prefill);
    setDealLoggerOpen(true);
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
      } finally {
        setSchedulingNurture(false);
      }
    }
    // Stalled lead analysis: open the overlay, run the analyzer in parallel.
    if (stalledPayload) {
      setStalledOpen(true);
      setStalledReport(null);
      setStalledLoading(true);
      try {
        const report = await analyzeStalledLeads({
          daysSilentThreshold: stalledPayload.days_silent_threshold ?? 14,
          includeDead: stalledPayload.include_dead ?? false,
        });
        setStalledReport(report);
      } catch (e) {
        console.warn('stalled analysis failed', e);
      } finally {
        setStalledLoading(false);
      }
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
        } finally {
          setBlastDrafting(false);
        }
      }
    }
  };

  return (
    <View style={styles.root}>
      <CustomNavBar active={active} />

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
          />
        ) : active === 'contacts' ? (
          <ContactsTab
            contacts={contacts}
            error={error}
            tags={tags}
            onSelect={c => setSelectedId(c.id)}
            onBulkTag={() => setBulkTagOpen(true)}
            onAddContact={() => setAddContactOpen(true)}
          />
        ) : active === 'profile' ? (
          <ProfileTab
            onOpenGamePlan={() => setGamePlanOpen(true)}
            onReplayOnboarding={() => setOnboardingOpen(true)}
          />
        ) : (
          <MetricsTab refetchKey={dealsRefetchKey} onLogDeal={() => openDealLogger()} />
        )}
      </ScrollView>

      <TabBar active={active} onChange={setActive} orbState={orbState} onOrbPress={cycleOrb} />

      {selected ? (
        <ContactDetail
          contact={selected}
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

      <NurtureReviewer
        open={nurtureReviewerOpen}
        onClose={() => setNurtureReviewerOpen(false)}
        onChanged={() => setNurtureRefetchKey(k => k + 1)}
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
});
