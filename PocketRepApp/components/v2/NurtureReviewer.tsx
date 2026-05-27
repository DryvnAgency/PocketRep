import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, TextInput,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, Pill } from './atoms';
import {
  loadPendingNurtures,
  markNurtureSent,
  dismissNurture,
  type PendingNurture,
} from '@/lib/v2/nurtureEngine';
import { launchSms } from '@/lib/v2/smsLauncher';
import { copyRuleViolations } from '@/lib/v2/blastSequences';

const HOOK_LABEL: Record<string, string> = {
  personal_detail: 'personal',
  vehicle_interest: 'vehicle',
  calendar_event: 'calendar',
  past_purchase: 'past purchase',
  holiday: 'holiday',
  pricing: 'pricing',
  inventory: 'inventory',
  rapport: 'rapport',
};

export default function NurtureReviewer({
  open, onClose, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<PendingNurture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDrafts(null);
    setError(null);
    loadPendingNurtures()
      .then(setDrafts)
      .catch(e => setError(e?.message ?? 'load failed'));
  }, [open]);

  if (!open) return null;

  const dropDraft = (id: string) => setDrafts(prev => prev?.filter(d => d.id !== id) ?? null);

  const send = async (d: PendingNurture) => {
    if (workingId) return;
    setWorkingId(d.id);
    try {
      const opened = await launchSms({
        contact_id: d.contact_id,
        contact_name: d.contact_name,
        phone: d.phone,
        message: d.message_text,
      });
      if (opened) {
        await markNurtureSent(d.id);
        dropDraft(d.id);
        onChanged();
      }
    } finally {
      setWorkingId(null);
    }
  };

  const dismiss = async (d: PendingNurture) => {
    if (workingId) return;
    setWorkingId(d.id);
    try {
      await dismissNurture(d.id);
      dropDraft(d.id);
      onChanged();
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Close</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerKicker}>NURTURE QUEUE</Text>
            <Text style={styles.headerTitle}>
              {drafts ? `${drafts.length} pending` : 'Loading…'}
            </Text>
          </View>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !drafts ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : drafts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No nurtures pending.</Text>
              <Text style={styles.emptyHint}>Generate a holiday blast from the Heat Sheet card.</Text>
            </View>
          ) : drafts.map(d => {
            const violations = copyRuleViolations(d.message_text);
            return (
              <DraftCard
                key={d.id}
                draft={d}
                violations={violations}
                disabled={workingId !== null && workingId !== d.id}
                working={workingId === d.id}
                onSend={() => send(d)}
                onDismiss={() => dismiss(d)}
                onEdit={(next) => {
                  // local edit only — Send sends the in-memory version. We
                  // never persist edits back to the row before send for the
                  // V1 flow because draft text is meant to be ephemeral.
                  setDrafts(prev => prev?.map(x => x.id === d.id ? { ...x, message_text: next } : x) ?? null);
                }}
              />
            );
          })}
          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </View>
  );
}

function DraftCard({
  draft, violations, disabled, working, onSend, onDismiss, onEdit,
}: {
  draft: PendingNurture;
  violations: string[];
  disabled: boolean;
  working: boolean;
  onSend: () => void;
  onDismiss: () => void;
  onEdit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <View style={[styles.card, disabled && { opacity: 0.5 }]}>
      <View style={styles.cardHead}>
        <Avatar name={draft.contact_name} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{draft.contact_name}</Text>
          <View style={styles.metaRow}>
            <Pill color={colors.gold}>{draft.trigger_type.replace('_', ' ').toUpperCase()}</Pill>
            <Pill color={colors.grey2}>{HOOK_LABEL[draft.hook_used] ?? draft.hook_used}</Pill>
            <Pill color={draft.language === 'es' ? colors.green : colors.grey3}>
              {draft.language.toUpperCase()}
            </Pill>
          </View>
        </View>
      </View>
      {editing ? (
        <TextInput
          value={draft.message_text}
          onChangeText={onEdit}
          multiline
          autoFocus
          style={styles.input}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <Text style={styles.message}>{draft.message_text}</Text>
      )}
      {violations.length > 0 ? (
        <Text style={styles.warn}>⚠ copy rule: {violations.join(', ')}</Text>
      ) : null}
      {!draft.phone ? (
        <Text style={styles.warn}>⚠ no phone on this contact</Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable onPress={() => setEditing(e => !e)} style={styles.btn}>
          <Text style={styles.btnText}>{editing ? 'Done' : 'Edit'}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} style={styles.btn}>
          <Text style={styles.btnText}>Skip</Text>
        </Pressable>
        <Pressable
          onPress={onSend}
          disabled={!draft.phone || working}
          style={[styles.sendBtn, (!draft.phone || working) && { opacity: 0.5 }]}
        >
          <Text style={styles.sendBtnText}>{working ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.75)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '6%',
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
    paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
  },
  headerBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    minWidth: 64, alignItems: 'center',
  },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2 },

  body: { padding: 14, gap: 12 },
  center: { padding: 40, alignItems: 'center' },
  empty: { padding: 30, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  emptyHint: { fontSize: 13, color: colors.grey2 },
  error: { color: colors.red, padding: 16 },

  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  message: { fontSize: 14, color: colors.white, lineHeight: 20 },
  input: {
    minHeight: 90,
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top' as any,
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.md,
    padding: 10,
  } as any,
  warn: { fontSize: 11, color: colors.red, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6 },
  btn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  btnText: { fontSize: 12, fontWeight: '700', color: colors.grey3, letterSpacing: 0.3 },
  sendBtn: {
    flex: 1,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  sendBtnText: { fontSize: 12, fontWeight: '800', color: colors.ink, letterSpacing: 0.3 },
});
