// Generic single-field edit sheet, reused by every editable Profile row.
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardTypeOptions, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';

export type SettingEditConfig = {
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
};

export default function SettingEditSheet({
  config,
  onSave,
  onClose,
}: {
  config: SettingEditConfig | null;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (config) setValue(config.value);
  }, [config]);

  if (!config) return null;

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>EDIT</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{config.title}</Text>
          </View>
          <Pressable
            onPress={() => { onSave(value.trim()); onClose(); }}
            style={[styles.headerBtn, styles.headerBtnPrimary]}
          >
            <Text style={[styles.headerBtnText, { color: colors.ink }]}>Save</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.fieldLabel}>{config.label}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            multiline={config.multiline}
            keyboardType={config.keyboardType}
            placeholder={config.placeholder}
            placeholderTextColor={colors.grey}
            style={[styles.input, config.multiline && { minHeight: 110, textAlignVertical: 'top' as any }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'web' ? ('max(28px, env(safe-area-inset-bottom))' as any) : 28,
  } as any,
  handle: {
    alignSelf: 'center',
    width: 42, height: 4, borderRadius: 2,
    backgroundColor: colors.ink4,
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 64, alignItems: 'center',
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  fieldLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 1.0 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 12,
    color: colors.white, fontSize: 14, fontWeight: '600',
  },
});
