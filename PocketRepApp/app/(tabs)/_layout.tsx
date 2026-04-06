import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '@/lib/constants';
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
            backgroundColor: C.ink2,
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
            tabBarIcon: ({ focused }) => <TabIcon icon="🔥" label="Home" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Contacts" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="rex"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="🧠" label="AI Closer" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="sequences"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="📋" label="Sequences" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" label="Profile" focused={focused} />,
          }}
        />
        {/* Hidden screens — still reachable but not in tab bar */}
        <Tabs.Screen
          name="deals"
          options={{ href: null }}
        />
      </Tabs>
      {/* HeyRex floating orb — renders on top of all tabs */}
      <HeyRex />
    </View>
  );
}

const s = StyleSheet.create({
  tabIcon: { alignItems: 'center', gap: 2, paddingTop: 5, opacity: 0.45 },
  tabIconActive: { opacity: 1 },
  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 9, color: C.grey2, fontWeight: '500' },
  tabLabelActive: { color: C.gold, fontWeight: '700' },
});
