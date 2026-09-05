import type { Book, BookFormat } from '../types/library';
export type LibraryFilter =
  | 'all'
  | 'ready'
  | 'preparing'
  | 'attention'
  | 'unread'
  | 'reading'
  | 'finished';
export type LibrarySort = 'recent' | 'added' | 'title' | 'author';
export function filterBooks(
  books: Book[],
  query: string,
  format: BookFormat | 'all',
  filter: LibraryFilter,
  sort: LibrarySort,
  genre: string | 'all' = 'all',
): Book[] {
  const search = query.trim().toLocaleLowerCase();
  return books
    .filter(
      book =>
        (!search ||
          (
            book.title +
            ' ' +
            book.author +
            ' ' +
            (book.genre ?? '') +
            ' ' +
            (book.sourceFileName ?? '')
          )
            .toLocaleLowerCase()
            .includes(search)) &&
        (format === 'all' || book.format === format) &&
        (genre === 'all' || (book.genre ?? 'Uncategorized') === genre) &&
        (filter === 'all' ||
          (filter === 'ready' && !!book.parserVersion) ||
          (filter === 'preparing' &&
            ['queued', 'parsing'].includes(book.importState ?? '')) ||
          (filter === 'attention' &&
            (book.importState === 'failed' ||
              book.importState === 'pending_parse')) ||
          (filter === 'unread' && !book.lastOpenedAt && book.progress < 100) ||
          (filter === 'reading' &&
            !!book.lastOpenedAt &&
            book.progress < 100) ||
          (filter === 'finished' && book.progress === 100)),
    )
    .sort((a, b) => {
      const date = (book: Book) =>
        Date.parse(
          (sort === 'added'
            ? book.createdAt
            : book.lastOpenedAt ?? book.createdAt) ?? '',
        ) || 0;
      const order =
        sort === 'title' || sort === 'author'
          ? a[sort].localeCompare(b[sort])
          : date(b) - date(a);
      return order || a.id.localeCompare(b.id);
    });
}

export function getDistinctGenres(books: Book[]): string[] {
  const genres = new Set<string>();
  books.forEach(b => {
    const g = b.genre?.trim();
    if (g) {
      genres.add(g);
    }
  });
  return Array.from(genres).sort();
}

export function continueReading(books: Book[]): Book | undefined {
  return filterBooks(
    books.filter(book => !!book.parserVersion && !book.isSample),
    '',
    'all',
    'reading',
    'recent',
  )[0];
}
