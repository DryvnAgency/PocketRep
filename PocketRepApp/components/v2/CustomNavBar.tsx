import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type TabId = 'heat' | 'contacts' | 'metrics' | 'profile';

function localSubs(activeCount: number, totalCount: number): Record<TabId, { title: string; sub: string }> {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    heat: { title: 'Heat Sheet', sub: `${weekday} · ${activeCount} active` },
    contacts: { title: 'Contacts', sub: `${totalCount} customers` },
    metrics: { title: 'Metrics', sub: monthYear },
    profile: { title: 'You', sub: 'Profile & settings' },
  };
}

export default function CustomNavBar({
  active,
  onSearch,
  onUpgrade,
  onNotifications,
  unread = 0,
  activeCount = 0,
  totalCount = 0,
}: {
  active: TabId;
  onSearch?: () => void;
  onUpgrade?: () => void;
  onNotifications?: () => void;
  unread?: number;
  activeCount?: number;
  totalCount?: number;
}) {
  const t = localSubs(activeCount, totalCount)[active];
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Pressable onPress={onUpgrade} accessibilityRole="button" accessibilityLabel="Open profile and plan" hitSlop={4}>
          <LinearGradient
            colors={[colors.gold2, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mark}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={10} stroke={colors.ink} strokeWidth={1.6} opacity={0.9} />
              <Circle cx={12} cy={12} r={6.5} stroke={colors.ink} strokeWidth={1.3} opacity={0.6} />
              <Circle cx={12} cy={12} r={3} stroke={colors.ink} strokeWidth={1.1} opacity={0.45} />
              <Path d="M12 12 L19 5" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={12} r={1.6} fill={colors.ink} />
              <Circle cx={16.4} cy={8.3} r={1.2} fill={colors.ink} />
            </Svg>
          </LinearGradient>
        </Pressable>

        {active === 'heat' ? <Text style={styles.wordmark}>POCKETREP</Text> : null}

        <View style={{ flex: 1 }} />

        <Pressable onPress={onSearch} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]} accessibilityRole="button" accessibilityLabel="Search contacts" hitSlop={4}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={6} stroke={colors.grey1} strokeWidth={1.8} />
            <Path d="M16 16l4 4" stroke={colors.grey1} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Pressable>

        <Pressable
          onPress={onNotifications}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          hitSlop={4}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M5 17v-5a7 7 0 1114 0v5l1.5 2H3.5L5 17z" stroke={colors.grey1} strokeWidth={1.6} strokeLinejoin="round" />
            <Path d="M10 21a2 2 0 004 0" stroke={colors.grey1} strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
          {unread > 0 ? (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Text style={styles.title}>{t.title}</Text>
      <Text style={styles.sub}>{t.sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: Platform.OS === 'web' ? ('calc(env(safe-area-inset-top) + 10px)' as any) : 18,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 7,
    minHeight: 34,
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  notifBadge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.red,
    borderWidth: 1.5,
    borderColor: colors.ink2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.7,
    lineHeight: 31,
  },
  sub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.grey2,
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
