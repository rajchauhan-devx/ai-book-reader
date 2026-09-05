import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { StorageScreen } from '../src/screens/StorageScreen';
import { storageBackupService } from '../src/services/storageBackup';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => {
      cb();
    }, []);
  },
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

jest.mock('../src/state/ModelDownloadProvider', () => ({
  useModelDownload: () => ({
    status: {
      state: 'ready',
      progress: 1.0,
      downloadedBytes: 546832384,
      totalBytes: 546832384,
      message: 'Ready',
      supported: true,
      availableBytes: 1000000000,
      memoryBytes: 4000000000,
      packVersion: 'v1',
    },
    removeModel: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../src/services/storageBackup', () => ({
  formatStorage: (b: number) => `${Math.round(b / (1024 * 1024))} MB`,
  storageBackupService: {
    getStorageBreakdown: jest.fn(),
    deleteBookAudio: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/bookLibrary', () => ({
  bookLibraryService: {
    removeBook: jest.fn().mockResolvedValue(true),
  },
}));

describe('StorageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders storage categories and book storage table', async () => {
    (storageBackupService.getStorageBreakdown as jest.Mock).mockResolvedValue({
      modelsBytes: 500 * 1024 * 1024,
      audioBytes: 50 * 1024 * 1024,
      booksBytes: 12 * 1024 * 1024,
      databaseBytes: 2 * 1024 * 1024,
      freeBytes: 10 * 1024 * 1024 * 1024,
      totalBytes: 64 * 1024 * 1024 * 1024,
      books: [
        {
          id: 'b-1',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          format: 'epub',
          sourceSizeBytes: 4 * 1024 * 1024,
          audioSizeBytes: 30 * 1024 * 1024,
          progressPercent: 65,
        },
      ],
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StorageScreen />);
    });

    const root = renderer!.root;
    const textNodes = root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);
    const flattenedText = textNodes.flat(Infinity).join(' ');

    expect(flattenedText).toContain('STORAGE BREAKDOWN');
    expect(flattenedText).toContain('The Great Gatsby');
    expect(flattenedText).toContain('Natural voice model');
    expect(flattenedText).toContain('Storage categories');
  });

  it('renders low storage warning when free space is below threshold', async () => {
    (storageBackupService.getStorageBreakdown as jest.Mock).mockResolvedValue({
      modelsBytes: 500 * 1024 * 1024,
      audioBytes: 50 * 1024 * 1024,
      booksBytes: 12 * 1024 * 1024,
      databaseBytes: 2 * 1024 * 1024,
      freeBytes: 100 * 1024 * 1024, // 100 MB < 250 MB
      totalBytes: 64 * 1024 * 1024 * 1024,
      books: [],
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StorageScreen />);
    });

    const root = renderer!.root;
    const textNodes = root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);
    const flattenedText = textNodes.flat(Infinity).join(' ');

    expect(flattenedText).toContain('Low storage');
  });

  it('prompts confirmation when clearing audio for a book', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (storageBackupService.getStorageBreakdown as jest.Mock).mockResolvedValue({
      modelsBytes: 0,
      audioBytes: 30 * 1024 * 1024,
      booksBytes: 4 * 1024 * 1024,
      databaseBytes: 1 * 1024 * 1024,
      freeBytes: 10 * 1024 * 1024 * 1024,
      totalBytes: 64 * 1024 * 1024 * 1024,
      books: [
        {
          id: 'b-1',
          title: 'The Great Gatsby',
          author: 'F. Scott Fitzgerald',
          format: 'epub',
          sourceSizeBytes: 4 * 1024 * 1024,
          audioSizeBytes: 30 * 1024 * 1024,
          progressPercent: 65,
        },
      ],
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StorageScreen />);
    });

    // Find "Clear audio" button
    const button = renderer!.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === 'Clear narration for The Great Gatsby' &&
        typeof node.props.onPress === 'function',
    )[0];
    expect(button).toBeDefined();

    act(() => {
      button.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Clear Narration Audio?',
      expect.stringContaining('The Great Gatsby'),
      expect.any(Array),
    );
  });
});
