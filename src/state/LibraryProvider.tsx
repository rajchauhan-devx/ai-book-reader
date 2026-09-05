import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  bookLibraryService,
  type BookImportProgress,
} from '../services/bookLibrary';
import type { Book, BookSelection, ImportedBook } from '../types/library';

type LibraryContextValue = {
  books: Book[];
  loading: boolean;
  error: string | null;
  selectedBook: BookSelection | null;
  importProgress: BookImportProgress;
  refresh: () => Promise<void>;
  chooseAndImportBook: () => Promise<ImportedBook | null>;
  cancelImport: () => Promise<void>;
  removeBook: (bookId: string) => Promise<void>;
  prepareBook: (bookId: string) => Promise<void>;
  cancelPreparation: (bookId: string) => Promise<void>;
  reprocessBook: (bookId: string) => Promise<void>;
  updateBookMetadata: (
    bookId: string,
    title: string,
    author: string,
    genreOrCover?: string | number,
    coverChoice?: number,
  ) => Promise<void>;
  savePreviewPosition: (
    bookId: string,
    chapterId: string,
    offset: number,
  ) => Promise<void>;
  markBookFinished: (bookId: string, finished: boolean) => Promise<void>;
  clearImportResult: () => void;
};

const initialProgress: BookImportProgress = {
  phase: 'idle',
  progress: 0,
  copiedBytes: 0,
  totalBytes: 0,
  message: 'Choose a book to begin',
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return 'The book could not be imported.';
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookSelection | null>(null);
  const [importProgress, setImportProgress] =
    useState<BookImportProgress>(initialProgress);
  const busy = useRef(false);
  const revision = useRef(0);
  const refreshInFlight = useRef(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const atRevision = revision.current;
    try {
      const storedBooks = await bookLibraryService.listBooks();
      if (atRevision === revision.current) {
        setBooks(storedBooks);
        setError(null);
      }
    } catch (reason) {
      if (atRevision === revision.current) setError(errorMessage(reason));
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = bookLibraryService.subscribe(progress => {
      if (!busy.current) return;
      setImportProgress(current =>
        current.phase === 'cancelling' &&
        (progress.phase === 'copying' || progress.phase === 'checking')
          ? { ...progress, phase: 'cancelling', message: 'Stopping import…' }
          : progress,
      );
    });
    refresh();
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state === 'active') refresh();
    });
    return () => listener.remove();
  }, [refresh]);

  const preparing = books.some(
    book => book.importState === 'queued' || book.importState === 'parsing',
  );
  useEffect(() => {
    if (!active || !preparing) return;
    const timer = setInterval(() => {
      refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [active, preparing, refresh]);

  const chooseAndImportBook = useCallback(async () => {
    if (busy.current) return null;
    busy.current = true;
    revision.current += 1;
    setError(null);
    setSelectedBook(null);
    setImportProgress({
      ...initialProgress,
      phase: 'choosing',
      message: 'Waiting for your selection',
    });
    try {
      const selection = await bookLibraryService.chooseBook();
      if (!selection) {
        setImportProgress({
          ...initialProgress,
          phase: 'cancelled',
          message: 'No file selected',
        });
        return null;
      }
      setSelectedBook(selection);
      setImportProgress({
        phase: 'copying',
        progress: 0,
        copiedBytes: 0,
        totalBytes: selection.size,
        message: 'Copying into private storage',
      });
      const importedBook = await bookLibraryService.importBook(selection.uri);
      revision.current += 1;
      setBooks(current => {
        const withoutBook = current.filter(book => book.id !== importedBook.id);
        return [importedBook, ...withoutBook];
      });
      setImportProgress({
        phase: 'complete',
        progress: 1,
        copiedBytes: importedBook.sourceSizeBytes,
        totalBytes: importedBook.sourceSizeBytes,
        message: importedBook.duplicate
          ? 'Already in your library'
          : 'Added to your library',
      });
      return importedBook;
    } catch (reason) {
      const message = errorMessage(reason);
      const cancelled =
        typeof reason === 'object' &&
        reason !== null &&
        'code' in reason &&
        reason.code === 'BOOK_IMPORT_CANCELLED';
      setError(cancelled ? null : message);
      setImportProgress({
        ...initialProgress,
        phase: cancelled ? 'cancelled' : 'failed',
        message,
      });
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  const cancelImport = useCallback(async () => {
    if (!busy.current) return;
    setImportProgress(current => ({
      ...current,
      phase: 'cancelling',
      message: 'Stopping import…',
    }));
    try {
      await bookLibraryService.cancelImport();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, []);

  const removeBook = useCallback(async (bookId: string) => {
    revision.current += 1;
    await bookLibraryService.removeBook(bookId);
    revision.current += 1;
    setBooks(current => current.filter(book => book.id !== bookId));
  }, []);

  const prepareBook = useCallback(async (bookId: string) => {
    revision.current += 1;
    const updated = await bookLibraryService.prepareBook(bookId);
    revision.current += 1;
    setBooks(current =>
      current.map(book => (book.id === bookId ? updated : book)),
    );
  }, []);

  const cancelPreparation = useCallback(async (bookId: string) => {
    revision.current += 1;
    const updated = await bookLibraryService.cancelPreparation(bookId);
    revision.current += 1;
    setBooks(current =>
      updated
        ? current.map(book => (book.id === bookId ? updated : book))
        : current.filter(book => book.id !== bookId),
    );
  }, []);

  const clearImportResult = useCallback(() => {
    if (busy.current) return;
    setSelectedBook(null);
    setError(null);
    setImportProgress(initialProgress);
  }, []);

  const mutate = useCallback(async (action: () => Promise<ImportedBook>) => {
    revision.current += 1;
    const updated = await action();
    revision.current += 1;
    setBooks(current =>
      current.map(book => (book.id === updated.id ? updated : book)),
    );
  }, []);
  const reprocessBook = useCallback(
    (id: string) => mutate(() => bookLibraryService.reprocessBook(id)),
    [mutate],
  );
  const updateBookMetadata = useCallback(
    (
      id: string,
      title: string,
      author: string,
      genreOrCover?: string | number,
      cover?: number,
    ) =>
      mutate(() =>
        bookLibraryService.updateBookMetadata(
          id,
          title,
          author,
          genreOrCover,
          cover,
        ),
      ),
    [mutate],
  );
  const savePreviewPosition = useCallback(
    (id: string, chapter: string, offset: number) =>
      mutate(() => bookLibraryService.savePreviewPosition(id, chapter, offset)),
    [mutate],
  );
  const markBookFinished = useCallback(
    (id: string, finished: boolean) =>
      mutate(() => bookLibraryService.markBookFinished(id, finished)),
    [mutate],
  );

  const value = useMemo(
    () => ({
      books,
      loading,
      error,
      selectedBook,
      importProgress,
      refresh,
      chooseAndImportBook,
      cancelImport,
      removeBook,
      prepareBook,
      cancelPreparation,
      clearImportResult,
      reprocessBook,
      updateBookMetadata,
      savePreviewPosition,
      markBookFinished,
    }),
    [
      books,
      cancelImport,
      chooseAndImportBook,
      clearImportResult,
      error,
      importProgress,
      loading,
      refresh,
      removeBook,
      prepareBook,
      cancelPreparation,
      selectedBook,
      reprocessBook,
      updateBookMetadata,
      savePreviewPosition,
      markBookFinished,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) {
    throw new Error('useLibrary must be used inside LibraryProvider');
  }
  return value;
}
