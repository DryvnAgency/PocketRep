// Generic single-field edit sheet, reused by every editable Profile row.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardTypeOptions, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { useWebVisualViewportInset } from '@/lib/v2/useWebVisualViewportInset';

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
  onSave: (value: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const keyboardInset = useWebVisualViewportInset(!!config);

  useEffect(() => {
    if (config) {
      setValue(config.value);
      setSaving(false);
      savingRef.current = false;
      setError(null);
    }
  }, [config]);

  if (!config) return null;

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save this setting");
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable
        style={styles.scrim}
        onPress={() => !saving && onClose()}
        accessibilityRole="button"
        accessibilityLabel="Close editor"
      />
      <View style={[styles.sheet, keyboardInset > 0 && { bottom: keyboardInset }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            disabled={saving}
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && !saving && styles.pressed,
              saving && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>EDIT</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{config.title}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.headerBtn,
              styles.headerBtnPrimary,
              pressed && !saving && styles.pressed,
              saving && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Save ${config.title}`}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <Text style={[styles.headerBtnText, { color: colors.ink }]}>{saving ? 'Saving…' : 'Save'}</Text>
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
            editable={!saving}
            style={[styles.input, config.multiline && { minHeight: 110, textAlignVertical: 'top' as any }]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
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
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    minHeight: 48,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  error: { color: colors.red, fontSize: 12, lineHeight: 17 },
});
