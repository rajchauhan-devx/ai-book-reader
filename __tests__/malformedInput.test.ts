import { normalizeNarrationText } from '../src/services/textNormalizer';
import { filterBooks } from '../src/services/libraryView';
import { formatStorage } from '../src/services/storageBackup';
import type { Book } from '../src/types/library';

describe('Malformed Input & Extreme Boundary Fuzz Testing', () => {
  const sampleBooks: Book[] = [
    {
      id: 'book-1',
      title: 'The Great Odyssey',
      author: 'Homer & Friends',
      format: 'epub',
      progress: 0.45,
      remaining: '1h 30m',
      cover: { background: '#315C4C', accent: '#D69A45', mark: 'O' },
      sourceSizeBytes: 1048576,
      sourceFileName: 'odyssey.epub',
      mimeType: 'application/epub+zip',
      importState: 'ready',
      parserVersion: 'epub-1',
      preparationProgress: 100,
      preparationMessage: 'Ready',
      coverChoice: 0,
      warnings: [],
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:30:00.000Z',
    },
    {
      id: 'book-2',
      title: '1984: Big Brother is Watching',
      author: 'George Orwell (1903-1950)',
      format: 'pdf',
      progress: 1.0,
      remaining: 'Completed',
      cover: { background: '#20241F', accent: '#D69A45', mark: 'B' },
      sourceSizeBytes: 2097152,
      sourceFileName: '1984.pdf',
      mimeType: 'application/pdf',
      importState: 'ready',
      parserVersion: 'pdf-1',
      preparationProgress: 100,
      preparationMessage: 'Ready',
      coverChoice: 0,
      warnings: [],
      createdAt: '2026-09-04T11:00:00.000Z',
      updatedAt: '2026-09-04T11:30:00.000Z',
    },
  ];

  describe('Regex injection & Special Characters in Search', () => {
    it('safely handles regex control characters without crashing or throwing ReDoS', () => {
      const hostileQueries = [
        '.*',
        '+++',
        '([a-zA-Z]+)*',
        '???',
        '\\\\\\',
        '[a-z',
        '{1,100000}',
        '^.*$',
        '($)',
        '|',
      ];

      for (const query of hostileQueries) {
        expect(() => {
          const results = filterBooks(sampleBooks, query, 'all', 'all', 'title');
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();
      }
    });

    it('handles unicode control characters and zero-width spaces in search queries', () => {
      const unicodeQueries = [
        '\u200B\u200C\u200D', // Zero-width spaces and joiners
        '\uFEFFOdyssey',      // Byte order mark prefix
        'Odyssey\u0000',      // Null byte suffix
        '🚀📖✨',              // Pure emoji search
        'مرحبا بالعالم',      // Arabic RTL script
        'שלום עולם',          // Hebrew RTL script
      ];

      for (const query of unicodeQueries) {
        expect(() => {
          const results = filterBooks(sampleBooks, query, 'all', 'all', 'recent');
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();
      }
    });
  });

  describe('Text Normalizer Boundary Conditions', () => {
    it('safely normalizes empty, whitespace-only, or null-byte strings', () => {
      expect(normalizeNarrationText('')).toBe('');
      expect(normalizeNarrationText('   \n\t  ')).toBe('');
      expect(normalizeNarrationText('Test\u0000Word')).toBe('Test Word');
    });

    it('safely normalizes extreme numbers and currency boundaries', () => {
      expect(normalizeNarrationText('$0')).toBe('zero dollars');
      expect(normalizeNarrationText('$1')).toBe('one dollar');
      expect(normalizeNarrationText('$1000000000')).toBe('one billion dollars');
      expect(normalizeNarrationText('0%')).toBe('zero percent');
      expect(normalizeNarrationText('100%')).toBe('one hundred percent');
    });

    it('survives repeated non-ASCII punctuation and complex scripts', () => {
      const complexText = '«««Hello... "World"??? ——— 100/100 £50.50 €0.99»»»';
      const result = normalizeNarrationText(complexText);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toContain('fifty pounds');
    });
  });

  describe('Storage Formatter Boundary Values', () => {
    it('correctly handles 0, negative, and extreme byte sizes', () => {
      expect(formatStorage(0)).toBe('0 B');
      expect(formatStorage(-50)).toBe('0 B');
      expect(formatStorage(1023)).toBe('1023 B');
      expect(formatStorage(1024)).toBe('1.0 KB');
      expect(formatStorage(1048576)).toBe('1.0 MB');
      expect(formatStorage(1073741824)).toBe('1.0 GB');
      expect(formatStorage(1099511627776)).toBe('1024.0 GB');
    });
  });
});
