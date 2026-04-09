import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts } from '../../constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.cross}>✝️</Text>
        <Text style={styles.title}>His Palabra</Text>
        <Text style={styles.subtitle}>
          The Word of God{'\n'}in the language you actually speak
        </Text>
        <Text style={styles.tagline}>
          Free forever. No ads. Scripture first.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 120,
    paddingBottom: 50,
  },
  content: {
    alignItems: 'center',
  },
  cross: {
    fontSize: 56,
    marginBottom: 20,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 42,
    color: Colors.gold,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 12,
  },
  tagline: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
  },
  buttons: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.bg,
  },
  secondaryBtn: {
    backgroundColor: Colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.muted,
  },
});
