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
      { id: 'ann-secret-1', bookId: 'b-1', text: 'Private user note with confidential thoughts', type: 'note' },
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
      engine: 'kokoro',
      performanceMode: 'balanced',
      loaded: true,
      voiceCount: 5,
      activeVoiceId: 'af_bella',
      activeExpression: 'natural',
      status: 'idle',
      lastError: null,
    }),
  },
}));

describe('Security Hardening & Threat Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects backup preview when native layer detects directory traversal / zip slip', async () => {
    NativeModules.StorageBackup = {
      previewBackup: jest.fn().mockRejectedValue(
        new Error('SecurityException: Unsafe entry path in backup archive: ../../../etc/passwd'),
      ),
    };

    await expect(
      storageBackupService.previewBackup('content://com.android.providers.downloads/malicious.zip'),
    ).rejects.toThrow('Unsafe entry path in backup archive');
  });

  it('rejects backup restoration when zip entry escapes private application sandbox', async () => {
    NativeModules.StorageBackup = {
      restoreBackup: jest.fn().mockRejectedValue(
        new Error('SecurityException: Zip slip detected in entry: ../../shared_prefs/compromised.xml'),
      ),
    };

    await expect(
      storageBackupService.restoreBackup('file:///data/user/0/com.aireader/cache/evil.zip', 'merge'),
    ).rejects.toThrow('Zip slip detected');
  });

  it('diagnostics report strictly omits private book content, titles, notes, and user passages', async () => {
    let capturedSanitizedPayload = '';
    NativeModules.StorageBackup = {
      exportDiagnostics: jest.fn().mockImplementation((json: string) => {
        capturedSanitizedPayload = json;
        return Promise.resolve('content://com.aireader.fileprovider/diag.txt');
      }),
    };

    await storageBackupService.exportDiagnostics();

    expect(capturedSanitizedPayload).toBeTruthy();
    const parsed = JSON.parse(capturedSanitizedPayload);

    // Verify sanitized payload contains only non-sensitive app settings
    expect(parsed.appVersion).toBe('1.0.0-beta');
    expect(parsed.activeNarrationEngine).toBe('kokoro');
    expect(parsed.ttsPerformanceMode).toBe('balanced');
    expect(parsed.voiceModelStatus).toBe('ready');

    // Verify zero private user data or notes leak into the diagnostics payload
    expect(capturedSanitizedPayload).not.toContain('Private user note');
    expect(capturedSanitizedPayload).not.toContain('confidential thoughts');
    expect(capturedSanitizedPayload).not.toContain('ann-secret-1');
  });

  it('complete application data wipe cleans both native SQLite and JS AsyncStorage partitions', async () => {
    NativeModules.StorageBackup = {
      deleteAllAppData: jest.fn().mockResolvedValue(true),
    };

    const result = await storageBackupService.deleteAllAppData();

    expect(result).toBe(true);
    expect(NativeModules.StorageBackup.deleteAllAppData).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.clear).toHaveBeenCalledTimes(1);
  });
});
