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
import { ensureDemoSession } from '@/lib/v2/demoAuth';
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
    const result = await rex.confirm();
    // Refresh writers' downstream state
    if (rex.action?.type === 'log_deal') {
      setDealsRefetchKey(k => k + 1);
    }
    if (rex.action?.type === 'add_contact'
      || rex.action?.type === 'update_notes'
      || rex.action?.type === 'delete_contact'
      || rex.action?.type === 'schedule_followup'
      || rex.action?.type === 'batch_action'
    ) {
      reloadContacts();
    }
    if (result?.openContactId) {
      setSelectedId(result.openContactId);
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
          <HeatSheetTab contacts={contacts} error={error} onSelect={c => setSelectedId(c.id)} />
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
        thinking={rex.thinking}
        action={rex.action}
        executing={rex.executing}
        error={rex.error}
        contacts={contacts ?? []}
        onConfirm={handleRexConfirm}
        onCancel={rex.cancel}
        onOpenContact={(id) => setSelectedId(id)}
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
