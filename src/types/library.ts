export type BookFormat = 'epub' | 'pdf' | 'txt';

export type BookImportState =
  | 'pending_parse'
  | 'queued'
  | 'parsing'
  | 'ready'
  | 'failed';

export type Book = {
  id: string;
  title: string;
  author: string;
  genre?: string;
  progress: number;
  remaining: string;
  cover: {
    background: string;
    accent: string;
    mark: string;
    imageUri?: string;
  };
  format?: BookFormat;
  mimeType?: string;
  sourceFileName?: string;
  sourceSizeBytes?: number;
  importState?: BookImportState;
  failureCode?: string;
  failureMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  isSample?: boolean;
  parserVersion?: string;
  preparationProgress?: number;
  preparationMessage?: string;
  coverChoice?: number;
  warnings?: string[];
  previewChapterId?: string;
  previewBlockOffset?: number;
};

export type BookChapter = {
  id: string;
  title: string;
  ordinal: number;
  sourceAnchor: string;
};

export type ChapterPage = {
  chapterId: string;
  chapterTitle: string;
  offset: number;
  totalBlocks: number;
  totalSentences: number;
  nextOffset: number | null;
  blocks: {
    id: string;
    text: string;
    kind: string;
    ordinal: number;
    sourceAnchor: string;
    sentenceStartIndex: number;
    sentences: ReaderSentence[];
  }[];
};

export type ReaderSentence = {
  id: string;
  text: string;
  normalizedText: string;
  ordinal: number;
  index: number;
  sourceAnchor: string;
};

export type BookSelection = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
};

export type ImportedBook = Book & {
  format: BookFormat;
  sourceFileName: string;
  sourceSizeBytes: number;
  importState: BookImportState;
  duplicate: boolean;
};
