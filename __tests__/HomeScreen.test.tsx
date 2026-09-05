import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/screens/HomeScreen';
import type { Book } from '../src/types/library';

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

const mockBooks: Book[] = [
  {
    id: 'book-reading',
    title: 'Dune',
    author: 'Frank Herbert',
    genre: 'Sci-Fi',
    progress: 45,
    remaining: '4h 12m left',
    parserVersion: 'epub-1',
    lastOpenedAt: '2026-09-04T12:00:00.000Z',
    cover: { background: '#243A35', accent: '#D9A64A', mark: 'D' },
  },
  {
    id: 'book-finished',
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    genre: 'Fantasy',
    progress: 100,
    remaining: 'Finished',
    parserVersion: 'epub-1',
    lastOpenedAt: '2026-09-03T12:00:00.000Z',
    cover: { background: '#536B63', accent: '#E9DED0', mark: 'H' },
  },
];

let mockCurrentBooks: Book[] = mockBooks;

jest.mock('../src/state/LibraryProvider', () => ({
  useLibrary: () => ({
    books: mockCurrentBooks,
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('../src/state/ModelDownloadProvider', () => ({
  useModelDownload: () => ({
    status: {
      state: 'ready',
      message: 'Installed',
      progress: 1,
      downloadedBytes: 547000000,
      totalBytes: 547000000,
    },
  }),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentBooks = mockBooks;
  });

  test('renders Continue Reading hero card and navigates to Reader on resume', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const textNodes = renderer.root.findAllByType('Text' as any);
    const texts = textNodes.map(node => node.props.children).flat().filter(Boolean);

    expect(texts).toContain('AI Book Reader');
    expect(texts).toContain('CURRENTLY READING');
    expect(texts).toContain('Dune');
    expect(texts).toContain('Frank Herbert');
    expect(texts).toContain('Sci-Fi');

    // Find and press Resume button
    const resumeBtn = renderer.root.findByProps({
      accessibilityLabel: 'Resume reading Dune',
    });
    act(() => {
      resumeBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Reader', {
      bookId: 'book-reading',
      mode: 'audiobook',
    });

    // Find and press Read button
    const readBtn = renderer.root.findByProps({
      accessibilityLabel: 'Read Dune',
    });
    act(() => {
      readBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Reader', {
      bookId: 'book-reading',
      mode: 'read',
    });
  });

  test('navigates to ModelSetup when model banner is pressed', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const modelCard = renderer.root.findByProps({
      accessibilityLabel: 'Natural voice model status',
    });
    act(() => {
      modelCard.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('ModelSetup');
  });

  test('renders quick action buttons for Import Book and Library', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const importAction = renderer.root.findByProps({
      accessibilityLabel: 'Import a book',
    });
    act(() => {
      importAction.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ImportBook');

    const libraryAction = renderer.root.findByProps({
      accessibilityLabel: 'Go to library',
    });
    act(() => {
      libraryAction.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Library' });
  });

  test('shows empty state card when there are no books currently being read', () => {
    mockCurrentBooks = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const textNodes = renderer.root.findAllByType('Text' as any);
    const texts = textNodes.map(node => node.props.children).flat().filter(Boolean);

    expect(texts).toContain('Welcome to AI Book Reader');
  });
});
