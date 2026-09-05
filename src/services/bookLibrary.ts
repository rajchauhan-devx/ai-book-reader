import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import type {
  BookImportService,
  BookPreparationService,
  LibraryRepository,
  ReadingPosition,
} from './contracts';
import type {
  Book,
  BookChapter,
  ChapterPage,
  BookFormat,
  BookImportState,
  BookSelection,
  ImportedBook,
} from '../types/library';

export const BOOK_IMPORT_EVENT = 'BookImportProgress';
export const MAX_BOOK_BYTES = 250 * 1024 * 1024;

export type BookImportPhase =
  | 'idle'
  | 'choosing'
  | 'copying'
  | 'checking'
  | 'cancelling'
  | 'complete'
  | 'cancelled'
  | 'failed';

export type BookImportProgress = {
  phase: BookImportPhase;
  progress: number;
  copiedBytes: number;
  totalBytes: number;
  message: string;
};

type NativeBookLibrary = {
  reprocessBook(bookId: string): Promise<unknown>;
  updateBookMetadata(
    bookId: string,
    title: string,
    author: string,
    genre: string,
    coverChoice: number,
  ): Promise<unknown>;
  savePreviewPosition(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<unknown>;
  markBookFinished(bookId: string, finished: boolean): Promise<unknown>;
  chooseBook(): Promise<unknown | null>;
  importBook(uri: string): Promise<unknown>;
  cancelImport(): Promise<boolean>;
  listBooks(): Promise<unknown>;
  getBook(bookId: string): Promise<unknown | null>;
  removeBook(bookId: string): Promise<boolean>;
  getReadingPosition(bookId: string): Promise<unknown | null>;
  saveReadingPosition(position: ReadingPosition): Promise<unknown>;
  prepareBook(bookId: string): Promise<unknown>;
  cancelPreparation(bookId: string): Promise<unknown | null>;
  listChapters(bookId: string): Promise<unknown>;
  getChapterPage(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<unknown>;
  updateSentencesBatch(
    updates: Array<{ id: string; normalizedText: string }>,
  ): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeLibrary = NativeModules.BookLibrary as
  | NativeBookLibrary
  | undefined;

const formats = new Set<BookFormat>(['epub', 'pdf', 'txt']);
const importStates = new Set<BookImportState>([
  'pending_parse',
  'queued',
  'parsing',
  'ready',
  'failed',
]);
const importPhases = new Set<BookImportPhase>([
  'idle',
  'choosing',
  'copying',
  'checking',
  'cancelling',
  'complete',
  'cancelled',
  'failed',
]);
export const coverPalettes = [
  { background: '#315C4C', accent: '#F5E5C7' },
  { background: '#705A76', accent: '#F0D69D' },
  { background: '#8B5548', accent: '#F1D7B2' },
  { background: '#40566D', accent: '#DCE8E1' },
  { background: '#665E45', accent: '#F5E5C7' },
];

const stringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const numberValue = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const dateValue = (value: unknown): string | undefined => {
  const timestamp = numberValue(value, 0);
  return timestamp > 0 && timestamp <= 8.64e15
    ? new Date(timestamp).toISOString()
    : undefined;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The Android library returned an invalid result.');
  }
  return value as Record<string, unknown>;
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'B';
  return words
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');
}

function coverFor(id: string, title: string) {
  const index =
    [...id].reduce((value, character) => {
      return (value * 31 + character.charCodeAt(0)) % 2_147_483_647;
    }, 7) % coverPalettes.length;
  return { ...coverPalettes[index], mark: initials(title) };
}

export function normalizeImportedBook(value: unknown): ImportedBook {
  const record = asRecord(value);
  const id = stringValue(record.id);
  if (!id)
    throw new Error('The Android library returned a book without an ID.');
  const title = stringValue(record.title, 'Untitled book');
  const format = formats.has(record.format as BookFormat)
    ? (record.format as BookFormat)
    : 'txt';
  const importState = importStates.has(record.importState as BookImportState)
    ? (record.importState as BookImportState)
    : 'failed';
  const progress = Math.min(
    100,
    Math.max(0, numberValue(record.progressPercent, 0)),
  );

  return {
    id,
    title,
    author: stringValue(record.author, 'Unknown author'),
    genre: stringValue(record.genre, 'Uncategorized'),
    progress,
    remaining:
      importState === 'ready'
        ? progress > 0
          ? `${progress}% complete`
          : 'Text ready · preview available'
        : importState === 'failed'
        ? 'Import needs attention'
        : importState === 'parsing' || importState === 'queued'
        ? 'Preparing text'
        : 'Ready to prepare',
    cover: {
      ...coverFor(id, title),
      ...(coverPalettes[numberValue(record.coverChoice, -1)] ?? {}),
      imageUri:
        numberValue(record.coverChoice, -1) === -1
          ? stringValue(record.coverImageUri) || undefined
          : undefined,
    },
    coverChoice: numberValue(record.coverChoice, -1),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter(
          (warning): warning is string => typeof warning === 'string',
        )
      : [],
    previewChapterId: stringValue(record.previewChapterId) || undefined,
    previewBlockOffset: Math.max(
      0,
      Math.floor(numberValue(record.previewBlockOffset)),
    ),
    format,
    mimeType: stringValue(record.mimeType, 'application/octet-stream'),
    sourceFileName: stringValue(record.sourceFileName, title),
    sourceSizeBytes: Math.max(0, numberValue(record.sourceSizeBytes, 0)),
    importState,
    parserVersion: stringValue(record.parserVersion) || undefined,
    preparationProgress: Math.min(
      100,
      Math.max(0, numberValue(record.preparationProgress)),
    ),
    preparationMessage: stringValue(record.preparationMessage) || undefined,
    failureCode: stringValue(record.failureCode) || undefined,
    failureMessage: stringValue(record.failureMessage) || undefined,
    createdAt: dateValue(record.createdAt),
    updatedAt: dateValue(record.updatedAt),
    lastOpenedAt: dateValue(record.lastOpenedAt),
    duplicate: record.duplicate === true,
  };
}

export function normalizeBookSelection(value: unknown): BookSelection {
  const record = asRecord(value);
  return {
    uri: stringValue(record.uri),
    name: stringValue(record.name, 'Untitled book'),
    size: Math.max(0, numberValue(record.size, 0)),
    mimeType: stringValue(record.mimeType, 'application/octet-stream'),
  };
}

export function normalizeBookImportProgress(
  value: unknown,
): BookImportProgress {
  const record = asRecord(value);
  return {
    phase: importPhases.has(record.phase as BookImportPhase)
      ? (record.phase as BookImportPhase)
      : 'failed',
    progress: Math.min(1, Math.max(0, numberValue(record.progress, 0))),
    copiedBytes: Math.max(0, numberValue(record.copiedBytes, 0)),
    totalBytes: Math.max(0, numberValue(record.totalBytes, 0)),
    message: stringValue(record.message, 'Working on your book'),
  };
}

export function formatBookBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function requireNativeLibrary(): NativeBookLibrary {
  if (!nativeLibrary) {
    throw new Error(
      'Book import is unavailable in this build. Rebuild and install the Android app.',
    );
  }
  return nativeLibrary;
}

export const bookLibraryService = {
  async reprocessBook(bookId: string): Promise<ImportedBook> {
    return normalizeImportedBook(
      await requirePreparationLibrary().reprocessBook(bookId),
    );
  },
  async updateBookMetadata(
    bookId: string,
    title: string,
    author: string,
    genreOrCover: string | number = 'Uncategorized',
    coverChoice: number = -1,
  ): Promise<ImportedBook> {
    const genre =
      typeof genreOrCover === 'string' ? genreOrCover : 'Uncategorized';
    const cover =
      typeof genreOrCover === 'number' ? genreOrCover : coverChoice;
    return normalizeImportedBook(
      await requirePreparationLibrary().updateBookMetadata(
        bookId,
        title,
        author,
        genre || 'Uncategorized',
        cover,
      ),
    );
  },
  async savePreviewPosition(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<ImportedBook> {
    return normalizeImportedBook(
      await requirePreparationLibrary().savePreviewPosition(
        bookId,
        chapterId,
        offset,
      ),
    );
  },
  async markBookFinished(
    bookId: string,
    finished: boolean,
  ): Promise<ImportedBook> {
    return normalizeImportedBook(
      await requirePreparationLibrary().markBookFinished(bookId, finished),
    );
  },
  async prepareBook(bookId: string): Promise<ImportedBook> {
    return normalizeImportedBook(
      await requirePreparationLibrary().prepareBook(bookId),
    );
  },

  async cancelPreparation(bookId: string): Promise<ImportedBook | null> {
    const result = await requirePreparationLibrary().cancelPreparation(bookId);
    return result ? normalizeImportedBook(result) : null;
  },

  async listChapters(bookId: string): Promise<BookChapter[]> {
    const result = await requirePreparationLibrary().listChapters(bookId);
    if (!Array.isArray(result))
      throw new Error('The chapter list could not be loaded.');
    return result.map(value => {
      const record = asRecord(value);
      const id = stringValue(record.id);
      if (!id) throw new Error('A chapter is missing its ID.');
      return {
        id,
        title: stringValue(record.title, 'Untitled chapter'),
        ordinal: Math.max(0, numberValue(record.ordinal)),
        sourceAnchor: stringValue(record.sourceAnchor),
      };
    });
  },

  async getChapterPage(
    bookId: string,
    chapterId: string,
    offset: number,
  ): Promise<ChapterPage> {
    return normalizeChapterPage(
      await requirePreparationLibrary().getChapterPage(
        bookId,
        chapterId,
        offset,
      ),
    );
  },
  async updateSentencesBatch(
    updates: Array<{ id: string; normalizedText: string }>,
  ): Promise<boolean> {
    if (!nativeLibrary?.updateSentencesBatch || updates.length === 0) {
      return false;
    }
    try {
      await nativeLibrary.updateSentencesBatch(updates);
      return true;
    } catch {
      return false;
    }
  },
  async chooseBook(): Promise<BookSelection | null> {
    const result = await requireNativeLibrary().chooseBook();
    return result ? normalizeBookSelection(result) : null;
  },

  async importBook(uri: string): Promise<ImportedBook> {
    return normalizeImportedBook(await requireNativeLibrary().importBook(uri));
  },

  async cancelImport(): Promise<void> {
    await requireNativeLibrary().cancelImport();
  },

  async listBooks(): Promise<Book[]> {
    if (!nativeLibrary) return [];
    const result = await nativeLibrary.listBooks();
    if (!Array.isArray(result)) {
      throw new Error('The Android library returned an invalid book list.');
    }
    return result.map(normalizeImportedBook);
  },

  async getBook(bookId: string): Promise<Book | null> {
    if (!nativeLibrary) return null;
    const result = await nativeLibrary.getBook(bookId);
    return result ? normalizeImportedBook(result) : null;
  },

  async removeBook(bookId: string): Promise<void> {
    await requireNativeLibrary().removeBook(bookId);
  },

  async getReadingPosition(bookId: string): Promise<ReadingPosition | null> {
    if (!nativeLibrary) return null;
    const result = await nativeLibrary.getReadingPosition(bookId);
    if (!result) return null;
    const record = asRecord(result);
    return {
      bookId: stringValue(record.bookId),
      chapterId: stringValue(record.chapterId),
      sentenceIndex: Math.max(0, numberValue(record.sentenceIndex, 0)),
      audioOffsetMs: Math.max(0, numberValue(record.audioOffsetMs, 0)),
      updatedAt: dateValue(record.updatedAt) ?? new Date(0).toISOString(),
    };
  },

  async saveReadingPosition(
    position: ReadingPosition,
  ): Promise<ReadingPosition> {
    const result = await requireNativeLibrary().saveReadingPosition(position);
    const record = asRecord(result);
    return {
      bookId: stringValue(record.bookId),
      chapterId: stringValue(record.chapterId),
      sentenceIndex: Math.max(0, numberValue(record.sentenceIndex, 0)),
      audioOffsetMs: Math.max(0, numberValue(record.audioOffsetMs, 0)),
      updatedAt: dateValue(record.updatedAt) ?? new Date().toISOString(),
    };
  },

  subscribe(listener: (progress: BookImportProgress) => void): () => void {
    if (!nativeLibrary) return () => undefined;
    const emitter = new NativeEventEmitter(nativeLibrary);
    const subscription: EmitterSubscription = emitter.addListener(
      BOOK_IMPORT_EVENT,
      value => listener(normalizeBookImportProgress(value)),
    );
    return () => subscription.remove();
  },
} satisfies LibraryRepository &
  BookImportService &
  BookPreparationService & {
    subscribe(listener: (progress: BookImportProgress) => void): () => void;
  };

function requirePreparationLibrary(): NativeBookLibrary {
  const library = requireNativeLibrary();
  if (
    typeof library.prepareBook !== 'function' ||
    typeof library.getChapterPage !== 'function'
  ) {
    throw new Error(
      'Install the updated Android app to enable text preparation. Your books and voice pack can stay installed.',
    );
  }
  return library;
}

export function normalizeChapterPage(value: unknown): ChapterPage {
  const record = asRecord(value);
  if (!stringValue(record.chapterId) || !Array.isArray(record.blocks)) {
    throw new Error('The prepared text returned an invalid page.');
  }
  const offset = Math.max(0, Math.floor(numberValue(record.offset)));
  const totalBlocks = Math.max(0, Math.floor(numberValue(record.totalBlocks)));
  const totalSentences = Math.max(
    0,
    Math.floor(numberValue(record.totalSentences)),
  );
  const next = numberValue(record.nextOffset, -1);
  return {
    chapterId: stringValue(record.chapterId),
    chapterTitle: stringValue(record.chapterTitle),
    offset,
    totalBlocks,
    totalSentences,
    nextOffset:
      Number.isInteger(next) && next > offset && next < totalBlocks
        ? next
        : null,
    blocks: record.blocks.map(valueBlock => {
      const block = asRecord(valueBlock);
      if (!stringValue(block.id) || typeof block.text !== 'string')
        throw new Error('A text block could not be loaded.');
      const sentenceStartIndex = Math.max(
        0,
        Math.floor(
          numberValue(block.sentenceStartIndex, numberValue(block.ordinal, 0)),
        ),
      );
      const sentences = Array.isArray(block.sentences)
        ? block.sentences.map((valueSentence, sentenceOffset) => {
            const sentence = asRecord(valueSentence);
            const text = stringValue(sentence.text);
            if (!stringValue(sentence.id) || !text)
              throw new Error('A sentence could not be loaded.');
            return {
              id: stringValue(sentence.id),
              text,
              normalizedText: stringValue(sentence.normalizedText, text),
              ordinal: Math.max(0, numberValue(sentence.ordinal, sentenceOffset)),
              index: Math.max(
                0,
                numberValue(
                  sentence.index,
                  sentenceStartIndex + sentenceOffset,
                ),
              ),
              sourceAnchor: stringValue(sentence.sourceAnchor),
            };
          })
        : [
            {
              id: stringValue(block.id),
              text: block.text,
              normalizedText: block.text,
              ordinal: 0,
              index: sentenceStartIndex,
              sourceAnchor: stringValue(block.sourceAnchor),
            },
          ];
      return {
        id: stringValue(block.id),
        text: block.text,
        kind: stringValue(block.kind, 'paragraph'),
        ordinal: Math.max(0, numberValue(block.ordinal)),
        sourceAnchor: stringValue(block.sourceAnchor),
        sentenceStartIndex,
        sentences,
      };
    }),
  };
}
