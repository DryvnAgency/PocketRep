import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import HeyRex from '@/components/HeyRex';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={[s.tabIcon, focused && s.tabIconActive]}>
      <Text style={s.tabEmoji}>{icon}</Text>
      <Text style={[s.tabLabel, focused && s.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.ink2,
            borderTopColor: 'rgba(255,255,255,0.05)',
            borderTopWidth: 1,
            height: 72,
            paddingBottom: 10,
          },
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="🔥" label="Heat" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="👥" label="Book" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="💰" label="Deals" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="sequences"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="📋" label="Sequences" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="rex"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="🧠" label="Rex" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" label="More" focused={focused} />,
          }}
        />
      </Tabs>
      {/* HeyRex must be AFTER Tabs so it renders on top in z-order */}
      <HeyRex />
    </View>
  );
}

const s = StyleSheet.create({
  tabIcon: { alignItems: 'center', gap: 2, paddingTop: 5, opacity: 0.45 },
  tabIconActive: { opacity: 1 },
  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 9, color: colors.grey2, fontWeight: '500' },
  tabLabelActive: { color: colors.gold, fontWeight: '700' },
});
