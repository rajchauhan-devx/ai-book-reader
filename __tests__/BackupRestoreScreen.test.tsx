import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { BackupRestoreScreen } from '../src/screens/BackupRestoreScreen';
import { storageBackupService } from '../src/services/storageBackup';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
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

jest.mock('../src/services/storageBackup', () => ({
  storageBackupService: {
    getStorageBreakdown: jest.fn().mockResolvedValue({
      modelsBytes: 0,
      audioBytes: 0,
      booksBytes: 1000,
      databaseBytes: 500,
      freeBytes: 10000000,
      totalBytes: 50000000,
      books: [{ id: 'b-1', title: 'Test Book' }],
    }),
    exportBackup: jest.fn().mockResolvedValue({
      filePath: '/mock/backup.zip',
      uri: 'file:///mock/backup.zip',
      sizeBytes: 1024 * 1024 * 2,
      bookCount: 1,
    }),
    previewBackup: jest.fn().mockResolvedValue({
      version: 1,
      appVersion: '0.0.1',
      createdAt: '2026-09-04T12:00:00.000Z',
      bookCount: 2,
      hasAudio: false,
      totalSizeBytes: 1024 * 1024 * 4,
      conflicts: ['Test Book'],
    }),
    restoreBackup: jest.fn().mockResolvedValue({
      restoredBooks: 2,
      annotationsRestored: 5,
      preferencesRestored: true,
    }),
  },
}));

jest.mock('../src/services/annotations', () => ({
  annotationsService: {
    list: jest.fn().mockResolvedValue([
      { id: 'ann-1', bookId: 'b-1', text: 'Note 1', type: 'bookmark' },
    ]),
  },
}));

describe('BackupRestoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders overview, export options, and restore input', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BackupRestoreScreen />);
    });

    const root = renderer!.root;
    const textNodes = root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);
    const flattenedText = textNodes.flat(Infinity).join(' ');

    expect(flattenedText).toContain('Private Backup & Restore');
    expect(flattenedText).toContain('Export backup');
    expect(flattenedText).toContain('Include speech audio');
    expect(flattenedText).toContain('Restore backup');
  });

  it('exports backup on button press and notifies user', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BackupRestoreScreen />);
    });

    const exportButtons = renderer!.root.findAll(
      node => node.props.label === 'Export private backup (.aireader.zip)',
    );
    expect(exportButtons.length).toBe(1);

    await act(async () => {
      exportButtons[0].props.onPress();
    });

    expect(storageBackupService.exportBackup).toHaveBeenCalledWith(false);
    expect(alertSpy).toHaveBeenCalledWith(
      'Backup Created',
      expect.stringContaining('Successfully exported 1 book(s)'),
    );
  });

  it('inspects backup file and displays preview verification details', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<BackupRestoreScreen />);
    });

    const textInput = renderer!.root.findByProps({
      accessibilityLabel: 'Backup file path input',
    });

    act(() => {
      textInput.props.onChangeText('/storage/emulated/0/Download/my-backup.zip');
    });

    const previewButton = renderer!.root.findByProps({
      label: 'Preview backup contents',
    });

    await act(async () => {
      previewButton.props.onPress();
    });

    expect(storageBackupService.previewBackup).toHaveBeenCalledWith(
      '/storage/emulated/0/Download/my-backup.zip',
    );

    const textNodes = renderer!.root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);
    const flattenedText = textNodes.flat(Infinity).join(' ');
    expect(flattenedText).toContain('Backup Verified');
    expect(flattenedText).toMatch(/Books in backup:\s*2/);
    expect(flattenedText).toMatch(/1\s+book\(s\) already exist in your library/);
  });
});
