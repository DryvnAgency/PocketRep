import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import CustomNavBar, { TabId } from './CustomNavBar';
import TabBar from './TabBar';
import { OrbState } from './HeyRexOrb';
import { SectionHead } from './atoms';
import HeatSheetTab from './HeatSheetTab';
import ContactsTab from './ContactsTab';
import ContactDetail from './ContactDetail';
import ProfileTab from './ProfileTab';
import { ensureDemoSession } from '@/lib/v2/demoAuth';
import { useContacts, type V2Contact } from '@/lib/v2/useContacts';

const PLACEHOLDER: Record<Exclude<TabId, 'heat' | 'contacts' | 'profile'>, { sectionLabel: string; body: string }> = {
  metrics: { sectionLabel: 'COMMISSION MTD', body: 'Metrics tab lands next.' },
};

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [authReady, setAuthReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          <>
            <SectionHead label={PLACEHOLDER[active].sectionLabel} />
            <Text style={styles.placeholder}>{PLACEHOLDER[active].body}</Text>
          </>
        )}
      </ScrollView>

      <TabBar active={active} onChange={setActive} orbState={orbState} onOrbPress={cycleOrb} />

      {selected ? (
        <ContactDetail
          contact={selected}
          onClose={() => setSelectedId(null)}
          onLocalUpdate={(next: V2Contact) => patchLocal(next.id, next)}
        />
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
});
