import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';

// NEW 5 capture surface: paste OR dictate a whole customer conversation, then
// hand the raw transcript to Rex to parse into a contact + notes + plan. Web
// dictation uses the browser SpeechRecognition (continuous); native users
// paste/type. Pure capture — the parse + confirm-before-write lives in RexCoach.
export default function ConversationComposer({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (transcript: string) => void;
}) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (open) { setText(''); setListening(false); }
    return () => {
      try { recRef.current?.stop?.(); } catch { /* ignore */ }
      recRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const speechAvailable =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const toggleMic = () => {
    if (!speechAvailable) return;
    if (listening) {
      try { recRef.current?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = (e: any) => {
        let finals = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finals += e.results[i][0].transcript + ' ';
        }
        if (finals) setText(prev => (prev ? prev.trimEnd() + ' ' : '') + finals.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    try { recRef.current?.stop?.(); } catch { /* ignore */ }
    onSubmit(t);
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>PARSE A CONVERSATION</Text>
            <Text style={styles.title}>Paste or dictate what was said</Text>
          </View>
          <Pressable onPress={onClose} disabled={busy} style={styles.closeBtn} hitSlop={6}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          editable={!busy}
          placeholder="Paste the conversation, or tap the mic and talk it through. Rex pulls out the contact, notes, and your next move."
          placeholderTextColor={colors.grey}
          style={styles.input}
        />

        <View style={styles.actions}>
          {speechAvailable ? (
            <Pressable onPress={toggleMic} disabled={busy} style={[styles.micBtn, listening && styles.micBtnOn]}>
              <Text style={[styles.micText, listening && { color: colors.ink }]}>
                {listening ? '● Listening — tap to stop' : '🎙 Dictate'}
              </Text>
            </Pressable>
          ) : <View style={{ flex: 1 }} />}
          <Pressable
            onPress={submit}
            disabled={busy || !text.trim()}
            style={[styles.parseBtn, (busy || !text.trim()) && { opacity: 0.5 }]}
          >
            <Text style={styles.parseText}>{busy ? 'Parsing…' : 'Parse →'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 200, justifyContent: 'flex-end' } as any,
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.82)' },
  sheet: {
    backgroundColor: colors.ink2,
    borderTopWidth: 1, borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center', width: 42, height: 4, borderRadius: 2,
    backgroundColor: colors.ink4, marginTop: 10, marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  kicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.white, marginTop: 2, letterSpacing: -0.2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.grey2, fontSize: 14 },
  input: {
    minHeight: 150, maxHeight: 280,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.white, fontSize: 14, lineHeight: 20,
    textAlignVertical: 'top' as any,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  micBtn: {
    flex: 1,
    paddingVertical: 12, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder,
  },
  micBtnOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  micText: { fontSize: 13, fontWeight: '700', color: colors.gold, letterSpacing: 0.2 },
  parseBtn: {
    flex: 1,
    paddingVertical: 12, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.gold,
  },
  parseText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.2 },
});
