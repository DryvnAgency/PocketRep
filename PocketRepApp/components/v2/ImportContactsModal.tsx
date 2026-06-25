// P2 demo feature: "Upload contacts from phone". A bottom sheet that imports
// contacts from (a) the device's native contact picker (browser Contacts Picker
// API where available) or (b) a vCard/CSV file or pasted text as the universal
// fallback. Multi-select review with select-all + a live count, dedupe flagging
// against the existing book, and a confirm-before-import step. Additive + gated
// (see isContactImportEnabled); when off, the entry point never renders.

import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import type { V2Contact } from '@/lib/v2/useContacts';
import {
  parseContactsText,
  pickFromDevice,
  isDevicePickerSupported,
  isDuplicate,
  importSelected,
  type ParsedImportContact,
} from '@/lib/v2/contactImport';

type Review = ParsedImportContact & { dup: boolean };
type Phase = 'source' | 'review';

export default function ImportContactsModal({
  open, onClose, onImported, allContacts = [],
}: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
  allContacts?: V2Contact[];
}) {
  const [phase, setPhase] = useState<Phase>('source');
  const [rows, setRows] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('source'); setRows([]); setSelected(new Set());
      setPasteMode(false); setPasteText(''); setBusy(false); setError(null);
    }
  }, [open]);

  if (!open) return null;

  const deviceSupported = isDevicePickerSupported();

  const toReview = (parsed: ParsedImportContact[]) => {
    if (parsed.length === 0) {
      setError('No contacts found. Check the file is a valid vCard (.vcf) or CSV.');
      return;
    }
    const flagged: Review[] = parsed.map(p => ({ ...p, dup: isDuplicate(p, allContacts) }));
    setRows(flagged);
    // Pre-select everything that isn't already in the book.
    setSelected(new Set(flagged.filter(r => !r.dup).map(r => r.id)));
    setError(null);
    setPhase('review');
  };

  const fromDevice = async () => {
    setError(null); setBusy(true);
    try {
      toReview(await pickFromDevice());
    } catch (e: any) {
      // A user who cancels the native picker isn't an error worth shouting about.
      if (!/cancel|abort/i.test(String(e?.message ?? ''))) {
        setError(e?.message ?? 'Could not open the contact picker.');
      }
    } finally {
      setBusy(false);
    }
  };

  const fromFile = () => {
    setError(null);
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setPasteMode(true); // native has no <input type=file> — fall back to paste
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vcf,.csv,text/vcard,text/csv,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        toReview(parseContactsText(await file.text(), file.name));
      } catch {
        setError('Could not read that file.');
      }
    };
    input.click();
  };

  const fromPaste = () => {
    if (!pasteText.trim()) return;
    toReview(parseContactsText(pasteText));
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));
  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const doImport = async () => {
    const chosen = rows.filter(r => selected.has(r.id));
    if (chosen.length === 0) return;
    setBusy(true); setError(null);
    try {
      const n = await importSelected(chosen);
      onImported(n);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Import failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const dupCount = rows.filter(r => r.dup).length;

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={phase === 'review' ? () => setPhase('source') : onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>{phase === 'review' ? 'Back' : 'Cancel'}</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>IMPORT</Text>
            <Text style={styles.headerTitle}>
              {phase === 'review' ? `${selected.size} of ${rows.length} selected` : 'Add contacts'}
            </Text>
          </View>
          {phase === 'review' ? (
            <Pressable
              onPress={doImport}
              disabled={busy || selected.size === 0}
              style={[styles.headerBtn, selected.size > 0 && !busy ? styles.headerBtnPrimary : styles.headerBtnDisabled]}
            >
              <Text style={[styles.headerBtnText, selected.size > 0 && !busy ? { color: colors.ink } : { color: colors.grey }]}>
                {busy ? 'Importing…' : 'Import'}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.headerBtn, { opacity: 0 }]}><Text style={styles.headerBtnText}> </Text></View>
          )}
        </View>

        {phase === 'source' ? (
          <ScrollView contentContainerStyle={styles.body}>
            {deviceSupported ? (
              <Pressable onPress={fromDevice} disabled={busy} style={styles.sourceBtn}>
                <Text style={styles.sourceIcon}>📇</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceTitle}>From this device</Text>
                  <Text style={styles.sourceSub}>Pick contacts with your phone’s contact picker</Text>
                </View>
                <Text style={styles.sourceChevron}>›</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={fromFile} disabled={busy} style={styles.sourceBtn}>
              <Text style={styles.sourceIcon}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceTitle}>Upload a file</Text>
                <Text style={styles.sourceSub}>vCard (.vcf) or CSV exported from any phone or CRM</Text>
              </View>
              <Text style={styles.sourceChevron}>›</Text>
            </Pressable>

            <Pressable onPress={() => setPasteMode(m => !m)} style={styles.pasteToggle}>
              <Text style={styles.pasteToggleText}>{pasteMode ? '▾ Paste vCard or CSV text' : '▸ Paste vCard or CSV text'}</Text>
            </Pressable>
            {pasteMode ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={pasteText}
                  onChangeText={setPasteText}
                  placeholder={'Paste vCard or CSV here…\n\nBEGIN:VCARD\nFN:Jordan Price\nTEL:555-123-4567\nEND:VCARD'}
                  placeholderTextColor={colors.grey}
                  multiline
                  style={styles.pasteInput}
                />
                <Pressable onPress={fromPaste} disabled={!pasteText.trim()} style={[styles.parseBtn, !pasteText.trim() && { opacity: 0.4 }]}>
                  <Text style={styles.parseBtnText}>Parse contacts</Text>
                </Pressable>
              </View>
            ) : null}

            {!deviceSupported ? (
              <Text style={styles.hint}>
                Your browser doesn’t expose the device contact picker — upload or paste a vCard/CSV instead.
              </Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        ) : (
          <>
            <View style={styles.reviewBar}>
              <Pressable onPress={toggleAll} style={styles.selectAll}>
                <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>
                  {allSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.selectAllText}>Select all</Text>
              </Pressable>
              {dupCount > 0 ? (
                <Text style={styles.dupNote}>{dupCount} already in your book</Text>
              ) : null}
            </View>
            <ScrollView contentContainerStyle={styles.reviewList}>
              {rows.map(r => {
                const on = selected.has(r.id);
                const sub = [r.phone, r.email].filter(Boolean).join(' · ');
                return (
                  <Pressable key={r.id} onPress={() => toggleOne(r.id)} style={styles.reviewRow}>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.reviewName} numberOfLines={1}>
                        {[r.firstName, r.lastName].filter(Boolean).join(' ')}
                      </Text>
                      {sub ? <Text style={styles.reviewSub} numberOfLines={1}>{sub}</Text> : null}
                    </View>
                    {r.dup ? <Text style={styles.dupBadge}>IN BOOK</Text> : null}
                  </Pressable>
                );
              })}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={{ height: 20 }} />
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '12%',
    backgroundColor: colors.ink2,
    borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.ink4, marginTop: 10, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    minWidth: 70, alignItems: 'center',
  },
  headerBtnPrimary: { backgroundColor: colors.gold, borderColor: colors.gold },
  headerBtnDisabled: { backgroundColor: colors.ink4, borderColor: colors.ink4 },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },
  sourceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg,
  },
  sourceIcon: { fontSize: 22 },
  sourceTitle: { fontSize: 15, fontWeight: '700', color: colors.white },
  sourceSub: { fontSize: 12, color: colors.grey2, marginTop: 2, lineHeight: 16 },
  sourceChevron: { fontSize: 20, color: colors.gold },

  pasteToggle: { paddingVertical: 6 },
  pasteToggleText: { fontSize: 13, fontWeight: '700', color: colors.gold },
  pasteInput: {
    minHeight: 130, textAlignVertical: 'top' as any,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md, padding: 12, color: colors.white, fontSize: 13,
  } as any,
  parseBtn: { height: 46, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  parseBtnText: { color: colors.ink, fontSize: 14, fontWeight: '800' },

  hint: { fontSize: 12, color: colors.grey2, lineHeight: 17, marginTop: 4 },
  error: { color: colors.red, fontSize: 13, marginTop: 6 },

  reviewBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectAllText: { fontSize: 13, fontWeight: '700', color: colors.white },
  dupNote: { fontSize: 11, color: colors.grey2 },
  reviewList: { paddingHorizontal: 16, paddingTop: 8 },
  reviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.ink3,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkmark: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  reviewName: { fontSize: 14, fontWeight: '600', color: colors.white },
  reviewSub: { fontSize: 12, color: colors.grey2, marginTop: 1 },
  dupBadge: {
    fontSize: 9, fontWeight: '800', color: colors.grey2, letterSpacing: 0.8,
    borderWidth: 1, borderColor: colors.ink4, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden',
  },
});
