import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '@/constants/theme';
import HeyRexOrb, { OrbState } from './HeyRexOrb';
import { TabId } from './CustomNavBar';

const TABS: { id: TabId; label: string }[] = [
  { id: 'heat', label: 'Heat' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'profile', label: 'You' },
];

export default function TabBar({
  active,
  onChange,
  orbState,
  onOrbPress,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  orbState: OrbState;
  onOrbPress: () => void;
}) {
  return (
    <View style={styles.root}>
      <HeyRexOrb state={orbState} onPress={onOrbPress} />
      <View style={styles.row}>
        <TabButton t={TABS[0]} active={active === TABS[0].id} onPress={() => onChange(TABS[0].id)} />
        <TabButton t={TABS[1]} active={active === TABS[1].id} onPress={() => onChange(TABS[1].id)} />
        <View style={{ flex: 1 }} />
        <TabButton t={TABS[2]} active={active === TABS[2].id} onPress={() => onChange(TABS[2].id)} />
        <TabButton t={TABS[3]} active={active === TABS[3].id} onPress={() => onChange(TABS[3].id)} />
      </View>
    </View>
  );
}

function TabButton({
  t,
  active,
  onPress,
}: {
  t: { id: TabId; label: string };
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.gold : colors.grey2;
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      {active ? <View style={styles.activeMark} /> : null}
      {renderIcon(t.id, color)}
      <Text style={[styles.tabLabel, { color }]}>{t.label}</Text>
    </Pressable>
  );
}

function renderIcon(id: TabId, c: string) {
  const sw = 1.7;
  switch (id) {
    case 'heat':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 3c1 3 4 4.5 4 8a4 4 0 11-8 0c0-1.5 1-2.5 2-3.5C11 6 11.5 4.5 12 3z"
            stroke={c}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'contacts':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx={9} cy={8} r={3.5} stroke={c} strokeWidth={sw} />
          <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx={17} cy={9} r={2.5} stroke={c} strokeWidth={sw} />
          <Path d="M16 14c2.5 0.5 4.5 2 4.5 4.5" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case 'metrics':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path d="M4 18V10M10 18V5M16 18v-6M22 18H3" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={sw} />
          <Path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={c} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
    backgroundColor: colors.ink2,
    paddingBottom: 28, // safe area
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    height: 58,
    alignItems: 'stretch',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  activeMark: {
    position: 'absolute',
    top: 0,
    width: 26,
    height: 2,
    borderRadius: 1.5,
    backgroundColor: colors.gold,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
