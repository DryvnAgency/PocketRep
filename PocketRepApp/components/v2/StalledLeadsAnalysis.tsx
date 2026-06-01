import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Avatar, Label, Pill } from './atoms';
import { batchKill, type StalledReport, type StalledRecommendation } from '@/lib/v2/stalledLeads';
import { useSlowCallHint } from '@/lib/v2/useSlowCallHint';

const REC_META: Record<StalledRecommendation['recommendation'], { color: string; label: string }> = {
  KILL:  { color: colors.red,    label: 'KILL' },
  PUSH:  { color: colors.green,  label: 'PUSH' },
  FENCE: { color: colors.orange, label: 'FENCE' },
  WATCH: { color: colors.grey2,  label: 'WATCH' },
};

function Card({
  r, picked, onTogglePick,
}: {
  r: StalledRecommendation;
  picked: boolean;
  onTogglePick: () => void;
}) {
  const meta = REC_META[r.recommendation];
  return (
    <Pressable onPress={onTogglePick} style={[
      styles.card,
      picked && { borderColor: meta.color, backgroundColor: colors.goldBg },
    ]}>
      <View style={styles.cardHead}>
        <Avatar name={r.contact_name} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{r.contact_name}</Text>
          <Text style={styles.meta}>
            heat {r.heat_score} · {r.days_silent}d silent
            {r.vehicle ? ` · ${r.vehicle}` : ''}
          </Text>
        </View>
        <Pill color={meta.color}>{meta.label}</Pill>
      </View>
      <Text style={styles.reason}>{r.reason}</Text>
      {r.suggested_opener ? (
        <View style={styles.opener}>
          <Label color={meta.color}>SUGGESTED OPENER · {r.suggested_language.toUpperCase()}</Label>
          <Text style={styles.openerText}>{r.suggested_opener}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function StalledLeadsAnalysis({
  open,
  report,
  loading,
  onClose,
  onDispatchBlast,
  onKilled,
}: {
  open: boolean;
  report: StalledReport | null;
  loading: boolean;
  onClose: () => void;
  // Selected PUSH/FENCE rows the rep wants to message — caller hands them
  // off to BlastSequenceDrafter with the pre-drafted openers.
  onDispatchBlast: (rows: StalledRecommendation[]) => void;
  onKilled: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<'kill' | 'push' | null>(null);
  const slowPhase = useSlowCallHint(loading);

  if (!open) return null;

  const togglePick = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const recommendations = report?.recommendations ?? [];
  const pickedRows = recommendations.filter(r => picked.has(r.contact_id));
  const pickedPushFence = pickedRows.filter(r => r.recommendation === 'PUSH' || r.recommendation === 'FENCE');
  const pickedKill = pickedRows.filter(r => r.recommendation === 'KILL');

  const handleKillSelected = async () => {
    if (pickedKill.length === 0 || working) return;
    setWorking('kill');
    try {
      await batchKill(pickedKill.map(r => r.contact_id));
      onKilled();
      onClose();
    } finally {
      setWorking(null);
    }
  };

  const handlePushSelected = () => {
    if (pickedPushFence.length === 0) return;
    onDispatchBlast(pickedPushFence);
    onClose();
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
            <Text style={styles.headerKicker}>STALLED LEADS</Text>
            <Text style={styles.headerTitle}>
              {report ? `${report.stalled_count} stalled` : 'Analyzing…'}
            </Text>
          </View>
          <View style={{ width: 72 }} />
        </View>

        {report?.summary ? (
          <Text style={styles.summary}>{report.summary}</Text>
        ) : null}

        <ScrollView contentContainerStyle={styles.body}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.centerHint}>
                {slowPhase === 'slow'
                  ? 'Still working — Rex is reading every lead. A few more seconds…'
                  : 'Rex is sorting through your book…'}
              </Text>
            </View>
          ) : recommendations.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing stalled.</Text>
              <Text style={styles.emptyHint}>Your book is healthy. Keep it warm.</Text>
            </View>
          ) : (
            recommendations.map(r => (
              <Card
                key={r.contact_id}
                r={r}
                picked={picked.has(r.contact_id)}
                onTogglePick={() => togglePick(r.contact_id)}
              />
            ))
          )}
        </ScrollView>

        {pickedRows.length > 0 ? (
          <View style={styles.footer}>
            {pickedKill.length > 0 ? (
              <Pressable
                onPress={handleKillSelected}
                disabled={!!working}
                style={[styles.footerBtn, styles.killBtn, working ? { opacity: 0.6 } : null]}
              >
                <Text style={styles.killBtnText}>
                  {working === 'kill' ? 'Killing…' : `Kill ${pickedKill.length}`}
                </Text>
              </Pressable>
            ) : null}
            {pickedPushFence.length > 0 ? (
              <Pressable
                onPress={handlePushSelected}
                disabled={!!working}
                style={[styles.footerBtn, styles.pushBtn]}
              >
                <Text style={styles.pushBtnText}>
                  Push {pickedPushFence.length}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
    minWidth: 72, alignItems: 'center',
  },
  headerBtnText: { fontSize: 12, fontWeight: '700', color: colors.grey2 },
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2 },
  summary: { fontSize: 13, color: colors.gold, paddingHorizontal: 16, paddingTop: 10 },

  body: { padding: 14, gap: 10 },
  center: { padding: 40, alignItems: 'center', gap: 10 },
  centerHint: { fontSize: 13, color: colors.grey2 },
  empty: { padding: 30, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  emptyHint: { fontSize: 13, color: colors.grey2 },

  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  meta: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  reason: { fontSize: 12, color: colors.grey3, fontStyle: 'italic' },
  opener: {
    backgroundColor: colors.ink,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 6,
  },
  openerText: { fontSize: 13, color: colors.white, lineHeight: 19 },

  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10, paddingBottom: 22,
    borderTopWidth: 1, borderTopColor: colors.ink4,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  killBtn: { backgroundColor: colors.redBg, borderWidth: 1, borderColor: colors.red },
  killBtnText: { fontSize: 13, fontWeight: '800', color: colors.red, letterSpacing: 0.3 },
  pushBtn: { backgroundColor: colors.gold },
  pushBtnText: { fontSize: 13, fontWeight: '800', color: colors.ink, letterSpacing: 0.3 },
});
