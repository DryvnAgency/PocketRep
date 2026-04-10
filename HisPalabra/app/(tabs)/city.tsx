import { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Fonts } from '../../constants/theme';

interface Message {
  id: string;
  content: string;
  message_type: string;
  verse_ref: string | null;
  created_at: string;
  user: { username: string; avatar_color: string };
}

export default function CityScreen() {
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [cityName, setCityName] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!profile?.city_group_id) return;
    fetchMessages();
    fetchCityName();

    // Subscribe to realtime messages
    const channel = supabase
      .channel('city-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `city_group_id=eq.${profile.city_group_id}`,
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('username, avatar_color')
            .eq('id', payload.new.user_id)
            .single();

          const msg: Message = {
            ...payload.new as any,
            user: userData || { username: 'unknown', avatar_color: Colors.gold },
          };
          setMessages((prev) => [msg, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.city_group_id]);

  const fetchCityName = async () => {
    if (!profile?.city_group_id) return;
    const { data } = await supabase
      .from('city_groups')
      .select('name')
      .eq('id', profile.city_group_id)
      .single();
    if (data) setCityName(data.name);
  };

  const fetchMessages = async () => {
    if (!profile?.city_group_id) return;
    const { data } = await supabase
      .from('community_messages')
      .select('id, content, message_type, verse_ref, created_at, user:profiles(username, avatar_color)')
      .eq('city_group_id', profile.city_group_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setMessages(data as any);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !profile?.city_group_id || sending) return;
    setSending(true);

    await supabase.from('community_messages').insert({
      city_group_id: profile.city_group_id,
      user_id: profile.id,
      content: newMessage.trim(),
      message_type: 'chat',
    });

    setNewMessage('');
    setSending(false);
  };

  if (!profile?.city_group_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.noCity}>
          <Text style={styles.noCityEmoji}>📍</Text>
          <Text style={styles.noCityTitle}>No city selected</Text>
          <Text style={styles.noCitySub}>
            Select your city in settings to join your local Bible community.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* City header */}
      <View style={styles.header}>
        <View style={styles.headerDot} />
        <Text style={styles.headerCity}>{cityName} Bible Fam</Text>
        <Text style={styles.headerEmoji}>📍</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.msgRow}>
            <View style={[styles.avatar, { backgroundColor: `${item.user.avatar_color}22` }]}>
              <Text style={[styles.avatarText, { color: item.user.avatar_color }]}>
                {item.user.username.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.msgBody}>
              <View style={styles.msgMeta}>
                <Text style={styles.msgUsername}>@{item.user.username}</Text>
                <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
              </View>
              {item.message_type === 'prayer_request' && (
                <Text style={styles.prayerTag}>🙏 Prayer Request</Text>
              )}
              {item.message_type === 'praise_report' && (
                <Text style={styles.praiseTag}>🎉 Praise Report</Text>
              )}
              <View style={styles.msgBubble}>
                <Text style={styles.msgText}>{item.content}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🙏</Text>
            <Text style={styles.emptyText}>
              Be the first to say something in {cityName}!
            </Text>
          </View>
        }
      />

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Share with your city..."
            placeholderTextColor={Colors.dim}
            value={newMessage}
            onChangeText={setNewMessage}
            maxLength={500}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, !newMessage.trim() && styles.sendDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.s1,
  },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green },
  headerCity: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.text, flex: 1 },
  headerEmoji: { fontSize: 18 },

  messageList: { padding: 16, gap: 12 },

  msgRow: { flexDirection: 'row', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.bodyBold, fontSize: 12 },
  msgBody: { flex: 1 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  msgUsername: {
    fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.text,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,200,66,0.3)',
  },
  msgTime: { fontFamily: Fonts.body, fontSize: 10, color: Colors.muted },
  prayerTag: {
    fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.blue,
    marginBottom: 4,
  },
  praiseTag: {
    fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.green,
    marginBottom: 4,
  },
  msgBubble: {
    backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, borderTopLeftRadius: 3,
    padding: 10,
  },
  msgText: { fontFamily: Fonts.body, fontSize: 13, color: 'rgba(238,237,248,0.85)', lineHeight: 20 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted, textAlign: 'center' },

  noCity: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  noCityEmoji: { fontSize: 48, marginBottom: 16 },
  noCityTitle: { fontFamily: Fonts.bodyBold, fontSize: 18, color: Colors.text, marginBottom: 8 },
  noCitySub: { fontFamily: Fonts.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 22 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.s1,
  },
  input: {
    flex: 1, backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: Fonts.body, fontSize: 14, color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: Colors.gold, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.bg },
});
