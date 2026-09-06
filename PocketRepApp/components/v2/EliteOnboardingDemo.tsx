import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { QuickReplyChip } from './EliteOnboardingChrome';

type DemoContactCardProps = {
  name: string;
  vehicle?: string | null;
  message: string;
  score?: number | null;
};

export function DemoContactCard({ name, vehicle, message, score }: DemoContactCardProps) {
  return (
    <View style={styles.contactCard}>
      <View style={styles.contactTop}>
        <View style={styles.contactIdentity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.vehicle} numberOfLines={1}>{vehicle || 'Sample customer'}</Text>
          </View>
        </View>
        <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View>
      </View>
      <View style={styles.reasonRow}>
        <Text style={styles.reasonLabel}>REX DRAFT</Text>
        {typeof score === 'number' ? <Text style={styles.score}>{score}</Text> : null}
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

type DemoQueuePanelProps = {
  children: ReactNode;
  loading?: boolean;
};

export function DemoQueuePanel({ children, loading = false }: DemoQueuePanelProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderCopy}>
          <Text style={styles.kicker}>WORK MY BOOK · DEMO</Text>
          <Text style={styles.panelTitle}>Different customer. Different reason.</Text>
        </View>
        <View style={styles.readyRow}><View style={styles.readyDot} /><Text style={styles.readyText}>READY</Text></View>
      </View>
      <View style={styles.queueTabs} accessibilityLabel="Work My Book preview, Text Queue selected">
        <View style={styles.queueTab}><Text style={styles.queueTabText}>RECOMMENDED</Text></View>
        <View style={styles.queueTab}><Text style={styles.queueTabText}>CALL QUEUE</Text></View>
        <View style={[styles.queueTab, styles.queueTabActive]}><Text style={[styles.queueTabText, styles.queueTabTextActive]}>TEXT QUEUE</Text></View>
      </View>
      <View style={styles.queueRule}>
        <Text style={styles.queueRuleStrong}>Reason → draft → review → send</Text>
        <Text style={styles.queueRuleText}>Nothing is auto-sent.</Text>
      </View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.gold} /><Text style={styles.loadingText}>Loading the sample book…</Text></View> : children}
    </View>
  );
}

export function DemoQuickReplies({ onSelect, selected }: { onSelect: (value: string) => void; selected?: string }) {
  const replies = [
    'Still interested?',
    'Today or tomorrow?',
    'Want me to run the next step?',
  ];

  return (
    <View style={styles.quickReplyBlock}>
      <Text style={styles.quickReplyLabel}>QUICK REPLIES · TAP TO DRAFT</Text>
      <View style={styles.quickReplyRow}>
        {replies.map(reply => (
          <QuickReplyChip key={reply} label={reply} selected={selected === reply} onPress={() => onSelect(reply)} />
        ))}
      </View>
      <Text style={styles.quickReplyNote}>Quick Replies only prepare a draft. The rep still reviews and controls every send.</Text>
    </View>
  );
}

export function DemoReplyCard({ name, message }: { name: string; message: string }) {
  return (
    <View style={styles.replyCard}>
      <View style={styles.replyHeader}>
        <View style={styles.readyDot} />
        <Text style={styles.replyKicker}>CUSTOMER REPLIED · DEMO</Text>
      </View>
      <Text style={styles.replyName}>{name}</Text>
      <Text style={styles.replyMessage}>{message}</Text>
    </View>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'PR';
}

const styles = StyleSheet.create({
  panel: { marginTop: 18, padding: 14, gap: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 4, paddingBottom: 6 },
  panelHeaderCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  panelTitle: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 5 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  readyText: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  queueTabs: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 },
  queueTab: { flex: 1, minHeight: 34, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  queueTabActive: { backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorderStrong },
  queueTabText: { color: colors.grey, fontSize: 7, lineHeight: 10, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  queueTabTextActive: { color: colors.gold },
  queueRule: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 5, paddingBottom: 2 },
  queueRuleStrong: { color: colors.gold, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  queueRuleText: { color: colors.grey2, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: colors.grey2, fontSize: 11, fontWeight: '700' },
  contactCard: { padding: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  contactTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  contactIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  avatarText: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  identityCopy: { flex: 1 },
  name: { color: colors.white, fontSize: 13, fontWeight: '800' },
  vehicle: { color: colors.grey2, fontSize: 10, marginTop: 3 },
  demoPill: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg, paddingHorizontal: 8, paddingVertical: 5 },
  demoPillText: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  reasonRow: { marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reasonLabel: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  score: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  message: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 6 },
  quickReplyBlock: { marginTop: 16 },
  quickReplyLabel: { color: colors.grey2, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 9 },
  quickReplyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickReplyNote: { color: colors.grey, fontSize: 10, lineHeight: 15, marginTop: 9 },
  replyCard: { marginTop: 16, padding: 15, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.ink2 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  replyName: { color: colors.white, fontSize: 14, fontWeight: '800', marginTop: 9 },
  replyMessage: { color: colors.grey3, fontSize: 13, lineHeight: 19, marginTop: 5 },
});
