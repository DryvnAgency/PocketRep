import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Fonts } from '../../constants/theme';

interface VerseOfDay {
  reflection: string | null;
  verse: {
    text_kjv: string;
    text_slang: string | null;
    verse_number: number;
    chapter: number;
    book: { name: string; abbreviation: string };
  };
}

export default function HomeScreen() {
  const { profile } = useAuthStore();
  const router = useRouter();
  const [verseOfDay, setVerseOfDay] = useState<VerseOfDay | null>(null);
  const [showKjv, setShowKjv] = useState(false);

  useEffect(() => {
    fetchVerseOfDay();
  }, []);

  const fetchVerseOfDay = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('verse_of_day')
      .select(`
        reflection,
        verse:verses(
          text_kjv,
          text_slang,
          verse_number,
          chapter,
          book:bible_books(name, abbreviation)
        )
      `)
      .eq('display_date', today)
      .single();

    if (data) {
      setVerseOfDay(data as any);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {greeting()}, {profile?.display_name || 'friend'} 🙏
          </Text>
          <Text style={styles.appName}>His Palabra</Text>
        </View>

        {/* Streak */}
        <View style={styles.streakCard}>
          <Text style={styles.streakFire}>🔥</Text>
          <View>
            <Text style={styles.streakNum}>{profile?.current_streak || 0} day streak</Text>
            <Text style={styles.streakSub}>Longest: {profile?.longest_streak || 0} days</Text>
          </View>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>⚡ {profile?.xp_total || 0} XP</Text>
          </View>
        </View>

        {/* Verse of the Day */}
        <View style={styles.votdCard}>
          <View style={styles.votdHeader}>
            <Text style={styles.votdLabel}>TODAY'S WORD</Text>
            <Pressable onPress={() => setShowKjv(!showKjv)}>
              <Text style={styles.toggleBtn}>
                {showKjv ? '🗣️ Slang' : '📜 KJV'}
              </Text>
            </Pressable>
          </View>

          {verseOfDay ? (
            <>
              <Text style={styles.votdVerse}>
                {showKjv
                  ? `"${verseOfDay.verse.text_kjv}"`
                  : verseOfDay.verse.text_slang
                    ? `"${verseOfDay.verse.text_slang}"`
                    : `"${verseOfDay.verse.text_kjv}"`
                }
              </Text>
              <Text style={styles.votdRef}>
                — {verseOfDay.verse.book.name} {verseOfDay.verse.chapter}:{verseOfDay.verse.verse_number}
              </Text>
              {verseOfDay.reflection && (
                <Text style={styles.votdReflection}>{verseOfDay.reflection}</Text>
              )}
            </>
          ) : (
            <Text style={styles.votdVerse}>
              "In the beginning God created the heaven and the earth."
            </Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actions}>
          <Pressable
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/bible')}
          >
            <Text style={styles.actionEmoji}>📖</Text>
            <Text style={styles.actionTitle}>Read</Text>
            <Text style={styles.actionSub}>Open the Bible</Text>
          </Pressable>
          <Pressable
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/learn')}
          >
            <Text style={styles.actionEmoji}>🎮</Text>
            <Text style={styles.actionTitle}>Learn</Text>
            <Text style={styles.actionSub}>Today's lesson</Text>
          </Pressable>
          <Pressable
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/city')}
          >
            <Text style={styles.actionEmoji}>📍</Text>
            <Text style={styles.actionTitle}>City</Text>
            <Text style={styles.actionSub}>Your community</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  greeting: { fontFamily: Fonts.body, fontSize: 15, color: Colors.muted, marginBottom: 4 },
  appName: { fontFamily: Fonts.display, fontSize: 28, color: Colors.gold },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 16, marginBottom: 20,
  },
  streakFire: { fontSize: 32 },
  streakNum: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.text },
  streakSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  xpBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    borderWidth: 1, borderColor: 'rgba(245, 200, 66, 0.2)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  xpText: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.gold },

  votdCard: {
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: 'rgba(245,200,66,0.25)',
    borderRadius: 16, padding: 20, marginBottom: 20,
  },
  votdHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  votdLabel: {
    fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.gold,
    letterSpacing: 1.5,
  },
  toggleBtn: {
    fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.muted,
    backgroundColor: Colors.s2, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, overflow: 'hidden',
  },
  votdVerse: {
    fontFamily: Fonts.display, fontSize: 18, color: Colors.text,
    lineHeight: 30, fontStyle: 'italic', marginBottom: 10,
  },
  votdRef: {
    fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.gold,
  },
  votdReflection: {
    fontFamily: Fonts.body, fontSize: 13, color: Colors.muted,
    lineHeight: 20, marginTop: 12,
  },

  actions: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  actionEmoji: { fontSize: 28, marginBottom: 8 },
  actionTitle: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.text, marginBottom: 2 },
  actionSub: { fontFamily: Fonts.body, fontSize: 11, color: Colors.muted },
});
