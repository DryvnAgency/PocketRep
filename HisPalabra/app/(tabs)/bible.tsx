import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, type BibleBook } from '../../constants/bible';
import { Colors, Fonts } from '../../constants/theme';

export default function BibleScreen() {
  const router = useRouter();
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);

  // If a book is selected, show chapter grid
  if (selectedBook) {
    const chapters = Array.from({ length: selectedBook.chapters }, (_, i) => i + 1);
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.chapterHeader}>
          <Pressable onPress={() => setSelectedBook(null)}>
            <Text style={styles.backBtn}>← Books</Text>
          </Pressable>
          <Text style={styles.chapterTitle}>{selectedBook.name}</Text>
          <View style={{ width: 60 }} />
        </View>
        <FlatList
          data={chapters}
          numColumns={5}
          keyExtractor={(item) => item.toString()}
          contentContainerStyle={styles.chapterGrid}
          renderItem={({ item: chapter }) => (
            <Pressable
              style={styles.chapterBtn}
              onPress={() =>
                router.push(`/bible/${selectedBook.id}/${chapter}` as any)
              }
            >
              <Text style={styles.chapterNum}>{chapter}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  // Book list grouped by testament
  const sections = [
    { title: 'Old Testament', data: OT_BOOKS },
    { title: 'New Testament', data: NT_BOOKS },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>The Bible</Text>
        <Text style={styles.subtitle}>66 books. The Word of God.</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length} books</Text>
          </View>
        )}
        renderItem={({ item: book }) => (
          <Pressable
            style={styles.bookRow}
            onPress={() => setSelectedBook(book)}
          >
            <View style={styles.bookInfo}>
              <Text style={styles.bookName}>{book.name}</Text>
              <Text style={styles.bookMeta}>
                {book.chapters} chapters
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.gold, marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.muted },

  list: { paddingHorizontal: 20, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 24, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sectionTitle: {
    fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.gold,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  sectionCount: { fontFamily: Fonts.body, fontSize: 11, color: Colors.dim },

  bookRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bookInfo: { flex: 1 },
  bookName: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.text, marginBottom: 2 },
  bookMeta: { fontFamily: Fonts.body, fontSize: 12, color: Colors.muted },
  arrow: { fontFamily: Fonts.body, fontSize: 16, color: Colors.dim },

  // Chapter grid
  chapterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.gold },
  chapterTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text },
  chapterGrid: { padding: 20, gap: 8 },
  chapterBtn: {
    flex: 1, maxWidth: '18%', aspectRatio: 1,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    margin: 4,
  },
  chapterNum: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.text },
});
