import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/authStore';
import { Colors, Fonts } from '../../../constants/theme';

interface CityGroup {
  id: string;
  name: string;
  slug: string;
  member_count: number;
}

export default function CitySelectScreen() {
  const router = useRouter();
  const { updateProfile } = useAuthStore();
  const [cities, setCities] = useState<CityGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCities();
  }, []);

  const fetchCities = async () => {
    const { data } = await supabase
      .from('city_groups')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setCities(data);
    setLoading(false);
  };

  const handleNext = async () => {
    if (!selected) return;
    await updateProfile({ city_group_id: selected });
    router.push('/(auth)/onboarding/starting-point');
  };

  return (
    <View style={styles.container}>
      <View style={styles.progress}>
        <View style={styles.dotDone} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>

      <Text style={styles.title}>Your City</Text>
      <Text style={styles.subtitle}>
        Join your local Bible community. No DMs — just your city, together in the Word.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={cities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.cityCard, selected === item.id && styles.cityCardActive]}
              onPress={() => setSelected(item.id)}
            >
              <Text style={styles.cityEmoji}>📍</Text>
              <View style={styles.cityInfo}>
                <Text style={[styles.cityName, selected === item.id && styles.cityNameActive]}>
                  {item.name}
                </Text>
                <Text style={styles.cityMembers}>
                  {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
                </Text>
              </View>
              {selected === item.id && <Text style={styles.check}>✓</Text>}
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={[styles.btn, !selected && styles.btnDisabled]}
        onPress={handleNext}
        disabled={!selected}
      >
        <Text style={styles.btnText}>Join City →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 28, paddingTop: 80 },
  progress: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.dim },
  dotDone: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.green },
  dotActive: { backgroundColor: Colors.gold, width: 48 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, marginBottom: 8 },
  subtitle: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted, marginBottom: 24, lineHeight: 22 },
  list: { gap: 8, paddingBottom: 20 },
  cityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 16,
  },
  cityCardActive: { borderColor: Colors.gold, backgroundColor: 'rgba(245,200,66,0.06)' },
  cityEmoji: { fontSize: 24 },
  cityInfo: { flex: 1 },
  cityName: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.text, marginBottom: 2 },
  cityNameActive: { color: Colors.gold },
  cityMembers: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  check: { fontSize: 18, color: Colors.gold, fontWeight: '900' },
  btn: {
    backgroundColor: Colors.gold, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12, marginBottom: 40,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.bg },
});
