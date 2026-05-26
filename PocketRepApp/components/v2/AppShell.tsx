import { useEffect, useState } from 'react';
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
import { ensureDemoSession } from '@/lib/v2/demoAuth';
import { useContacts, type V2Contact } from '@/lib/v2/useContacts';

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [authReady, setAuthReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dealLoggerOpen, setDealLoggerOpen] = useState(false);
  const [dealLoggerPrefill, setDealLoggerPrefill] = useState<DealLoggerPrefill | undefined>();
  const [dealsRefetchKey, setDealsRefetchKey] = useState(0);

  const { contacts, error, patchLocal } = useContacts();

  useEffect(() => {
    ensureDemoSession().finally(() => setAuthReady(true));
  }, []);

  const cycleOrb = () => {
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
          <ContactsTab contacts={contacts} error={error} onSelect={c => setSelectedId(c.id)} />
        ) : active === 'profile' ? (
          <ProfileTab />
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
