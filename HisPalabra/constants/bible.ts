/**
 * His Palabra — Bible Book Data
 * All 66 books with metadata for navigation.
 */

export interface BibleBook {
  id: number;
  name: string;
  abbr: string;
  testament: 'OT' | 'NT';
  chapters: number;
}

export const BIBLE_BOOKS: BibleBook[] = [
  // OLD TESTAMENT
  { id: 1, name: 'Genesis', abbr: 'Gen', testament: 'OT', chapters: 50 },
  { id: 2, name: 'Exodus', abbr: 'Exod', testament: 'OT', chapters: 40 },
  { id: 3, name: 'Leviticus', abbr: 'Lev', testament: 'OT', chapters: 27 },
  { id: 4, name: 'Numbers', abbr: 'Num', testament: 'OT', chapters: 36 },
  { id: 5, name: 'Deuteronomy', abbr: 'Deut', testament: 'OT', chapters: 34 },
  { id: 6, name: 'Joshua', abbr: 'Josh', testament: 'OT', chapters: 24 },
  { id: 7, name: 'Judges', abbr: 'Judg', testament: 'OT', chapters: 21 },
  { id: 8, name: 'Ruth', abbr: 'Ruth', testament: 'OT', chapters: 4 },
  { id: 9, name: '1 Samuel', abbr: '1Sam', testament: 'OT', chapters: 31 },
  { id: 10, name: '2 Samuel', abbr: '2Sam', testament: 'OT', chapters: 24 },
  { id: 11, name: '1 Kings', abbr: '1Kgs', testament: 'OT', chapters: 22 },
  { id: 12, name: '2 Kings', abbr: '2Kgs', testament: 'OT', chapters: 25 },
  { id: 13, name: '1 Chronicles', abbr: '1Chr', testament: 'OT', chapters: 29 },
  { id: 14, name: '2 Chronicles', abbr: '2Chr', testament: 'OT', chapters: 36 },
  { id: 15, name: 'Ezra', abbr: 'Ezra', testament: 'OT', chapters: 10 },
  { id: 16, name: 'Nehemiah', abbr: 'Neh', testament: 'OT', chapters: 13 },
  { id: 17, name: 'Esther', abbr: 'Esth', testament: 'OT', chapters: 10 },
  { id: 18, name: 'Job', abbr: 'Job', testament: 'OT', chapters: 42 },
  { id: 19, name: 'Psalms', abbr: 'Ps', testament: 'OT', chapters: 150 },
  { id: 20, name: 'Proverbs', abbr: 'Prov', testament: 'OT', chapters: 31 },
  { id: 21, name: 'Ecclesiastes', abbr: 'Eccl', testament: 'OT', chapters: 12 },
  { id: 22, name: 'Song of Solomon', abbr: 'Song', testament: 'OT', chapters: 8 },
  { id: 23, name: 'Isaiah', abbr: 'Isa', testament: 'OT', chapters: 66 },
  { id: 24, name: 'Jeremiah', abbr: 'Jer', testament: 'OT', chapters: 52 },
  { id: 25, name: 'Lamentations', abbr: 'Lam', testament: 'OT', chapters: 5 },
  { id: 26, name: 'Ezekiel', abbr: 'Ezek', testament: 'OT', chapters: 48 },
  { id: 27, name: 'Daniel', abbr: 'Dan', testament: 'OT', chapters: 12 },
  { id: 28, name: 'Hosea', abbr: 'Hos', testament: 'OT', chapters: 14 },
  { id: 29, name: 'Joel', abbr: 'Joel', testament: 'OT', chapters: 3 },
  { id: 30, name: 'Amos', abbr: 'Amos', testament: 'OT', chapters: 9 },
  { id: 31, name: 'Obadiah', abbr: 'Obad', testament: 'OT', chapters: 1 },
  { id: 32, name: 'Jonah', abbr: 'Jonah', testament: 'OT', chapters: 4 },
  { id: 33, name: 'Micah', abbr: 'Mic', testament: 'OT', chapters: 7 },
  { id: 34, name: 'Nahum', abbr: 'Nah', testament: 'OT', chapters: 3 },
  { id: 35, name: 'Habakkuk', abbr: 'Hab', testament: 'OT', chapters: 3 },
  { id: 36, name: 'Zephaniah', abbr: 'Zeph', testament: 'OT', chapters: 3 },
  { id: 37, name: 'Haggai', abbr: 'Hag', testament: 'OT', chapters: 2 },
  { id: 38, name: 'Zechariah', abbr: 'Zech', testament: 'OT', chapters: 14 },
  { id: 39, name: 'Malachi', abbr: 'Mal', testament: 'OT', chapters: 4 },
  // NEW TESTAMENT
  { id: 40, name: 'Matthew', abbr: 'Matt', testament: 'NT', chapters: 28 },
  { id: 41, name: 'Mark', abbr: 'Mark', testament: 'NT', chapters: 16 },
  { id: 42, name: 'Luke', abbr: 'Luke', testament: 'NT', chapters: 24 },
  { id: 43, name: 'John', abbr: 'John', testament: 'NT', chapters: 21 },
  { id: 44, name: 'Acts', abbr: 'Acts', testament: 'NT', chapters: 28 },
  { id: 45, name: 'Romans', abbr: 'Rom', testament: 'NT', chapters: 16 },
  { id: 46, name: '1 Corinthians', abbr: '1Cor', testament: 'NT', chapters: 16 },
  { id: 47, name: '2 Corinthians', abbr: '2Cor', testament: 'NT', chapters: 13 },
  { id: 48, name: 'Galatians', abbr: 'Gal', testament: 'NT', chapters: 6 },
  { id: 49, name: 'Ephesians', abbr: 'Eph', testament: 'NT', chapters: 6 },
  { id: 50, name: 'Philippians', abbr: 'Phil', testament: 'NT', chapters: 4 },
  { id: 51, name: 'Colossians', abbr: 'Col', testament: 'NT', chapters: 4 },
  { id: 52, name: '1 Thessalonians', abbr: '1Thess', testament: 'NT', chapters: 5 },
  { id: 53, name: '2 Thessalonians', abbr: '2Thess', testament: 'NT', chapters: 3 },
  { id: 54, name: '1 Timothy', abbr: '1Tim', testament: 'NT', chapters: 6 },
  { id: 55, name: '2 Timothy', abbr: '2Tim', testament: 'NT', chapters: 4 },
  { id: 56, name: 'Titus', abbr: 'Titus', testament: 'NT', chapters: 3 },
  { id: 57, name: 'Philemon', abbr: 'Phlm', testament: 'NT', chapters: 1 },
  { id: 58, name: 'Hebrews', abbr: 'Heb', testament: 'NT', chapters: 13 },
  { id: 59, name: 'James', abbr: 'Jas', testament: 'NT', chapters: 5 },
  { id: 60, name: '1 Peter', abbr: '1Pet', testament: 'NT', chapters: 5 },
  { id: 61, name: '2 Peter', abbr: '2Pet', testament: 'NT', chapters: 3 },
  { id: 62, name: '1 John', abbr: '1John', testament: 'NT', chapters: 5 },
  { id: 63, name: '2 John', abbr: '2John', testament: 'NT', chapters: 1 },
  { id: 64, name: '3 John', abbr: '3John', testament: 'NT', chapters: 1 },
  { id: 65, name: 'Jude', abbr: 'Jude', testament: 'NT', chapters: 1 },
  { id: 66, name: 'Revelation', abbr: 'Rev', testament: 'NT', chapters: 22 },
];

export const OT_BOOKS = BIBLE_BOOKS.filter(b => b.testament === 'OT');
export const NT_BOOKS = BIBLE_BOOKS.filter(b => b.testament === 'NT');

export const getBookById = (id: number) => BIBLE_BOOKS.find(b => b.id === id);
export const getBookByName = (name: string) =>
  BIBLE_BOOKS.find(b => b.name.toLowerCase() === name.toLowerCase());
