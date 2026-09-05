import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageBackupService } from '../src/services/storageBackup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/annotations', () => ({
  annotationsService: {
    list: jest.fn().mockResolvedValue([
      { id: 'ann-1', bookId: 'b-1', text: 'Important quote', type: 'bookmark' },
    ]),
    add: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/preferences', () => ({
  preferencesRepository: {
    getTheme: jest.fn().mockResolvedValue('system'),
    setTheme: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/readerPreferences', () => ({
  readerPreferencesRepository: {
    get: jest.fn().mockResolvedValue({
      fontFamily: 'serif',
      fontSize: 20,
      lineHeight: 1.7,
    }),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/modelDownload', () => ({
  modelDownloadService: {
    getStatus: jest.fn().mockResolvedValue({
      state: 'ready',
      progress: 1.0,
      downloadedBytes: 546832384,
      totalBytes: 546832384,
      message: 'Ready',
      supported: true,
      availableBytes: 10000000000,
      memoryBytes: 4000000000,
      packVersion: 'v1',
    }),
  },
}));

jest.mock('../src/services/narrationEngine', () => ({
  narrationEngineService: {
    getStatus: jest.fn().mockResolvedValue({
      engine: 'chatterbox-nano',
      performanceMode: 'balanced',
      running: false,
      state: 'ready',
    }),
  },
}));

describe('storageBackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStorageBreakdown', () => {
    it('returns structured storage metrics from native module when available', async () => {
      const mockBreakdown = {
        modelsBytes: 500000000,
        audioBytes: 15000000,
        booksBytes: 8000000,
        databaseBytes: 200000,
        freeBytes: 12000000000,
        totalBytes: 64000000000,
        books: [
          {
            id: 'book-1',
            title: 'Mock Book',
            author: 'Author',
            format: 'epub',
            sourceSizeBytes: 8000000,
            audioSizeBytes: 15000000,
            progressPercent: 50,
          },
        ],
      };

      NativeModules.StorageBackup = {
        getStorageBreakdown: jest.fn().mockResolvedValue(mockBreakdown),
      };

      const result = await storageBackupService.getStorageBreakdown();
      expect(result.modelsBytes).toBe(500000000);
      expect(result.audioBytes).toBe(15000000);
      expect(result.books.length).toBe(1);
      expect(result.books[0].title).toBe('Mock Book');
    });

    it('returns sensible fallback metrics when NativeModules.StorageBackup is undefined', async () => {
      delete (NativeModules as any).StorageBackup;

      const result = await storageBackupService.getStorageBreakdown();
      expect(result.totalBytes).toBeGreaterThan(0);
      expect(result.freeBytes).toBeGreaterThan(0);
      expect(Array.isArray(result.books)).toBe(true);
    });
  });

  describe('exportBackup', () => {
    it('serializes annotations and preferences and calls native export', async () => {
      const mockExport = jest.fn().mockResolvedValue({
        filePath: '/cache/backups/test.zip',
        uri: 'content://com.aireader.fileprovider/test.zip',
        sizeBytes: 1024000,
        bookCount: 2,
      });

      NativeModules.StorageBackup = {
        exportBackup: mockExport,
      };

      const result = await storageBackupService.exportBackup(true);
      expect(mockExport).toHaveBeenCalledTimes(1);
      const [includeAudio, annotationsJson, preferencesJson] = mockExport.mock.calls[0];

      expect(includeAudio).toBe(true);
      expect(JSON.parse(annotationsJson)).toEqual(expect.any(Array));
      const parsedPrefs = JSON.parse(preferencesJson);
      expect(parsedPrefs.theme).toBeDefined();
      expect(parsedPrefs.readerPreferences).toBeDefined();
      expect(result.bookCount).toBe(2);
    });
  });

  describe('previewBackup', () => {
    it('calls native preview and normalizes response', async () => {
      const mockPreview = jest.fn().mockResolvedValue({
        version: 1,
        appVersion: '0.0.1',
        createdAt: '2026-09-04T12:00:00Z',
        bookCount: 3,
        hasAudio: true,
        totalSizeBytes: 15000000,
        conflicts: ['Existing Book'],
      });

      NativeModules.StorageBackup = {
        previewBackup: mockPreview,
      };

      const preview = await storageBackupService.previewBackup('content://test.zip');
      expect(preview.bookCount).toBe(3);
      expect(preview.hasAudio).toBe(true);
      expect(preview.conflicts).toEqual(['Existing Book']);
    });
  });

  describe('restoreBackup', () => {
    it('restores books and deserializes annotations and preferences to AsyncStorage', async () => {
      const mockNativeRestore = jest.fn().mockResolvedValue({
        restoredBooks: 3,
        annotationsJson: JSON.stringify([
          { id: 'ann-restored', bookId: 'b-1', text: 'Restored note', type: 'note' },
        ]),
        preferencesJson: JSON.stringify({
          theme: 'dark',
          readerPreferences: { fontFamily: 'serif', fontSize: 22, lineHeight: 1.8 },
        }),
      });

      NativeModules.StorageBackup = {
        restoreBackup: mockNativeRestore,
      };

      const result = await storageBackupService.restoreBackup('content://test.zip', 'merge');
      expect(result.restoredBooks).toBe(3);
      expect(result.annotationsRestored).toBeGreaterThan(0);
      expect(result.preferencesRestored).toBe(true);
    });
  });

  describe('exportDiagnostics', () => {
    it('produces strictly sanitized data without book titles or notes', async () => {
      const mockExportDiag = jest.fn().mockImplementation((jsonStr: string) => {
        const data = JSON.parse(jsonStr);
        // Verify privacy guarantees: no private content
        expect(data.bookTitles).toBeUndefined();
        expect(data.userNotes).toBeUndefined();
        expect(data.passages).toBeUndefined();

        // Verify technical metrics exist
        expect(data.totalBooksImported).toBeDefined();
        expect(data.totalAnnotationsStored).toBeDefined();
        expect(data.activeNarrationEngine).toBe('chatterbox-nano');
        expect(data.ttsPerformanceMode).toBe('balanced');
        return Promise.resolve('content://diagnostics.txt');
      });

      NativeModules.StorageBackup = {
        getStorageBreakdown: jest.fn().mockResolvedValue({
          modelsBytes: 0,
          audioBytes: 0,
          booksBytes: 0,
          databaseBytes: 0,
          freeBytes: 100000,
          totalBytes: 200000,
          books: [
            {
              id: 'b-private',
              title: 'Secret Diary',
              author: 'Secret Author',
              format: 'txt',
              sourceSizeBytes: 100,
              audioSizeBytes: 0,
              progressPercent: 0,
            },
          ],
        }),
        exportDiagnostics: mockExportDiag,
      };

      const uri = await storageBackupService.exportDiagnostics();
      expect(uri).toBe('content://diagnostics.txt');
      expect(mockExportDiag).toHaveBeenCalledTimes(1);

      // Verify the JSON string passed to native did NOT contain "Secret Diary" or "Secret Author"
      const passedJson = mockExportDiag.mock.calls[0][0];
      expect(passedJson).not.toContain('Secret Diary');
      expect(passedJson).not.toContain('Secret Author');
    });
  });

  describe('deleteAllAppData', () => {
    it('clears AsyncStorage and invokes native module cleanup', async () => {
      const mockDeleteAll = jest.fn().mockResolvedValue(true);
      NativeModules.StorageBackup = {
        deleteAllAppData: mockDeleteAll,
      };

      const success = await storageBackupService.deleteAllAppData();
      expect(AsyncStorage.clear).toHaveBeenCalledTimes(1);
      expect(mockDeleteAll).toHaveBeenCalledTimes(1);
      expect(success).toBe(true);
    });
  });
});
