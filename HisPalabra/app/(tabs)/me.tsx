import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Fonts } from '../../constants/theme';

export default function MeScreen() {
  const { profile, signOut } = useAuthStore();

  const openDonate = () => {
    WebBrowser.openBrowserAsync('https://hispalabra.org/donate');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: `${profile?.avatar_color || Colors.gold}22` }]}>
            <Text style={[styles.avatarText, { color: profile?.avatar_color || Colors.gold }]}>
              {(profile?.display_name || 'U').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>{profile?.display_name || 'User'}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>⚡ {profile?.xp_total || 0}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>🔥 {profile?.current_streak || 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>🏆 {profile?.longest_streak || 0}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
        </View>

        {/* Donate */}
        <Pressable style={styles.donateCard} onPress={openDonate}>
          <Text style={styles.donateEmoji}>🙏</Text>
          <View style={styles.donateInfo}>
            <Text style={styles.donateTitle}>Support the Mission</Text>
            <Text style={styles.donateSub}>
              This app is free because the Word should be. Help us keep it alive.
            </Text>
          </View>
          <Text style={styles.donateArrow}>→</Text>
        </Pressable>

        {/* Settings links */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsHeader}>SETTINGS</Text>
          {[
            { label: 'Edit Profile', icon: '👤' },
            { label: 'Notifications', icon: '🔔' },
            { label: 'Bible Display', icon: '📖' },
            { label: 'Change City', icon: '📍' },
            { label: 'Privacy Policy', icon: '🔒' },
            { label: 'About His Palabra', icon: '✝️' },
          ].map((item) => (
            <Pressable key={item.label} style={styles.settingsRow}>
              <Text style={styles.settingsIcon}>{item.icon}</Text>
              <Text style={styles.settingsLabel}>{item.label}</Text>
              <Text style={styles.settingsArrow}>→</Text>
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.version}>His Palabra v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },

  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontFamily: Fonts.bodyBold, fontSize: 24 },
  displayName: { fontFamily: Fonts.bodyBold, fontSize: 20, color: Colors.text, marginBottom: 2 },
  username: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted },

  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  statNum: { fontFamily: Fonts.bodyBold, fontSize: 18, color: Colors.text, marginBottom: 4 },
  statLabel: { fontFamily: Fonts.body, fontSize: 10, color: Colors.muted },

  donateCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(245,200,66,0.06)', borderWidth: 1, borderColor: 'rgba(245,200,66,0.25)',
    borderRadius: 14, padding: 16, marginBottom: 24,
  },
  donateEmoji: { fontSize: 28 },
  donateInfo: { flex: 1 },
  donateTitle: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.gold, marginBottom: 2 },
  donateSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted, lineHeight: 18 },
  donateArrow: { fontFamily: Fonts.body, fontSize: 18, color: Colors.gold },

  settingsSection: { marginBottom: 24 },
  settingsHeader: {
    fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.muted,
    letterSpacing: 1.5, marginBottom: 12,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingsIcon: { fontSize: 18 },
  settingsLabel: { flex: 1, fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.text },
  settingsArrow: { fontFamily: Fonts.body, fontSize: 14, color: Colors.dim },

  signOutBtn: {
    backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  signOutText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.red },

  version: { fontFamily: Fonts.body, fontSize: 11, color: Colors.dim, textAlign: 'center' },
});
