import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type TabId = 'heat' | 'contacts' | 'metrics' | 'profile';

// Built from the device's local clock — i.e. wherever the rep actually is.
function localSubs(activeCount: number, totalCount: number): Record<TabId, { title: string; sub: string }> {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    heat: { title: 'Heat Sheet', sub: `${weekday} · ${activeCount} active` },
    contacts: { title: 'Contacts', sub: `${totalCount} total · ${activeCount} active` },
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
        <Pressable onPress={onUpgrade} accessibilityRole="button" accessibilityLabel="Open profile and plan">
          <LinearGradient
            colors={[colors.gold2, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mark}
          >
            {/* Radar mark — concentric rings + a gold sweep, the PocketRep brand
                icon. Ink lines for contrast on the gold badge. */}
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={10} stroke={colors.ink} strokeWidth={1.6} opacity={0.9} />
              <Circle cx={12} cy={12} r={6.5} stroke={colors.ink} strokeWidth={1.3} opacity={0.6} />
              <Circle cx={12} cy={12} r={3} stroke={colors.ink} strokeWidth={1.1} opacity={0.45} />
              <Path d="M12 12 L19 5" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={12} r={1.6} fill={colors.ink} />
              <Circle cx={16.4} cy={8.3} r={1.2} fill={colors.ink} />
            </Svg>
          </LinearGradient>
        </Pressable>

        <Text style={styles.wordmark}>POCKETREP</Text>

        <View style={{ flex: 1 }} />

        <Pressable onPress={onSearch} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Search contacts">
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={6} stroke={colors.gold} strokeWidth={1.8} />
            <Path d="M16 16l4 4" stroke={colors.gold} strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </Pressable>

        <Pressable
          onPress={onNotifications}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 17v-5a7 7 0 1114 0v5l1.5 2H3.5L5 17z"
              stroke={colors.gold}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            <Path d="M10 21a2 2 0 004 0" stroke={colors.gold} strokeWidth={1.6} strokeLinecap="round" />
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
    // Clear the status bar / notch on installed web (Dynamic Island ~59px);
    // native keeps the fixed value.
    paddingTop: Platform.OS === 'web' ? ('max(54px, env(safe-area-inset-top))' as any) : 54,
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
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 1,
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
