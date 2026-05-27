import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';

export default function LanguageToggle({
  value,
  onChange,
}: {
  value: 'en' | 'es';
  onChange: (next: 'en' | 'es') => void;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange('en')}
        style={[styles.opt, value === 'en' && styles.optActive]}
      >
        <Text style={[styles.optText, value === 'en' && styles.optTextActive]}>EN</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('es')}
        style={[styles.opt, value === 'es' && styles.optActive]}
      >
        <Text style={[styles.optText, value === 'es' && styles.optTextActive]}>ES</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full,
    padding: 2,
    gap: 2,
  },
  opt: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full,
  },
  optActive: { backgroundColor: colors.gold },
  optText: { fontSize: 10, fontWeight: '800', color: colors.grey2, letterSpacing: 1.0 },
  optTextActive: { color: colors.ink },
});
