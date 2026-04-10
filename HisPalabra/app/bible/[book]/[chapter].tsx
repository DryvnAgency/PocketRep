import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { getBookById } from '../../../constants/bible';
import { Colors, Fonts } from '../../../constants/theme';

interface Verse {
  id: number;
  verse_number: number;
  text_kjv: string;
  text_slang: string | null;
}

export default function ChapterReaderScreen() {
  const { book, chapter } = useLocalSearchParams<{ book: string; chapter: string }>();
  const router = useRouter();
  const bookId = parseInt(book!, 10);
  const chapterNum = parseInt(chapter!, 10);
  const bookData = getBookById(bookId);

  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'slang' | 'kjv'>('slang');

  useEffect(() => {
    fetchVerses();
  }, [bookId, chapterNum]);

  const fetchVerses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('verses')
      .select('id, verse_number, text_kjv, text_slang')
      .eq('book_id', bookId)
      .eq('chapter', chapterNum)
      .order('verse_number');

    if (!error && data) {
      setVerses(data);
    }
    setLoading(false);
  };

  const hasSlang = verses.some(v => v.text_slang != null);

  const goToChapter = (delta: number) => {
    const nextChapter = chapterNum + delta;
    if (bookData && nextChapter >= 1 && nextChapter <= bookData.chapters) {
      router.replace(`/bible/${bookId}/${nextChapter}` as any);
    }
  };

  if (!bookData) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Book not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← {bookData.name}</Text>
        </Pressable>
        <Text style={styles.chapterLabel}>Chapter {chapterNum}</Text>
        <Pressable
          style={styles.modeToggle}
          onPress={() => setMode(mode === 'slang' ? 'kjv' : 'slang')}
        >
          <Text style={styles.modeText}>
            {mode === 'slang' ? '🗣️ Slang' : '📜 KJV'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Chapter heading */}
          <Text style={styles.chapterHeading}>
            {bookData.name} {chapterNum}
          </Text>

          {!hasSlang && mode === 'slang' && (
            <View style={styles.noSlangBanner}>
              <Text style={styles.noSlangText}>
                Slang translation coming soon for this chapter. Showing KJV.
              </Text>
            </View>
          )}

          {/* Verses */}
          {verses.map((verse) => {
            const text = mode === 'slang' && verse.text_slang
              ? verse.text_slang
              : verse.text_kjv;

            return (
              <Pressable key={verse.id} style={styles.verseRow}>
                <Text style={styles.verseNum}>{verse.verse_number}</Text>
                <Text style={[
                  styles.verseText,
                  mode === 'kjv' && styles.verseTextKjv,
                ]}>
                  {text}
                </Text>
              </Pressable>
            );
          })}

          {/* Chapter navigation */}
          <View style={styles.navRow}>
            {chapterNum > 1 && (
              <Pressable style={styles.navBtn} onPress={() => goToChapter(-1)}>
                <Text style={styles.navBtnText}>← Ch {chapterNum - 1}</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            {chapterNum < bookData.chapters && (
              <Pressable style={styles.navBtn} onPress={() => goToChapter(1)}>
                <Text style={styles.navBtnText}>Ch {chapterNum + 1} →</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.gold },
  chapterLabel: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.text },
  modeToggle: {
    backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  modeText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.text },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  content: { padding: 20, paddingBottom: 60 },

  chapterHeading: {
    fontFamily: Fonts.display, fontSize: 24, color: Colors.gold,
    marginBottom: 20, textAlign: 'center',
  },

  noSlangBanner: {
    backgroundColor: 'rgba(245,200,66,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  noSlangText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.gold, textAlign: 'center' },

  verseRow: {
    flexDirection: 'row', marginBottom: 8, gap: 8,
  },
  verseNum: {
    fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.gold,
    width: 28, textAlign: 'right', paddingTop: 4,
  },
  verseText: {
    flex: 1, fontFamily: Fonts.body, fontSize: 16,
    color: Colors.text, lineHeight: 28,
  },
  verseTextKjv: {
    fontFamily: 'PlayfairDisplay_400Regular_Italic',
    color: 'rgba(238,237,248,0.75)',
  },

  navRow: {
    flexDirection: 'row', marginTop: 32, gap: 12,
  },
  navBtn: {
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
  },
  navBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.gold },

  error: { fontFamily: Fonts.body, fontSize: 16, color: Colors.red, textAlign: 'center', marginTop: 40 },
});
