// Admin support dashboard overlay. Shows all support tickets across all reps.
// Admin can reply to tickets and resolve them.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import {
  loadAllTickets, loadMessages, sendMessage, resolveTicket,
  type SupportTicket, type SupportMessage,
} from '@/lib/v2/supportChat';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type FilterMode = 'open' | 'resolved' | 'all';

export default function AdminSupportDashboard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('open');
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keyboard avoidance
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const update = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  // Load all tickets when overlay opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadAllTickets()
      .then(setTickets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, refreshKey]);

  // Load messages when a ticket is selected
  useEffect(() => {
    if (!selectedTicketId) { setMessages([]); return; }
    loadMessages(selectedTicketId)
      .then(msgs => {
        setMessages(msgs);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
      })
      .catch(() => {});
  }, [selectedTicketId, refreshKey]);

  // Poll for new messages/tickets every 10s
  useEffect(() => {
    if (!open) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => {
      if (selectedTicketId) {
        loadMessages(selectedTicketId)
          .then(msgs => setMessages(prev => msgs.length !== prev.length ? msgs : prev))
          .catch(() => {});
      }
      loadAllTickets()
        .then(setTickets)
        .catch(() => {});
    }, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, selectedTicketId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedTicketId(null);
      setInput('');
      setFilter('open');
    }
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedTicketId || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendMessage(selectedTicketId, text, 'admin');
      setRefreshKey(k => k + 1);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedTicketId) return;
    try {
      await resolveTicket(selectedTicketId);
      setRefreshKey(k => k + 1);
    } catch {}
  };

  if (!open) return null;

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const filtered = filter === 'all'
    ? tickets
    : tickets.filter(t => t.status === filter);

  // ── Chat view ────────────────────────────────────────────────────────────
  const renderChatView = () => (
    <View style={{ flex: 1 }}>
      {/* Ticket info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoName}>{selectedTicket?.rep_name ?? 'Unknown rep'}</Text>
        <Text style={styles.infoEmail}>{selectedTicket?.rep_email ?? ''}</Text>
        <View style={[
          styles.statusPill,
          selectedTicket?.status === 'resolved' ? styles.statusResolved : styles.statusOpen,
        ]}>
          <Text style={[
            styles.statusPillText,
            selectedTicket?.status === 'resolved' ? { color: colors.grey2 } : { color: colors.green },
          ]}>
            {selectedTicket?.status === 'resolved' ? 'RESOLVED' : 'OPEN'}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map(m => (
          <View
            key={m.id}
            style={[
              styles.bubbleRow,
              m.sender_role === 'admin' ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
            ]}
          >
            <View
              style={[
                styles.bubble,
                m.sender_role === 'admin' ? styles.bubbleAdmin : styles.bubbleRep,
              ]}
            >
              {m.sender_role === 'rep' ? (
                <Text style={styles.senderLabel}>REP</Text>
              ) : m.sender_role === 'system' ? (
                <Text style={[styles.senderLabel, { color: colors.grey2 }]}>SYSTEM</Text>
              ) : null}
              <Text style={styles.bubbleText}>{m.content}</Text>
              <Text style={styles.time}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputBar, kbInset > 0 && { paddingBottom: 10 }]}>
        {selectedTicket?.status === 'open' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Reply as admin…"
              placeholderTextColor={colors.grey}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!sending}
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              <Text style={styles.sendIcon}>↑</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.resolvedNote}>Ticket resolved</Text>
        )}
      </View>
    </View>
  );

  // ── Ticket list view ─────────────────────────────────────────────────────
  const renderListView = () => (
    <View style={{ flex: 1 }}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['open', 'resolved', 'all'] as FilterMode[]).map(f => (
          <Pressable
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'open' ? `Open (${tickets.filter(t => t.status === 'open').length})`
                : f === 'resolved' ? 'Resolved'
                : 'All'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
        {loading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🛟</Text>
            <Text style={styles.emptyText}>
              {filter === 'open' ? 'No open tickets' : 'No tickets'}
            </Text>
          </View>
        ) : (
          filtered.map(t => (
            <Pressable key={t.id} style={styles.ticketCard} onPress={() => setSelectedTicketId(t.id)}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.ticketHeader}>
                  {t.status === 'open' ? <View style={styles.statusDot} /> : null}
                  <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                </View>
                <Text style={styles.repInfo} numberOfLines={1}>
                  {t.rep_name ?? 'Unknown'} · {t.rep_email ?? ''}
                </Text>
              </View>
              <Text style={styles.ticketTime}>{timeAgo(t.updated_at)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  // ── Header ───────────────────────────────────────────────────────────────
  const headerTitle = selectedTicketId
    ? (selectedTicket?.subject ?? 'TICKET').toUpperCase()
    : 'SUPPORT INBOX';

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, kbInset > 0 && { bottom: kbInset }]}>
        <View style={styles.header}>
          {selectedTicketId ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => { setSelectedTicketId(null); setRefreshKey(k => k + 1); }}
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>
          ) : null}
          <View style={styles.live} />
          <Text style={styles.headerLabel}>{headerTitle}</Text>
          <View style={{ flex: 1 }} />
          {selectedTicketId && selectedTicket?.status === 'open' ? (
            <Pressable style={styles.resolveBtn} onPress={handleResolve}>
              <Text style={styles.resolveText}>Resolve</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {selectedTicketId ? renderChatView() : renderListView()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.8)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '6%',
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.greenBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.ink2,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  live: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.green,
  },
  headerLabel: { fontSize: 11, fontWeight: '800', color: colors.green, letterSpacing: 1.4 },
  backBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: colors.grey3, fontSize: 18 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.grey2, fontSize: 14 },
  resolveBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.greenBg,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  resolveText: { fontSize: 11, fontWeight: '700', color: colors.green, letterSpacing: 0.3 },

  // ── Filter tabs ──────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  filterTabActive: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.grey2 },
  filterTextActive: { color: colors.green },

  // ── Ticket list ──────────────────────────────────────────────────────────
  listContent: { padding: 16, gap: 6 },
  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  ticketSubject: { fontSize: 14, fontWeight: '600', color: colors.white },
  repInfo: { fontSize: 11, color: colors.grey, marginLeft: 16 },
  ticketTime: { fontSize: 11, color: colors.grey, marginLeft: 8 },
  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 14, color: colors.grey2, textAlign: 'center' },

  // ── Ticket info banner ───────────────────────────────────────────────────
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  infoName: { fontSize: 13, fontWeight: '700', color: colors.white },
  infoEmail: { fontSize: 11, color: colors.grey, flex: 1 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusOpen: { backgroundColor: colors.greenBg, borderColor: colors.greenBorder },
  statusResolved: { backgroundColor: colors.surface2, borderColor: colors.ink4 },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  // ── Chat ─────────────────────────────────────────────────────────────────
  messages: { padding: 14, gap: 4, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', paddingVertical: 6 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  bubbleRep: { backgroundColor: colors.surface2, borderColor: colors.ink4, borderTopLeftRadius: 4 },
  bubbleAdmin: { backgroundColor: colors.greenBg, borderColor: colors.greenBorder, borderBottomRightRadius: 4 },
  senderLabel: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1.0, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: colors.grey3, lineHeight: 20, letterSpacing: -0.15 },
  time: { fontSize: 10, color: colors.grey, marginTop: 4 },

  // ── Input bar ────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? ('max(24px, env(safe-area-inset-bottom))' as any) : 24,
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    color: colors.white, fontSize: 14,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: colors.white, fontSize: 16, fontWeight: '800' },
  resolvedNote: { fontSize: 13, color: colors.grey, textAlign: 'center', flex: 1 },
});
