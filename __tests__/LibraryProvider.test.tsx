import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { LibraryProvider, useLibrary } from '../src/state/LibraryProvider';
import { bookLibraryService } from '../src/services/bookLibrary';
import type { ImportedBook } from '../src/types/library';

jest.mock('../src/services/bookLibrary', () => ({
  bookLibraryService: {
    listBooks: jest.fn(),
    chooseBook: jest.fn(),
    importBook: jest.fn(),
    cancelImport: jest.fn(),
    removeBook: jest.fn(),
    prepareBook: jest.fn(),
    cancelPreparation: jest.fn(),
    updateBookMetadata: jest.fn(),
    savePreviewPosition: jest.fn(),
    markBookFinished: jest.fn(),
    reprocessBook: jest.fn(),
    subscribe: jest.fn(),
  },
}));

const service = jest.mocked(bookLibraryService);
const book: ImportedBook = {
  id: 'book-one',
  title: 'A local story',
  author: 'Unknown author',
  progress: 0,
  remaining: 'Ready to prepare',
  cover: { background: '#315C4C', accent: '#F5E5C7', mark: 'AL' },
  format: 'txt',
  sourceFileName: 'story.txt',
  sourceSizeBytes: 100,
  importState: 'pending_parse',
  duplicate: false,
};

let library: ReturnType<typeof useLibrary>;
let tree: TestRenderer.ReactTestRenderer;

function Probe() {
  library = useLibrary();
  return null;
}

beforeEach(async () => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  service.listBooks.mockResolvedValue([]);
  service.subscribe.mockReturnValue(() => undefined);
  service.chooseBook.mockResolvedValue({
    uri: 'content://test/story',
    name: 'story.txt',
    size: 100,
    mimeType: 'text/plain',
  });
  service.importBook.mockResolvedValue(book);
  await act(async () => {
    tree = TestRenderer.create(
      <LibraryProvider>
        <Probe />
      </LibraryProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => tree.unmount());
  jest.useRealTimers();
});

test('prepares text and refreshes progress until the stored book is ready', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  service.prepareBook.mockResolvedValue({
    ...book,
    importState: 'queued',
    preparationProgress: 0,
  });
  await act(async () => {
    await library.prepareBook(book.id);
  });
  expect(library.books[0].importState).toBe('queued');
  service.listBooks.mockResolvedValue([
    {
      ...book,
      importState: 'ready',
      parserVersion: 'txt-1',
      preparationProgress: 100,
    },
  ]);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(library.books[0].importState).toBe('ready');
  const calls = service.listBooks.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(service.listBooks).toHaveBeenCalledTimes(calls);
});

test('stopping preparation keeps the book available for retry', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  service.cancelPreparation.mockResolvedValue({
    ...book,
    failureCode: 'BOOK_PREPARATION_CANCELLED',
  });
  await act(async () => {
    await library.cancelPreparation(book.id);
  });
  expect(library.books).toHaveLength(1);
  expect(library.books[0].importState).toBe('pending_parse');
});

test('an older library refresh cannot resurrect a removed book', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  let resolveBooks!: (books: ImportedBook[]) => void;
  service.listBooks.mockReturnValue(
    new Promise(resolve => {
      resolveBooks = resolve;
    }),
  );
  let refresh!: Promise<void>;
  await act(async () => {
    refresh = library.refresh();
  });
  await act(async () => {
    await library.removeBook(book.id);
  });
  await act(async () => {
    resolveBooks([book]);
    await refresh;
  });
  expect(library.books).toHaveLength(0);
});

test('a preparation failure does not remove the imported source entry', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  service.prepareBook.mockRejectedValue(new Error('Not enough storage'));
  await act(async () => {
    await expect(library.prepareBook(book.id)).rejects.toThrow(
      'Not enough storage',
    );
  });
  expect(library.books[0].id).toBe(book.id);
});

test('imports and deduplicates the same book in the visible library', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  expect(library.books).toHaveLength(1);
  service.importBook.mockResolvedValue({ ...book, duplicate: true });
  await act(async () => {
    await library.chooseAndImportBook();
  });
  expect(library.books).toHaveLength(1);
  expect(library.importProgress.message).toBe('Already in your library');
});

test('picker cancellation does not create an import or error', async () => {
  service.chooseBook.mockResolvedValue(null);
  await act(async () => {
    await library.chooseAndImportBook();
  });
  expect(service.importBook).not.toHaveBeenCalled();
  expect(library.importProgress.phase).toBe('cancelled');
  expect(library.error).toBeNull();
});

test('uses structured cancellation errors and preserves an empty shelf', async () => {
  service.importBook.mockRejectedValue({
    code: 'BOOK_IMPORT_CANCELLED',
    message: 'Book import stopped.',
  });
  await act(async () => {
    await library.chooseAndImportBook();
  });
  expect(library.importProgress.phase).toBe('cancelled');
  expect(library.error).toBeNull();
  expect(library.books).toHaveLength(0);
});

test('blocks a second picker until the first operation settles', async () => {
  let resolveSelection!: (value: null) => void;
  service.chooseBook.mockReturnValue(
    new Promise(resolve => {
      resolveSelection = resolve;
    }),
  );
  let first!: Promise<ImportedBook | null>;
  await act(async () => {
    first = library.chooseAndImportBook();
    await library.chooseAndImportBook();
  });
  expect(service.chooseBook).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveSelection(null);
    await first;
  });
});

test('automatic queued imports keep polling without an extra prepare action', async () => {
  service.importBook.mockResolvedValue({ ...book, importState: 'queued' });
  await act(async () => {
    await library.chooseAndImportBook();
  });
  expect(service.prepareBook).not.toHaveBeenCalled();
  service.listBooks.mockResolvedValue([
    { ...book, importState: 'ready', parserVersion: 'txt-1' },
  ]);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(library.books[0].parserVersion).toBe('txt-1');
});

test('metadata and preview mutations update the existing card', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  service.updateBookMetadata.mockResolvedValue({
    ...book,
    title: 'Edited',
    coverChoice: 2,
  });
  await act(async () => {
    await library.updateBookMetadata(book.id, 'Edited', 'Author', 2);
  });
  expect(library.books[0].title).toBe('Edited');
  service.savePreviewPosition.mockResolvedValue({
    ...book,
    title: 'Edited',
    previewChapterId: 'c',
    previewBlockOffset: 24,
    lastOpenedAt: '2026-09-03',
  });
  await act(async () => {
    await library.savePreviewPosition(book.id, 'c', 24);
  });
  expect(library.books[0].previewBlockOffset).toBe(24);
});

test('a late metadata response cannot restore a removed book', async () => {
  await act(async () => {
    await library.chooseAndImportBook();
  });
  let resolve!: (value: ImportedBook) => void;
  service.updateBookMetadata.mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = library.updateBookMetadata(book.id, 'Edited', 'Author', 0);
  });
  await act(async () => {
    await library.removeBook(book.id);
  });
  await act(async () => {
    resolve({ ...book, title: 'Edited' });
    await pending;
  });
  expect(library.books).toHaveLength(0);
});
