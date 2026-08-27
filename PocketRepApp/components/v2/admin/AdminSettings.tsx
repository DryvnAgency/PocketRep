// Owner Control Center — Settings tab
// Owner configuration and session info.

import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { SectionHeader } from './atoms';

export default function AdminSettings({ onSignOut }: { onSignOut: () => void }) {
  return (
    <View style={st.content}>
      <SectionHeader label="ACCOUNT" />
      <View style={st.card}>
        <Text style={st.cardLabel}>Signed in as</Text>
        <Text style={st.cardValue}>Admin</Text>
      </View>

      <SectionHeader label="SESSION" />
      <View style={st.card}>
        <Text style={st.cardLabel}>Platform</Text>
        <Text style={st.cardValue}>{Platform.OS}</Text>
      </View>

      <SectionHeader label="ACTIONS" />
      <Pressable
        onPress={onSignOut}
        style={({ pressed }) => [st.signOutBtn, pressed && st.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={st.signOutText}>Sign out</Text>
      </Pressable>

      <View style={st.versionWrap}>
        <Text style={st.version}>PocketRep Owner Control Center v1.0</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  card: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  cardLabel: { fontSize: 11, color: colors.grey2 },
  cardValue: { fontSize: 14, fontWeight: '600', color: colors.white, marginTop: 2 },
  signOutBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.85 },
  signOutText: { fontSize: 14, fontWeight: '700', color: colors.red },
  versionWrap: { marginTop: 24, alignItems: 'center' },
  version: { fontSize: 11, color: colors.grey, letterSpacing: 0.3 },
});
