import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../stores/authStore';
import { Colors, Fonts } from '../../../constants/theme';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { updateProfile } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [loading, setLoading] = useState(false);

  const ageOptions = ['14-17', '18-21', '22-25', '26-28', '29+'];

  const handleNext = async () => {
    if (!displayName.trim() || !username.trim() || !ageRange) {
      Alert.alert('Complete all fields', 'We need your name, username, and age range.');
      return;
    }
    if (username.length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.');
      return;
    }

    setLoading(true);
    await updateProfile({
      display_name: displayName.trim(),
      username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
      age_range: ageRange as any,
    });
    setLoading(false);
    router.push('/(auth)/onboarding/city-select');
  };

  return (
    <View style={styles.container}>
      <View style={styles.progress}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      <Text style={styles.title}>Tell us about you</Text>
      <Text style={styles.subtitle}>This is how you'll appear in the community.</Text>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="What should we call you?"
            placeholderTextColor={Colors.dim}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={styles.input}
            placeholder="@yourname"
            placeholderTextColor={Colors.dim}
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>AGE RANGE</Text>
          <View style={styles.ageRow}>
            {ageOptions.map((opt) => (
              <Pressable
                key={opt}
                style={[styles.agePill, ageRange === opt && styles.agePillActive]}
                onPress={() => setAgeRange(opt)}
              >
                <Text style={[styles.agePillText, ageRange === opt && styles.agePillTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleNext}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? 'Saving...' : 'Next →'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 28, paddingTop: 80 },
  progress: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.dim },
  dotActive: { backgroundColor: Colors.gold, width: 48 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, marginBottom: 8 },
  subtitle: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted, marginBottom: 32 },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.muted, letterSpacing: 1.5 },
  input: {
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: Fonts.body, fontSize: 16, color: Colors.text,
  },
  ageRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  agePill: {
    backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  agePillActive: { backgroundColor: 'rgba(245,200,66,0.15)', borderColor: Colors.gold },
  agePillText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.muted },
  agePillTextActive: { color: Colors.gold },
  btn: {
    backgroundColor: Colors.gold, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 32,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.bg },
});
