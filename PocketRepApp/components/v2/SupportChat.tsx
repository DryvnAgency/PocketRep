// Rep-side support chat overlay. Opens from the Profile tab "Support" row.
// Two views: ticket list (default) and chat thread (on ticket tap or create).

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import SupportAttachment from './SupportAttachment';
import { Label } from './atoms';
import {
  loadMyTickets, createTicket, loadMessages, sendMessage, sendImageMessage, reopenTicket,
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

const CATEGORIES = [
  'Billing & payments',
  'Login & account',
  'App issue / bug',
  'Rex / AI',
  'Feature request',
  'Other',
];

export default function SupportChat({
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
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keyboard avoidance (same pattern as RexCoach)
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

  // Load tickets when overlay opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadMyTickets()
      .then(t => { setTickets(t); setError(''); })
      .catch(() => setError('Could not load tickets - pull down to retry'))
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

  // Poll for new messages every 10s when in chat view
  useEffect(() => {
    if (!open || !selectedTicketId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => {
      loadMessages(selectedTicketId)
        .then(msgs => {
          setMessages(prev => {
            if (msgs.length !== prev.length) {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              return msgs;
            }
            return prev;
          });
        })
        .catch(() => {});
    }, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, selectedTicketId]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSelectedTicketId(null);
      setCreating(false);
      setNewCategory(null);
      setNewMessage('');
      setInput('');
    }
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedTicketId || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendMessage(selectedTicketId, text, 'rep');
      setError('');
      setRefreshKey(k => k + 1);
    } catch {
      setInput(text); // restore on failure
      setError('Could not send - try again');
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async () => {
    if (!selectedTicketId || uploading || sending) return;
    setUploading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError('Photo access is required to attach a screenshot'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await sendImageMessage({
        ticketId: selectedTicketId,
        senderRole: 'rep',
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
      setError('');
      setRefreshKey(k => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach image - try again');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateTicket = async () => {
    const text = newMessage.trim();
    if (!text || !newCategory || sending) return;
    setSending(true);
    try {
      const id = await createTicket(newCategory, text);
      setCreating(false);
      setNewCategory(null);
      setNewMessage('');
      setSelectedTicketId(id);
      setRefreshKey(k => k + 1);
    } catch {
      setError('Could not create ticket - try again');
    } finally {
      setSending(false);
    }
  };

  const handleReopen = async (ticketId: string) => {
    try {
      await reopenTicket(ticketId);
      setRefreshKey(k => k + 1);
    } catch {
      setError('Could not reopen - try again');
    }
  };

  if (!open) return null;

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // ── New ticket view ──────────────────────────────────────────────────────
  const renderCreateView = () => (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.createContent}>
        <Label color={colors.grey2}>WHAT DO YOU NEED HELP WITH?</Label>
        <View style={styles.catGrid}>
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat}
              style={[styles.catChip, newCategory === cat && styles.catChipActive]}
              onPress={() => setNewCategory(cat)}
            >
              <Text style={[styles.catText, newCategory === cat && styles.catTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </View>
        {newCategory ? (
          <>
            <Label color={colors.grey2} style={{ marginTop: 20 }}>DESCRIBE YOUR ISSUE</Label>
            <TextInput
              style={styles.createInput}
              placeholder="Tell us what's going on…"
              placeholderTextColor={colors.grey}
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </>
        ) : null}
      </ScrollView>
      {newCategory && newMessage.trim() ? (
        <View style={[styles.inputBar, kbInset > 0 && { paddingBottom: 10 }]}>
          <Pressable
            style={[styles.createBtn, sending && { opacity: 0.5 }]}
            onPress={handleCreateTicket}
            disabled={sending}
          >
            <Text style={styles.createBtnText}>{sending ? 'Sending…' : 'Submit'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  // ── Chat view ────────────────────────────────────────────────────────────
  const renderChatView = () => (
    <View style={{ flex: 1 }}>
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
              m.sender_role === 'rep' ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
            ]}
          >
            <View
              style={[
                styles.bubble,
                m.sender_role === 'rep' ? styles.bubbleUser : styles.bubbleAdmin,
              ]}
            >
              {m.sender_role !== 'rep' ? (
                <Text style={styles.senderLabel}>
                  {m.sender_role === 'admin' ? 'POCKETREP' : 'SYSTEM'}
                </Text>
              ) : null}
              {m.content && m.content !== '[Image attachment]' ? <Text style={styles.bubbleText}>{m.content}</Text> : null}
              {m.attachment_path ? <SupportAttachment path={m.attachment_path} name={m.attachment_name} /> : null}
              <Text style={styles.time}>
                {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
        {selectedTicket?.status === 'resolved' ? (
          <View style={styles.resolvedBanner}>
            <Text style={styles.resolvedText}>✓ This ticket has been resolved</Text>
            <Pressable onPress={() => handleReopen(selectedTicketId!)}>
              <Text style={styles.reopenText}>Reopen</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {selectedTicket?.status !== 'resolved' ? (
        <View style={[styles.inputBar, kbInset > 0 && { paddingBottom: 10 }]}>
          <Pressable
            style={[styles.sendBtn, (uploading || sending) && { opacity: 0.4 }]}
            onPress={handleAttach}
            disabled={uploading || sending}
            accessibilityLabel="Attach image"
          >
            <Text style={styles.sendIcon}>{uploading ? '…' : '📎'}</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor={colors.grey}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!sending && !uploading}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  // ── Ticket list view ─────────────────────────────────────────────────────
  const openTickets = tickets.filter(t => t.status === 'open');
  const resolvedTickets = tickets.filter(t => t.status === 'resolved');

  const renderListView = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
      <Pressable style={styles.newTicketBtn} onPress={() => setCreating(true)}>
        <Text style={styles.newTicketText}>+ New ticket</Text>
      </Pressable>

      {loading ? (
        <Text style={styles.emptyText}>Loading…</Text>
      ) : tickets.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>No support tickets yet</Text>
          <Text style={styles.emptySubtext}>Tap "New ticket" if you need help</Text>
        </View>
      ) : (
        <>
          {openTickets.length > 0 ? (
            <>
              <Label color={colors.green} style={{ marginTop: 12 }}>OPEN</Label>
              {openTickets.map(t => (
                <Pressable key={t.id} style={styles.ticketCard} onPress={() => setSelectedTicketId(t.id)}>
                  <View style={styles.ticketHeader}>
                    <View style={styles.statusDot} />
                    <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                  </View>
                  <Text style={styles.ticketTime}>{timeAgo(t.updated_at)}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
          {resolvedTickets.length > 0 ? (
            <>
              <Label color={colors.grey} style={{ marginTop: 16 }}>RESOLVED</Label>
              {resolvedTickets.map(t => (
                <Pressable key={t.id} style={[styles.ticketCard, { opacity: 0.5 }]} onPress={() => setSelectedTicketId(t.id)}>
                  <View style={styles.ticketHeader}>
                    <Text style={[styles.ticketSubject, { color: colors.grey2 }]} numberOfLines={1}>{t.subject}</Text>
                  </View>
                  <Text style={styles.ticketTime}>{timeAgo(t.updated_at)}</Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );

  // ── Header ───────────────────────────────────────────────────────────────
  const headerTitle = creating
    ? 'NEW TICKET'
    : selectedTicketId
    ? (selectedTicket?.subject ?? 'SUPPORT').toUpperCase()
    : 'SUPPORT';

  const showBack = !!selectedTicketId || creating;

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, kbInset > 0 && { bottom: kbInset }]}>
        {/* Header */}
        <View style={styles.header}>
          {showBack ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => {
                if (creating) { setCreating(false); setNewCategory(null); setNewMessage(''); }
                else { setSelectedTicketId(null); setRefreshKey(k => k + 1); }
              }}
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>
          ) : null}
          <View style={styles.live} />
          <Text style={styles.headerLabel}>{headerTitle}</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Error banner */}
        {error ? (
          <Pressable style={styles.errorBanner} onPress={() => setError('')}>
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}

        {/* Body */}
        {creating ? renderCreateView()
          : selectedTicketId ? renderChatView()
          : renderListView()}
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
  errorBanner: {
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,80,80,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: { fontSize: 12, color: '#ff5050', textAlign: 'center' },

  // ── Ticket list ──────────────────────────────────────────────────────────
  listContent: { padding: 16, gap: 6 },
  newTicketBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    alignItems: 'center',
  },
  newTicketText: { fontSize: 14, fontWeight: '700', color: colors.green, letterSpacing: 0.2 },
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
    marginTop: 6,
  },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  ticketSubject: { fontSize: 14, fontWeight: '600', color: colors.white, flex: 1 },
  ticketTime: { fontSize: 11, color: colors.grey, marginLeft: 8 },
  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 14, color: colors.grey2, textAlign: 'center' },
  emptySubtext: { fontSize: 12, color: colors.grey, textAlign: 'center' },

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
  bubbleUser: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder, borderBottomRightRadius: 4 },
  bubbleAdmin: { backgroundColor: colors.greenBg, borderColor: colors.greenBorder, borderTopLeftRadius: 4 },
  senderLabel: { fontSize: 9, fontWeight: '800', color: colors.green, letterSpacing: 1.0, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: colors.grey3, lineHeight: 20, letterSpacing: -0.15 },
  time: { fontSize: 10, color: colors.grey, marginTop: 4 },
  resolvedBanner: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  resolvedText: { fontSize: 13, color: colors.green, fontWeight: '600' },
  reopenText: { fontSize: 12, color: colors.gold, fontWeight: '700' },

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

  // ── New ticket form ──────────────────────────────────────────────────────
  createContent: { padding: 16, gap: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
  },
  catChipActive: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  catText: { fontSize: 13, fontWeight: '600', color: colors.grey2 },
  catTextActive: { color: colors.green },
  createInput: {
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.white, fontSize: 14,
    minHeight: 100,
    marginTop: 4,
    textAlignVertical: 'top',
  } as any,
  createBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '800', color: colors.white, letterSpacing: 0.2 },
});
