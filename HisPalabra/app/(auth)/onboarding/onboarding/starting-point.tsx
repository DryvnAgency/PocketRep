import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../stores/authStore';
import { Colors, Fonts } from '../../../constants/theme';

const options = [
  {
    emoji: '📖',
    title: 'Start at Genesis',
    subtitle: 'The OG beginning — where it all started',
    route: '/(tabs)/bible',
  },
  {
    emoji: '✨',
    title: 'Show me the classics',
    subtitle: 'Psalms, Proverbs, John — the essentials',
    route: '/(tabs)/bible',
  },
  {
    emoji: '🎮',
    title: 'I want to learn',
    subtitle: 'Take me to the devotional lessons',
    route: '/(tabs)/learn',
  },
  {
    emoji: '📍',
    title: 'I want community',
    subtitle: 'Take me to my city chat',
    route: '/(tabs)/city',
  },
];

export default function StartingPointScreen() {
  const router = useRouter();
  const { updateProfile } = useAuthStore();

  const handleSelect = async (route: string) => {
    await updateProfile({ onboarding_done: true });
    router.replace(route as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.progress}>
        <View style={styles.dotDone} />
        <View style={styles.dotDone} />
        <View style={[styles.dot, styles.dotActive]} />
      </View>

      <Text style={styles.title}>Where do you{'\n'}want to start?</Text>
      <Text style={styles.subtitle}>You can always explore everything from any tab.</Text>

      <View style={styles.options}>
        {options.map((opt) => (
          <Pressable
            key={opt.title}
            style={styles.optionCard}
            onPress={() => handleSelect(opt.route)}
          >
            <Text style={styles.optionEmoji}>{opt.emoji}</Text>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>{opt.title}</Text>
              <Text style={styles.optionSub}>{opt.subtitle}</Text>
            </View>
            <Text style={styles.optionArrow}>→</Text>
          </Pressable>
        ))}
      </View>
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
  subtitle: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted, marginBottom: 32 },
  options: { gap: 12 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 18,
  },
  optionEmoji: { fontSize: 28 },
  optionInfo: { flex: 1 },
  optionTitle: { fontFamily: Fonts.bodyBold, fontSize: 15, color: Colors.text, marginBottom: 2 },
  optionSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  optionArrow: { fontFamily: Fonts.body, fontSize: 18, color: Colors.gold },
});
