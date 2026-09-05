import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextPreviewScreen } from '../src/screens/TextPreviewScreen';
import { bookLibraryService } from '../src/services/bookLibrary';
import type { Book, ChapterPage } from '../src/types/library';

let mockBookId = 'book-a';
const mockSave = jest.fn().mockResolvedValue(undefined);
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { bookId: mockBookId } }),
}));
jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({ colors: require('../src/theme/tokens').lightColors }),
}));
jest.mock('../src/state/LibraryProvider', () => ({
  useLibrary: () => ({ savePreviewPosition: mockSave }),
}));
jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/services/bookLibrary', () => ({
  bookLibraryService: {
    listChapters: jest.fn(),
    getBook: jest.fn(),
    getChapterPage: jest.fn(),
  },
}));
const service = jest.mocked(bookLibraryService);
const page: ChapterPage = {
  chapterId: 'second',
  chapterTitle: 'Second',
  offset: 24,
  totalBlocks: 26,
  totalSentences: 1,
  nextOffset: null,
  blocks: [
    {
      id: 'block25',
      text: 'Saved paragraph.',
      ordinal: 24,
      kind: 'paragraph',
      sourceAnchor: 'p:24',
      sentenceStartIndex: 0,
      sentences: [],
    },
  ],
};
const book: Book = {
  id: 'book-a',
  title: 'A',
  author: 'Author',
  progress: 50,
  remaining: '',
  cover: { background: '', accent: '', mark: '' },
  previewChapterId: 'second',
  previewBlockOffset: 24,
};
let tree: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockBookId = 'book-a';
  service.listChapters.mockResolvedValue([
    { id: 'first', title: 'First', ordinal: 0, sourceAnchor: '1' },
    { id: 'second', title: 'Second', ordinal: 1, sourceAnchor: '2' },
  ]);
  service.getBook.mockResolvedValue(book);
  service.getChapterPage.mockResolvedValue(page);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
test('restores the saved chapter and page without first overwriting them', async () => {
  await act(async () => {
    tree = TestRenderer.create(<TextPreviewScreen />);
  });
  expect(service.getChapterPage).toHaveBeenCalledTimes(1);
  expect(service.getChapterPage).toHaveBeenCalledWith('book-a', 'second', 24);
  expect(mockSave).toHaveBeenCalledWith('book-a', 'second', 24);
});
test('failed pages do not save a new reading location', async () => {
  service.getChapterPage.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => {
    tree = TestRenderer.create(<TextPreviewScreen />);
  });
  expect(mockSave).not.toHaveBeenCalled();
});
test('changing books resets the preview state and loads that books location', async () => {
  await act(async () => {
    tree = TestRenderer.create(<TextPreviewScreen />);
  });
  mockBookId = 'book-b';
  service.getBook.mockResolvedValue({
    ...book,
    id: 'book-b',
    previewChapterId: 'first',
    previewBlockOffset: 0,
  });
  service.getChapterPage.mockResolvedValue({
    ...page,
    chapterId: 'first',
    offset: 0,
  });
  await act(async () => {
    tree.update(<TextPreviewScreen />);
  });
  expect(service.getChapterPage).toHaveBeenLastCalledWith('book-b', 'first', 0);
  expect(mockSave).toHaveBeenLastCalledWith('book-b', 'first', 0);
});
