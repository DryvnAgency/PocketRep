import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type TabId = 'heat' | 'contacts' | 'metrics' | 'profile';

const TITLES: Record<TabId, { title: string; sub: string }> = {
  heat: { title: 'Heat Sheet', sub: 'Tuesday · 248 active' },
  contacts: { title: 'Contacts', sub: '248 total · 24 last 30d' },
  metrics: { title: 'Metrics', sub: 'April 2026' },
  profile: { title: 'You', sub: '34-month streak' },
};

export default function CustomNavBar({
  active,
  onSearch,
  onUpgrade,
}: {
  active: TabId;
  onSearch?: () => void;
  onUpgrade?: () => void;
}) {
  const t = TITLES[active];
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Pressable onPress={onUpgrade}>
          <LinearGradient
            colors={[colors.gold2, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mark}
          >
            <Text style={styles.markText}>PR</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.wordmark}>POCKETREP</Text>

        <View style={{ flex: 1 }} />

        <Pressable onPress={onSearch} style={styles.iconBtn}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={6} stroke={colors.gold} strokeWidth={1.8} />
            <Path d="M16 16l4 4" stroke={colors.gold} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Pressable>

        <View style={styles.iconBtn}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 17v-5a7 7 0 1114 0v5l1.5 2H3.5L5 17z"
              stroke={colors.gold}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            <Path d="M10 21a2 2 0 004 0" stroke={colors.gold} strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
          <View style={styles.notifDot} />
        </View>
      </View>

      <Text style={styles.title}>{t.title}</Text>
      <Text style={styles.sub}>{t.sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: -0.5,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.gold,
    textTransform: 'uppercase',
    marginLeft: -2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.surface2,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  sub: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.gold,
    marginTop: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
