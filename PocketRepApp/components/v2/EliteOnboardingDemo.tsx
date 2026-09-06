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

function reasonForScore(score?: number | null) {
  if (typeof score !== 'number') return 'Follow-up opportunity';
  if (score >= 75) return 'High intent · worth working now';
  if (score >= 55) return 'Follow-up due · keep momentum';
  return 'Keep warm · stay in the conversation';
}

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

      <View style={styles.reasonBox}>
        <View style={styles.reasonCopy}>
          <Text style={styles.reasonLabel}>WHY NOW</Text>
          <Text style={styles.reasonText}>{reasonForScore(score)}</Text>
        </View>
        {typeof score === 'number' ? <Text style={styles.score}>{score}</Text> : null}
      </View>

      <View style={styles.draftBox}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftLabel}>REX DRAFT</Text>
          <View style={styles.reviewPill}><Text style={styles.reviewPillText}>REVIEW</Text></View>
        </View>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

type DemoQueuePanelProps = {
  children: ReactNode;
  loading?: boolean;
};

export function DemoQueuePanel({ children, loading = false }: DemoQueuePanelProps) {
  return (
    <View style={styles.deviceFrame}>
      <View style={styles.phoneStatusBar} accessibilityElementsHidden>
        <Text style={styles.phoneTime}>9:41</Text>
        <Text style={styles.phoneSignal}>●●●  5G  ▰</Text>
      </View>
      <View style={styles.deviceTopBar}>
        <View>
          <Text style={styles.deviceBrand}>POCKETREP</Text>
          <Text style={styles.deviceScreen}>WORK MY BOOK</Text>
        </View>
        <View style={styles.deviceStatus}><View style={styles.readyDot} /><Text style={styles.deviceStatusText}>REX READY</Text></View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.kicker}>TEXT QUEUE · DEMO</Text>
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

      <View style={styles.previewNav} accessibilityElementsHidden>
        <View style={styles.previewNavItem}><View style={styles.previewNavDot} /><Text style={styles.previewNavText}>HEAT</Text></View>
        <View style={styles.previewNavItem}><View style={styles.previewNavDot} /><Text style={styles.previewNavText}>CONTACTS</Text></View>
        <View style={styles.previewRexSlot}><View style={styles.previewRexOrb}><View style={styles.previewRexCore} /></View><Text style={styles.previewRexText}>REX</Text></View>
        <View style={styles.previewNavItem}><View style={styles.previewNavDot} /><Text style={styles.previewNavText}>SALES</Text></View>
        <View style={styles.previewNavItem}><View style={styles.previewNavDot} /><Text style={styles.previewNavText}>ME</Text></View>
      </View>
      <View style={styles.homeIndicator} accessibilityElementsHidden />
    </View>
  );
}

export function DemoQuickReplies({ onSelect, selected }: { onSelect: (value: string) => void; selected?: string }) {
  const replies = [
    'Still interested?',
    'Today or tomorrow?',
    'Want me to map the next step?',
  ];

  return (
    <View style={styles.quickReplyBlock}>
      <View style={styles.quickReplyHeading}>
        <Text style={styles.quickReplyLabel}>QUICK REPLIES · CONTEXT AWARE</Text>
        <View style={styles.draftOnlyPill}><Text style={styles.draftOnlyText}>DRAFT ONLY</Text></View>
      </View>
      <Text style={styles.quickReplyPrompt}>Tap a next move and Rex prepares the wording for review.</Text>
      <View style={styles.quickReplyRow}>
        {replies.map(reply => (
          <QuickReplyChip key={reply} label={reply} selected={selected === reply} onPress={() => onSelect(reply)} />
        ))}
      </View>
      <Text style={styles.quickReplyNote}>Quick Replies never send automatically. You still review, edit if needed, and control the send.</Text>
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
      <View style={styles.replyNextMove}>
        <View style={styles.replyRexMark}><View style={styles.replyRexCore} /></View>
        <View style={styles.replyNextCopy}>
          <Text style={styles.replyNextLabel}>REX READS THE CONTEXT</Text>
          <Text style={styles.replyNextText}>The reply shapes the next draft. You choose the move, review the message, and send it yourself.</Text>
        </View>
      </View>
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
  deviceFrame: { marginTop: 18, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2, overflow: 'hidden' },
  phoneStatusBar: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 5, backgroundColor: colors.ink },
  phoneTime: { color: colors.grey3, fontSize: 7, fontWeight: '900', letterSpacing: 0.2 },
  phoneSignal: { color: colors.grey2, fontSize: 6, fontWeight: '800', letterSpacing: 0.5 },
  deviceTopBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  deviceBrand: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  deviceScreen: { color: colors.grey2, fontSize: 7, fontWeight: '800', letterSpacing: 0.9, marginTop: 2 },
  deviceStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deviceStatusText: { color: colors.grey2, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  panel: { padding: 14, gap: 10, backgroundColor: colors.surface },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 4, paddingBottom: 6 },
  panelHeaderCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  panelTitle: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 5 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  readyText: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  queueTabs: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 },
  queueTab: { flex: 1, minHeight: 38, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
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
  reasonBox: { marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  reasonCopy: { flex: 1, minWidth: 0 },
  reasonLabel: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  reasonText: { color: colors.grey3, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  score: { color: colors.gold, fontSize: 17, fontWeight: '900', letterSpacing: -0.4 },
  draftBox: { marginTop: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 },
  draftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  draftLabel: { color: colors.grey2, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  reviewPill: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.ink4, paddingHorizontal: 7, paddingVertical: 4 },
  reviewPillText: { color: colors.grey2, fontSize: 6, fontWeight: '900', letterSpacing: 0.8 },
  message: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 7 },
  previewNav: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.ink4, backgroundColor: colors.ink },
  previewNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  previewNavDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.grey },
  previewNavText: { color: colors.grey, fontSize: 6, fontWeight: '900', letterSpacing: 0.4 },
  previewRexSlot: { flex: 1.05, alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: -16 },
  previewRexOrb: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.ink2 },
  previewRexCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold },
  previewRexText: { color: colors.gold, fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  homeIndicator: { alignSelf: 'center', width: 78, height: 3, borderRadius: radius.full, backgroundColor: colors.grey, marginBottom: 5, opacity: 0.55 },
  quickReplyBlock: { marginTop: 16 },
  quickReplyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  quickReplyLabel: { color: colors.grey2, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  draftOnlyPill: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg, paddingHorizontal: 8, paddingVertical: 4 },
  draftOnlyText: { color: colors.gold, fontSize: 6, fontWeight: '900', letterSpacing: 0.8 },
  quickReplyPrompt: { color: colors.grey3, fontSize: 10, lineHeight: 15, marginBottom: 9 },
  quickReplyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickReplyNote: { color: colors.grey, fontSize: 10, lineHeight: 15, marginTop: 9 },
  replyCard: { marginTop: 16, padding: 15, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.ink2 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  replyName: { color: colors.white, fontSize: 14, fontWeight: '800', marginTop: 9 },
  replyMessage: { color: colors.grey3, fontSize: 13, lineHeight: 19, marginTop: 5 },
  replyNextMove: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  replyRexMark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, backgroundColor: colors.ink2 },
  replyRexCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  replyNextCopy: { flex: 1, minWidth: 0 },
  replyNextLabel: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  replyNextText: { color: colors.grey2, fontSize: 10, lineHeight: 15, marginTop: 3 },
});
