import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, SectionHead, rgbaTint } from './atoms';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { V2Tag } from '@/lib/v2/useTags';
import { createTag, applyTagToContacts } from '@/lib/v2/tagMutations';

const COLOR_SWATCHES = [
  colors.gold,
  colors.red,
  colors.orange,
  colors.green,
  '#5a8fe8',
  '#a86bd1',
  colors.grey2,
];

type ChosenTag = { name: string; color: string };

export default function BulkTagFlow({
  open,
  contacts,
  allTags,
  onClose,
  onApplied,
}: {
  open: boolean;
  contacts: V2Contact[];
  allTags: V2Tag[];
  onClose: () => void;
  onApplied: (nextContacts: V2Contact[]) => void;
}) {
  const [step, setStep] = useState<'choose' | 'select'>('choose');
  const [chosen, setChosen] = useState<ChosenTag | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(colors.gold);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('choose');
      setChosen(null);
      setNewName('');
      setNewColor(colors.gold);
      setPicked(new Set());
      setQuery('');
      setSaving(false);
      setError(null);
    }
  }, [open]);

  const goToSelect = (tag: ChosenTag) => {
    setChosen(tag);
    setPicked(new Set(
      contacts.filter(c => c.tags.includes(tag.name)).map(c => c.id),
    ));
    setStep('select');
  };

  const togglePick = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.vehicle ?? '').toLowerCase().includes(q),
    );
  }, [contacts, query]);

  const apply = async () => {
    if (!chosen || picked.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (!allTags.some(t => t.name === chosen.name)) {
        await createTag(chosen.name, chosen.color);
      }
      const next = await applyTagToContacts(contacts, chosen.name, Array.from(picked));
      onApplied(next);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Apply failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Pressable
            onPress={step === 'choose' ? onClose : () => setStep('choose')}
            style={styles.headerBtn}
          >
            <Text style={styles.headerBtnText}>
              {step === 'choose' ? 'Cancel' : '‹ Back'}
            </Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>
              STEP {step === 'choose' ? '1' : '2'} OF 2
            </Text>
            <Text style={styles.headerTitle}>
              {step === 'choose' ? 'Choose a tag' : `Tag ${picked.size} contact${picked.size === 1 ? '' : 's'}`}
            </Text>
          </View>
          {step === 'select' ? (
            <Pressable
              onPress={apply}
              disabled={!chosen || picked.size === 0 || saving}
              style={[
                styles.headerBtn,
                picked.size > 0 ? styles.headerBtnPrimary : styles.headerBtnDisabled,
              ]}
            >
              <Text style={[
                styles.headerBtnText,
                picked.size > 0 ? { color: colors.ink } : { color: colors.grey },
              ]}>
                {saving ? 'Saving…' : 'Apply'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 64 }} />
          )}
        </View>

        {step === 'choose' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Label color={colors.gold}>CREATE NEW TAG</Label>
              <View style={styles.createRow}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Murano, F-150, Spring buyer"
                  placeholderTextColor={colors.grey}
                  style={styles.input}
                />
                <Pressable
                  disabled={!newName.trim()}
                  onPress={() => goToSelect({ name: newName.trim(), color: newColor })}
                  style={[
                    styles.nextBtn,
                    newName.trim() ? styles.nextBtnEnabled : styles.nextBtnDisabled,
                  ]}
                >
                  <Text style={[
                    styles.nextBtnText,
                    newName.trim() ? { color: colors.ink } : { color: colors.grey },
                  ]}>
                    Next ›
                  </Text>
                </Pressable>
              </View>
              <View style={styles.colorRow}>
                <Text style={styles.colorLabel}>COLOR</Text>
                {COLOR_SWATCHES.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setNewColor(c)}
                    style={[
                      styles.swatch,
                      { backgroundColor: c, borderColor: newColor === c ? colors.white : 'transparent' },
                    ]}
                  />
                ))}
              </View>
            </View>

            <SectionHead label="OR PICK EXISTING" color={colors.grey2} />
            <View style={styles.existingTags}>
              {allTags.map(t => (
                <Pressable
                  key={t.id}
                  onPress={() => goToSelect({ name: t.name, color: t.color })}
                  style={[
                    styles.existingTag,
                    { backgroundColor: rgbaTint(t.color, 0.12), borderColor: rgbaTint(t.color, 0.35) },
                  ]}
                >
                  <View style={[styles.existingDot, { backgroundColor: t.color }]} />
                  <Text style={[styles.existingTagText, { color: t.color }]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : chosen ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View
              style={[
                styles.previewCard,
                { backgroundColor: rgbaTint(chosen.color, 0.14), borderColor: rgbaTint(chosen.color, 0.4) },
              ]}
            >
              <View style={[styles.previewSwatch, { backgroundColor: chosen.color }]} />
              <View style={{ flex: 1 }}>
                <Label color={chosen.color}>APPLYING TAG</Label>
                <Text style={styles.previewName}>{chosen.name}</Text>
              </View>
              <Text style={[styles.previewCount, { color: chosen.color }]}>{picked.size}</Text>
            </View>

            <View style={styles.searchWrap}>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search contacts"
                  placeholderTextColor={colors.grey}
                  style={styles.searchInput}
                />
              </View>
            </View>

            <View style={styles.pickerList}>
              {filtered.map((c, i) => {
                const selected = picked.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => togglePick(c.id)}
                    style={[
                      styles.pickerRow,
                      i > 0 && styles.pickerRowDivider,
                      selected && { backgroundColor: colors.goldBg },
                    ]}
                  >
                    <View style={[
                      styles.check,
                      selected
                        ? { backgroundColor: colors.gold, borderColor: colors.gold }
                        : { borderColor: colors.ink4 },
                    ]}>
                      {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <Avatar name={c.name} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickerName} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.pickerVehicle} numberOfLines={1}>
                        {c.vehicle ?? '—'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.75)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '7%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
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
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4 },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  createRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 11,
    color: colors.white, fontSize: 14, fontWeight: '600',
  },
  nextBtn: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: radius.md,
  },
  nextBtnEnabled: { backgroundColor: colors.gold },
  nextBtnDisabled: { backgroundColor: colors.ink4 },
  nextBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  colorRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  colorLabel: { fontSize: 10, fontWeight: '700', color: colors.grey2, letterSpacing: 0.8 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },

  existingTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  existingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  existingDot: { width: 6, height: 6, borderRadius: 3 },
  existingTagText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  previewSwatch: { width: 28, height: 28, borderRadius: 8 },
  previewName: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },
  previewCount: { fontSize: 22, fontWeight: '800' },

  searchWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchIcon: { color: colors.grey, fontSize: 14 },
  searchInput: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    paddingVertical: 10,
  },

  pickerList: {
    marginHorizontal: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  pickerRowDivider: { borderTopWidth: 1, borderTopColor: colors.ink3 },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  pickerName: { fontSize: 15, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  pickerVehicle: { fontSize: 11, color: colors.grey2, marginTop: 2 },

  error: { color: colors.red, fontSize: 13, marginHorizontal: 14, marginTop: 8 },
});
