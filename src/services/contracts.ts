import type {
  Book,
  BookChapter,
  BookSelection,
  ChapterPage,
  ImportedBook,
} from '../types/library';
import type { ThemePreference } from '../theme/tokens';

export type ModelPackState =
  | 'not-installed'
  | 'checking'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'ready'
  | 'failed'
  | 'unsupported';

export type ModelPack = {
  id: string;
  version: string;
  language: string;
  downloadBytes: number;
  installedBytes: number;
  state: ModelPackState;
  progress: number;
};

export type ReadingPosition = {
  bookId: string;
  chapterId: string;
  sentenceIndex: number;
  audioOffsetMs: number;
  updatedAt: string;
};

export interface PreferencesRepository {
  getTheme(): Promise<ThemePreference>;
  setTheme(theme: ThemePreference): Promise<void>;
  hasCompletedOnboarding(): Promise<boolean>;
  completeOnboarding(): Promise<void>;
}

export interface LibraryRepository {
  listBooks(): Promise<Book[]>;
  getBook(bookId: string): Promise<Book | null>;
  removeBook(bookId: string): Promise<void>;
  getReadingPosition(bookId: string): Promise<ReadingPosition | null>;
  saveReadingPosition(position: ReadingPosition): Promise<ReadingPosition>;
}

export interface ModelManager {
  getInstalledPack(): Promise<ModelPack | null>;
  checkCompatibility(): Promise<{ supported: boolean; reason?: string }>;
  install(packId: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  remove(): Promise<void>;
}

export interface BookImportService {
  chooseBook(): Promise<BookSelection | null>;
  importBook(uri: string): Promise<ImportedBook>;
  cancelImport(): Promise<void>;
}

export interface BookPreparationService {
  reprocessBook(bookId: string): Promise<ImportedBook>;
  updateBookMetadata(
    bookId: string,
    title: string,
    author: string,
    genreOrCover?: string | number,
    coverChoice?: number,
  ): Promise<ImportedBook>;
  savePreviewPosition(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<ImportedBook>;
  markBookFinished(bookId: string, finished: boolean): Promise<ImportedBook>;
  prepareBook(bookId: string): Promise<ImportedBook>;
  cancelPreparation(bookId: string): Promise<ImportedBook | null>;
  listChapters(bookId: string): Promise<BookChapter[]>;
  getChapterPage(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<ChapterPage>;
}

export interface NarrationService {
  prepare(bookId: string, chapterId: string): Promise<void>;
  cancel(bookId: string): Promise<void>;
  removeGeneratedAudio(bookId?: string): Promise<void>;
}
