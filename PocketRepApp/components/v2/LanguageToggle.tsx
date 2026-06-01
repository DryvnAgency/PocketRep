import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';

// EN/ES toggle. IMPORTANT: this sets the language Rex *writes scripts and
// messages in* (per-contact preferred language / per-step blast language) — it
// does NOT translate the app UI. The leading caption + accessibility labels make
// that scope explicit so it isn't mistaken for a UI-language switch. (Full UI
// i18n is intentionally out of scope here.)
export default function LanguageToggle({
  value,
  onChange,
  label = 'SCRIPT',
}: {
  value: 'en' | 'es';
  onChange: (next: 'en' | 'es') => void;
  // Small caption signaling what the toggle controls. Pass null to hide it
  // (e.g. when the surrounding UI already labels the scope).
  label?: string | null;
}) {
  const a11yLabel = (lang: 'en' | 'es') =>
    `Write Rex scripts and messages in ${lang === 'en' ? 'English' : 'Spanish'}`;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.caption}>{label}</Text> : null}
      <Pressable
        onPress={() => onChange('en')}
        style={[styles.opt, value === 'en' && styles.optActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'en' }}
        accessibilityLabel={a11yLabel('en')}
      >
        <Text style={[styles.optText, value === 'en' && styles.optTextActive]}>EN</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('es')}
        style={[styles.opt, value === 'es' && styles.optActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'es' }}
        accessibilityLabel={a11yLabel('es')}
      >
        <Text style={[styles.optText, value === 'es' && styles.optTextActive]}>ES</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full,
    padding: 2,
    gap: 2,
  },
  caption: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.grey2,
    letterSpacing: 0.8,
    paddingLeft: 6,
    paddingRight: 2,
  },
  opt: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full,
  },
  optActive: { backgroundColor: colors.gold },
  optText: { fontSize: 10, fontWeight: '800', color: colors.grey2, letterSpacing: 1.0 },
  optTextActive: { color: colors.ink },
});
