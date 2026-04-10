import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Fonts } from '../../constants/theme';

interface Lesson {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  xp_reward: number;
  lesson_order: number;
}

export default function LearnScreen() {
  const { profile } = useAuthStore();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLessons();
  }, []);

  const fetchLessons = async () => {
    const [lessonsRes, completionsRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('is_active', true).order('lesson_order'),
      profile?.id
        ? supabase.from('lesson_completions').select('lesson_id').eq('user_id', profile.id)
        : Promise.resolve({ data: [] }),
    ]);

    if (lessonsRes.data) setLessons(lessonsRes.data);
    if (completionsRes.data) {
      setCompletedIds(new Set(completionsRes.data.map((c: any) => c.lesson_id)));
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Learn</Text>
        <Text style={styles.subtitle}>His Palabra Devotionals</Text>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>🔥</Text>
          <Text style={styles.statValue}>{profile?.current_streak || 0}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>⚡</Text>
          <Text style={styles.statValue}>{profile?.xp_total || 0}</Text>
          <Text style={styles.statLabel}>Total XP</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statEmoji}>✅</Text>
          <Text style={styles.statValue}>{completedIds.size}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={lessons}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const completed = completedIds.has(item.id);
            return (
              <Pressable
                style={[styles.lessonCard, completed && styles.lessonDone]}
                onPress={() => router.push(`/learn/${item.id}` as any)}
              >
                <View style={[styles.lessonNum, completed && styles.lessonNumDone]}>
                  <Text style={styles.lessonNumText}>
                    {completed ? '✓' : index + 1}
                  </Text>
                </View>
                <View style={styles.lessonInfo}>
                  <Text style={styles.lessonTitle}>{item.title}</Text>
                  <Text style={styles.lessonDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <View style={styles.xpBadge}>
                  <Text style={styles.xpText}>+{item.xp_reward} XP</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.gold, marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.muted },

  statsBar: {
    flexDirection: 'row', marginHorizontal: 20, marginVertical: 16,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, overflow: 'hidden',
  },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  statEmoji: { fontSize: 18, marginBottom: 4 },
  statValue: { fontFamily: Fonts.bodyBold, fontSize: 18, color: Colors.text },
  statLabel: { fontFamily: Fonts.body, fontSize: 10, color: Colors.muted, marginTop: 2 },

  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },

  lessonCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 16,
  },
  lessonDone: { opacity: 0.6 },
  lessonNum: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(245,200,66,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  lessonNumDone: { backgroundColor: 'rgba(74,222,128,0.15)' },
  lessonNumText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.gold },
  lessonInfo: { flex: 1 },
  lessonTitle: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.text, marginBottom: 2 },
  lessonDesc: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted, lineHeight: 18 },
  xpBadge: {
    backgroundColor: 'rgba(245,200,66,0.1)', borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  xpText: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.gold },
});
