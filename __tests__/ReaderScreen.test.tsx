import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ReaderScreen } from '../src/screens/ReaderScreen';
import { bookLibraryService } from '../src/services/bookLibrary';
import type { Book, ChapterPage } from '../src/types/library';

let mockRouteParams: {
  bookId: string;
  initialChapterId?: string;
  initialSentenceIndex?: number;
} = { bookId: 'test-book' };

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
    isDark: false,
    preference: 'system',
    setPreference: jest.fn(),
  }),
}));

jest.mock('../src/state/NarrationPlayerProvider', () => ({
  useNarrationPlayer: () => ({
    playerState: {
      state: 'idle',
      bookId: null,
      chapterId: null,
      bookTitle: null,
      chapterTitle: null,
      sentenceIndex: 0,
      totalSentences: 0,
      positionMs: 0,
      durationMs: 0,
      speed: 1.0,
      sleepTimerSecondsRemaining: 0,
      isSleepTimerActive: false,
      sleepTimerEndOfChapter: false,
    },
    isPlaying: false,
    isBuffering: false,
    play: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
    seekSentence: jest.fn(),
    nextSentence: jest.fn(),
    prevSentence: jest.fn(),
    skipTime: jest.fn(),
    setSpeed: jest.fn(),
    setSleepTimer: jest.fn(),
  }),
}));

jest.mock('../src/services/bookLibrary', () => ({
  bookLibraryService: {
    getBook: jest.fn(),
    listChapters: jest.fn(),
    getChapterPage: jest.fn(),
    getReadingPosition: jest.fn(),
    saveReadingPosition: jest.fn().mockResolvedValue(undefined),
    savePreviewPosition: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/annotations', () => ({
  annotationsService: {
    list: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue({ id: 'ann-1' }),
    update: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/readerPreferences', () => ({
  defaultReaderPreferences: { fontFamily: 'serif', fontSize: 20, lineHeight: 1.7 },
  readerPreferencesRepository: {
    get: jest.fn().mockResolvedValue({ fontFamily: 'serif', fontSize: 20, lineHeight: 1.7 }),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockBook: Book = {
  id: 'test-book',
  title: 'Test Book Title',
  author: 'Test Author',
  progress: 10,
  remaining: '',
  cover: { background: '#FFF', accent: '#000', mark: 'T' },
};

const mockChapters = [
  { id: 'ch-1', title: 'Chapter 1: The Beginning', ordinal: 0, sourceAnchor: 'c1' },
  { id: 'ch-2', title: 'Chapter 2: The Journey', ordinal: 1, sourceAnchor: 'c2' },
];

const mockPage: ChapterPage = {
  chapterId: 'ch-1',
  chapterTitle: 'Chapter 1: The Beginning',
  offset: 0,
  totalBlocks: 10,
  totalSentences: 5,
  nextOffset: 5,
  blocks: [
    {
      id: 'b-1',
      text: 'First paragraph sentence one. First paragraph sentence two.',
      kind: 'paragraph',
      ordinal: 0,
      sourceAnchor: 'p0',
      sentenceStartIndex: 0,
      sentences: [
        {
          id: 's-0',
          text: 'First paragraph sentence one.',
          normalizedText: 'First paragraph sentence one.',
          ordinal: 0,
          index: 0,
          sourceAnchor: 's0',
        },
        {
          id: 's-1',
          text: 'First paragraph sentence two.',
          normalizedText: 'First paragraph sentence two.',
          ordinal: 1,
          index: 1,
          sourceAnchor: 's1',
        },
      ],
    },
  ],
};

let tree: TestRenderer.ReactTestRenderer;

describe('ReaderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { bookId: 'test-book' };
    jest.mocked(bookLibraryService.getBook).mockResolvedValue(mockBook);
    jest.mocked(bookLibraryService.listChapters).mockResolvedValue(mockChapters);
    jest.mocked(bookLibraryService.getChapterPage).mockResolvedValue(mockPage);
    jest.mocked(bookLibraryService.getReadingPosition).mockResolvedValue(null);
  });

  afterEach(async () => {
    if (tree) {
      await act(async () => {
        tree.unmount();
      });
    }
  });

  it('loads book chapters and first chapter page by default', async () => {
    await act(async () => {
      tree = TestRenderer.create(<ReaderScreen />);
    });

    expect(bookLibraryService.getBook).toHaveBeenCalledWith('test-book');
    expect(bookLibraryService.listChapters).toHaveBeenCalledWith('test-book');
    expect(bookLibraryService.getChapterPage).toHaveBeenCalledWith('test-book', 'ch-1', 0);
  });

  it('restores saved reading position when available', async () => {
    jest.mocked(bookLibraryService.getReadingPosition).mockResolvedValueOnce({
      bookId: 'test-book',
      chapterId: 'ch-2',
      sentenceIndex: 12,
      audioOffsetMs: 0,
      updatedAt: '2026-09-04T10:00:00.000Z',
    });

    await act(async () => {
      tree = TestRenderer.create(<ReaderScreen />);
    });

    expect(bookLibraryService.getChapterPage).toHaveBeenCalledWith('test-book', 'ch-2', 0);
  });

  it('restores exact initialChapterId and initialSentenceIndex from route params', async () => {
    mockRouteParams = {
      bookId: 'test-book',
      initialChapterId: 'ch-2',
      initialSentenceIndex: 25,
    };

    await act(async () => {
      tree = TestRenderer.create(<ReaderScreen />);
    });

    expect(bookLibraryService.getChapterPage).toHaveBeenCalledWith('test-book', 'ch-2', 24);
  });

  it('saves reading position on sentence tap', async () => {
    await act(async () => {
      tree = TestRenderer.create(<ReaderScreen />);
    });

    // Find sentence text element and trigger press
    const texts = tree.root.findAllByType('Text' as any);
    const sentenceText = texts.find(t =>
      t.props.children && String(t.props.children).includes('First paragraph sentence two.')
    );

    expect(sentenceText).toBeDefined();

    if (sentenceText && sentenceText.props.onPress) {
      await act(async () => {
        sentenceText.props.onPress();
      });

      expect(bookLibraryService.saveReadingPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: 'test-book',
          chapterId: 'ch-1',
          sentenceIndex: 1,
        }),
      );
    }
  });
});
