import {
  View, Text, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import type { ResolvedNotification, NotificationKind } from '@/lib/v2/notifications';
import {
  markRead, markUnread, dismissNotification, markManyRead,
} from '@/lib/v2/notificationReads';

const KIND_META: Record<NotificationKind, { icon: string; color: string; tag: string }> = {
  nurture_draft: { icon: '✍', color: colors.gold, tag: 'DRAFT' },
  awaiting_reply: { icon: '↩', color: colors.green, tag: 'REPLY' },
  overdue: { icon: '🔥', color: colors.orange, tag: 'OVERDUE' },
};

export default function NotificationsCenter({
  open,
  items,
  onClose,
  onOpenContact,
  onOpenNurture,
}: {
  open: boolean;
  items: ResolvedNotification[];
  onClose: () => void;
  onOpenContact: (id: string) => void;
  onOpenNurture: () => void;
}) {
  if (!open) return null;

  const unread = items.filter(i => !i.read).length;

  const openItem = (n: ResolvedNotification) => {
    markRead(n.key);
    if (n.target === 'nurture') {
      onOpenNurture();
    } else if (n.contactId) {
      onOpenContact(n.contactId);
    }
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerKicker}>NOTIFICATIONS</Text>
            <Text style={styles.headerTitle}>
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </Text>
          </View>
          {unread > 0 ? (
            <Pressable onPress={() => markManyRead(items.map(i => i.key))} style={styles.markAll}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={6}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyText}>Nothing needs you right now.</Text>
              <Text style={styles.emptyHint}>New drafts, replies to mark, and cooling leads show up here.</Text>
            </View>
          ) : (
            items.map(n => {
              const meta = KIND_META[n.kind];
              return (
                <View key={n.key} style={[styles.card, !n.read && styles.cardUnread]}>
                  <Pressable onPress={() => openItem(n)} style={styles.cardMain}>
                    <View style={[styles.iconWrap, { borderColor: meta.color }]}>
                      <Text style={{ fontSize: 15 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.titleRow}>
                        {!n.read ? <View style={styles.dot} /> : null}
                        <Text style={[styles.title, !n.read && styles.titleUnread]} numberOfLines={2}>
                          {n.title}
                        </Text>
                      </View>
                      <Text style={styles.subtitle} numberOfLines={2}>{n.subtitle}</Text>
                      <Text style={[styles.tag, { color: meta.color }]}>{meta.tag}</Text>
                    </View>
                  </Pressable>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => (n.read ? markUnread(n.key) : markRead(n.key))}
                      hitSlop={6}
                      style={styles.actionBtn}
                    >
                      <Text style={styles.actionText}>{n.read ? 'Mark unread' : 'Mark read'}</Text>
                    </Pressable>
                    <Pressable onPress={() => dismissNotification(n.key)} hitSlop={6} style={styles.dismissBtn}>
                      <Text style={styles.dismissText}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '9%',
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
  headerKicker: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white, marginTop: 2, letterSpacing: -0.3 },
  markAll: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  markAllText: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.grey2, fontSize: 14 },

  body: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },

  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardUnread: { borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 8,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.ink2,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.grey3, letterSpacing: -0.2 },
  titleUnread: { color: colors.white, fontWeight: '700' },
  subtitle: { fontSize: 12, color: colors.grey2, marginTop: 3, lineHeight: 17 },
  tag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.0, marginTop: 6 },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  actionBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  actionText: { fontSize: 11, fontWeight: '700', color: colors.grey2 },
  dismissBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  dismissText: { fontSize: 12, color: colors.grey2 },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    fontSize: 22, color: colors.gold, fontWeight: '800',
    width: 52, height: 52, borderRadius: 26, textAlign: 'center', lineHeight: 52,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    overflow: 'hidden',
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.white, marginTop: 14 },
  emptyHint: { fontSize: 12, color: colors.grey2, marginTop: 6, textAlign: 'center', lineHeight: 17 },
});
