import {
  continueReading,
  filterBooks,
  getDistinctGenres,
} from '../src/services/libraryView';
import type { Book } from '../src/types/library';
const make = (id: string, changes: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: 'Author',
  progress: 0,
  remaining: '',
  cover: { background: '', accent: '', mark: '' },
  ...changes,
});
const books = [
  make('Zulu', {
    format: 'epub',
    parserVersion: 'epub-1',
    importState: 'ready',
    lastOpenedAt: '2026-09-02',
    createdAt: '2026-09-01',
  }),
  make('Alpha', {
    format: 'pdf',
    importState: 'failed',
    sourceFileName: 'garden.pdf',
    createdAt: '2026-09-03',
  }),
  make('Beta', {
    format: 'txt',
    parserVersion: 'txt-1',
    importState: 'ready',
    lastOpenedAt: '2026-09-03',
    progress: 100,
  }),
  make('Queued', { format: 'epub', importState: 'queued' }),
];
test('filters format, source filename, status and completion', () => {
  expect(
    filterBooks(books, 'garden', 'pdf', 'attention', 'title').map(b => b.id),
  ).toEqual(['Alpha']);
  expect(
    filterBooks(books, '', 'all', 'preparing', 'title').map(b => b.id),
  ).toEqual(['Queued']);
  expect(
    filterBooks(books, '', 'all', 'finished', 'title').map(b => b.id),
  ).toEqual(['Beta']);
  expect(
    filterBooks(books, '', 'all', 'reading', 'title').map(b => b.id),
  ).toEqual(['Zulu']);
});
test('sorts without changing the input and uses source import date', () => {
  expect(filterBooks(books, '', 'all', 'all', 'title').map(b => b.id)).toEqual([
    'Alpha',
    'Beta',
    'Queued',
    'Zulu',
  ]);
  expect(filterBooks(books, '', 'all', 'all', 'added')[0].id).toBe('Alpha');
  expect(books[0].id).toBe('Zulu');
});
test('continue uses own unfinished prepared book, never samples', () => {
  expect(
    continueReading([
      ...books,
      make('sample', {
        isSample: true,
        parserVersion: 'x',
        lastOpenedAt: '2099-01-01',
      }),
    ])?.id,
  ).toBe('Zulu');
  expect(continueReading([])).toBeUndefined();
});

test('filters books by genre and extracts distinct genres', () => {
  const genreBooks = [
    make('SciFi1', { genre: 'Sci-Fi' }),
    make('SciFi2', { genre: 'Sci-Fi' }),
    make('Fantasy1', { genre: 'Fantasy' }),
    make('Unknown', {}),
  ];
  expect(
    filterBooks(genreBooks, '', 'all', 'all', 'title', 'Sci-Fi').map(b => b.id),
  ).toEqual(['SciFi1', 'SciFi2']);
  expect(
    filterBooks(genreBooks, '', 'all', 'all', 'title', 'Fantasy').map(b => b.id),
  ).toEqual(['Fantasy1']);
  expect(
    filterBooks(genreBooks, '', 'all', 'all', 'title', 'all').map(b => b.id),
  ).toEqual(['Fantasy1', 'SciFi1', 'SciFi2', 'Unknown']);
  expect(
    filterBooks(genreBooks, 'Sci-Fi', 'all', 'all', 'title').map(b => b.id),
  ).toEqual(['SciFi1', 'SciFi2']);
  expect(getDistinctGenres(genreBooks)).toEqual(['Fantasy', 'Sci-Fi']);
});

