import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '@/constants/theme';

export default function NewUiShell() {
  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <Text style={styles.markText}>PR</Text>
      </View>
      <Text style={styles.label}>POCKETREP</Text>
      <Text style={styles.title}>v2 scaffold online</Text>
      <Text style={styles.sub}>
        The new UI is wired and ready for content.{'\n'}
        Feature flag: <Text style={styles.code}>EXPO_PUBLIC_NEW_UI=1</Text>
        {Platform.OS === 'web' ? ' or ?v=2' : ''}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  markText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    marginTop: 8,
    letterSpacing: -0.6,
  },
  sub: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.grey2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }),
    color: colors.gold,
  },
});
