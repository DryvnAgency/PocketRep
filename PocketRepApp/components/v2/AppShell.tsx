import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import CustomNavBar, { TabId } from './CustomNavBar';
import TabBar from './TabBar';
import { OrbState } from './HeyRexOrb';
import { SectionHead } from './atoms';

const PLACEHOLDER: Record<TabId, { sectionLabel: string; sectionIcon?: string; body: string }> = {
  heat: { sectionLabel: 'HOT', sectionIcon: '🔥', body: 'Heat Sheet content lands in PR #29.' },
  contacts: { sectionLabel: 'YOUR BOOK', body: 'Contacts list lands in PR #30.' },
  metrics: { sectionLabel: 'COMMISSION MTD', body: 'Metrics tab lands in PR #34.' },
  profile: { sectionLabel: 'YOUR PAY PLAN', body: 'Profile / Pay Plan lands in PR #35.' },
};

export default function AppShell() {
  const [active, setActive] = useState<TabId>('heat');
  const [orbState, setOrbState] = useState<OrbState>('idle');

  // PR #26: orb tap cycles all four states so QA can see every animation
  // without needing real STT. PR #31 replaces this with real Hey Rex flow.
  const cycleOrb = () => {
    const order: OrbState[] = ['idle', 'listening', 'processing', 'saved'];
    const next = order[(order.indexOf(orbState) + 1) % order.length];
    setOrbState(next);
    if (next === 'saved') {
      setTimeout(() => setOrbState('idle'), 1800);
    }
  };

  const p = PLACEHOLDER[active];

  return (
    <View style={styles.root}>
      <CustomNavBar active={active} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <SectionHead label={p.sectionLabel} icon={p.sectionIcon} />
        <Text style={styles.placeholder}>{p.body}</Text>
      </ScrollView>

      <TabBar active={active} onChange={setActive} orbState={orbState} onOrbPress={cycleOrb} />
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
  },
});
