import React from 'react';
import { Share } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BookmarksScreen } from '../src/screens/BookmarksScreen';
import { annotationsService, type BookAnnotation } from '../src/services/annotations';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
    isDark: false,
    preference: 'system',
  }),
}));

jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/services/annotations', () => ({
  annotationsService: {
    list: jest.fn(),
    remove: jest.fn().mockResolvedValue(true),
    exportToMarkdown: jest.fn().mockResolvedValue('# Saved Passages\nSample'),
  },
}));

jest.spyOn(Share, 'share').mockImplementation(jest.fn().mockResolvedValue({ action: 'sharedAction' }));

const mockAnnotations: BookAnnotation[] = [
  {
    id: 'ann-1',
    bookId: 'book-1',
    bookTitle: 'The Great Gatsby',
    chapterId: 'ch-1',
    chapterTitle: 'Chapter 1',
    sentenceIndex: 5,
    text: 'Reserving judgments is a matter of infinite hope.',
    type: 'bookmark',
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
  },
  {
    id: 'ann-2',
    bookId: 'book-2',
    bookTitle: 'Meditations',
    chapterId: 'ch-2',
    chapterTitle: 'Book II',
    sentenceIndex: 12,
    text: 'You have power over your mind—not outside events.',
    type: 'highlight',
    color: 'yellow',
    createdAt: '2026-09-04T10:05:00.000Z',
    updatedAt: '2026-09-04T10:05:00.000Z',
  },
];

let tree: TestRenderer.ReactTestRenderer;

describe('BookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(annotationsService.list).mockResolvedValue(mockAnnotations);
  });

  afterEach(async () => {
    if (tree) {
      await act(async () => {
        tree.unmount();
      });
    }
  });

  it('renders saved passages from annotationsService', async () => {
    await act(async () => {
      tree = TestRenderer.create(<BookmarksScreen />);
    });

    expect(annotationsService.list).toHaveBeenCalled();
    const str = JSON.stringify(tree.toJSON());
    expect(str).toContain('The Great Gatsby');
    expect(str).toContain('Reserving judgments is a matter of infinite hope.');
  });

  it('navigates to Reader with book and exact sentence when an item is tapped', async () => {
    await act(async () => {
      tree = TestRenderer.create(<BookmarksScreen />);
    });

    const itemCard = tree.root.findByProps({
      accessibilityLabel: 'Open bookmark in The Great Gatsby',
    });

    expect(itemCard).toBeDefined();

    await act(async () => {
      itemCard.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Reader', {
      bookId: 'book-1',
      initialChapterId: 'ch-1',
      initialSentenceIndex: 5,
    });
  });

  it('exports saved passages to markdown and opens share dialog', async () => {
    await act(async () => {
      tree = TestRenderer.create(<BookmarksScreen />);
    });

    const exportBtn = tree.root.findByProps({
      accessibilityLabel: 'Export saved passages',
    });

    expect(exportBtn).toBeDefined();

    await act(async () => {
      exportBtn.props.onPress();
    });

    expect(annotationsService.exportToMarkdown).toHaveBeenCalled();
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '# Saved Passages\nSample',
      }),
    );
  });
});
