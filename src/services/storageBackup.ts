import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { annotationsService } from './annotations';
import { preferencesRepository } from './preferences';
import { readerPreferencesRepository } from './readerPreferences';
import { modelDownloadService } from './modelDownload';
import { narrationEngineService } from './narrationEngine';

export type BookStorageItem = {
  id: string;
  title: string;
  author: string;
  format: string;
  sourceSizeBytes: number;
  audioSizeBytes: number;
  progressPercent: number;
};

export type StorageBreakdown = {
  modelsBytes: number;
  audioBytes: number;
  booksBytes: number;
  databaseBytes: number;
  freeBytes: number;
  totalBytes: number;
  books: BookStorageItem[];
};

export type BackupExportResult = {
  filePath: string;
  uri: string;
  sizeBytes: number;
  bookCount: number;
};

export type BackupPreviewResult = {
  version: number;
  appVersion: string;
  createdAt: string;
  bookCount: number;
  hasAudio: boolean;
  totalSizeBytes: number;
  conflicts: string[];
};

export type BackupRestoreResult = {
  restoredBooks: number;
  annotationsRestored: number;
  preferencesRestored: boolean;
};

const getNative = () => NativeModules.StorageBackup;

class StorageBackupService {
  private fallbackBreakdown: StorageBreakdown = {
    modelsBytes: 0,
    audioBytes: 0,
    booksBytes: 0,
    databaseBytes: 0,
    freeBytes: 1024 * 1024 * 1024 * 50, // 50 GB
    totalBytes: 1024 * 1024 * 1024 * 128, // 128 GB
    books: [],
  };

  async getStorageBreakdown(): Promise<StorageBreakdown> {
    if (!getNative()) {
      return { ...this.fallbackBreakdown };
    }
    try {
      const breakdown = await getNative().getStorageBreakdown();
      return {
        modelsBytes: Number(breakdown.modelsBytes || 0),
        audioBytes: Number(breakdown.audioBytes || 0),
        booksBytes: Number(breakdown.booksBytes || 0),
        databaseBytes: Number(breakdown.databaseBytes || 0),
        freeBytes: Number(breakdown.freeBytes || 0),
        totalBytes: Number(breakdown.totalBytes || 0),
        books: (breakdown.books || []).map((b: any) => ({
          id: String(b.id),
          title: String(b.title || 'Untitled'),
          author: String(b.author || 'Unknown author'),
          format: String(b.format || 'epub'),
          sourceSizeBytes: Number(b.sourceSizeBytes || 0),
          audioSizeBytes: Number(b.audioSizeBytes || 0),
          progressPercent: Number(b.progressPercent || 0),
        })),
      };
    } catch {
      return { ...this.fallbackBreakdown };
    }
  }

  async deleteBookAudio(bookId: string): Promise<boolean> {
    if (!getNative()) {
      return true;
    }
    try {
      return await getNative().deleteBookAudio(bookId);
    } catch {
      return false;
    }
  }

  async exportBackup(includeAudio: boolean = false): Promise<BackupExportResult> {
    const [annotations, theme, readerPrefs] = await Promise.all([
      annotationsService.list().catch(() => []),
      preferencesRepository.getTheme().catch(() => 'system' as const),
      readerPreferencesRepository.get().catch(() => null),
    ]);

    const annotationsJson = JSON.stringify(annotations);
    const preferencesJson = JSON.stringify({
      theme,
      readerPreferences: readerPrefs,
    });

    if (!getNative()) {
      return {
        filePath: '/mock/backup.zip',
        uri: 'file:///mock/backup.zip',
        sizeBytes: 1024 * 512,
        bookCount: 1,
      };
    }

    return await getNative().exportBackup(
      includeAudio,
      annotationsJson,
      preferencesJson,
    );
  }

  async previewBackup(fileUri: string): Promise<BackupPreviewResult> {
    if (!getNative()) {
      return {
        version: 1,
        appVersion: '0.0.1',
        createdAt: new Date().toISOString(),
        bookCount: 1,
        hasAudio: false,
        totalSizeBytes: 1024 * 1024 * 5,
        conflicts: [],
      };
    }

    const preview = await getNative().previewBackup(fileUri);
    return {
      version: Number(preview.version || 1),
      appVersion: String(preview.appVersion || '0.0.1'),
      createdAt: String(preview.createdAt || ''),
      bookCount: Number(preview.bookCount || 0),
      hasAudio: Boolean(preview.hasAudio),
      totalSizeBytes: Number(preview.totalSizeBytes || 0),
      conflicts: Array.isArray(preview.conflicts) ? preview.conflicts : [],
    };
  }

  async restoreBackup(
    fileUri: string,
    conflictStrategy: 'merge' | 'replace' = 'merge',
  ): Promise<BackupRestoreResult> {
    if (!getNative()) {
      return {
        restoredBooks: 1,
        annotationsRestored: 0,
        preferencesRestored: true,
      };
    }

    const nativeResult = await getNative().restoreBackup(
      fileUri,
      conflictStrategy,
    );

    let annotationsRestored = 0;
    if (nativeResult.annotationsJson) {
      try {
        const importedAnnotations = JSON.parse(nativeResult.annotationsJson);
        if (Array.isArray(importedAnnotations)) {
          const current = await annotationsService.list();
          const existingIds = new Set(current.map(a => a.id));
          for (const ann of importedAnnotations) {
            if (!existingIds.has(ann.id)) {
              await annotationsService.add(ann);
              annotationsRestored++;
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }

    let preferencesRestored = false;
    if (nativeResult.preferencesJson) {
      try {
        const prefs = JSON.parse(nativeResult.preferencesJson);
        if (prefs.theme) {
          await preferencesRepository.setTheme(prefs.theme);
        }
        if (prefs.readerPreferences) {
          await readerPreferencesRepository.set(prefs.readerPreferences);
        }
        preferencesRestored = true;
      } catch {
        // Non-blocking
      }
    }

    return {
      restoredBooks: Number(nativeResult.restoredBooks || 0),
      annotationsRestored,
      preferencesRestored,
    };
  }

  async exportDiagnostics(): Promise<string> {
    const [modelStatus, engineStatus, breakdown, annotationsCount] = await Promise.all([
      modelDownloadService.getStatus(),
      narrationEngineService.getStatus(),
      this.getStorageBreakdown(),
      annotationsService.list().then(l => l.length).catch(() => 0),
    ]);

    // Construct strictly sanitized payload (ZERO titles, ZERO texts, ZERO notes)
    const sanitizedData = {
      appVersion: '1.0.0-beta',
      totalBooksImported: breakdown.books.length,
      formatsDistribution: breakdown.books.reduce((acc: Record<string, number>, b: BookStorageItem) => {
        acc[b.format] = (acc[b.format] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalAnnotationsStored: annotationsCount,
      voiceModelStatus: modelStatus.state,
      voiceModelProgress: modelStatus.progress,
      ttsPerformanceMode: engineStatus.performanceMode,
      activeNarrationEngine: engineStatus.engine,
      totalGeneratedAudioMegabytes: Math.round(breakdown.audioBytes / (1024 * 1024)),
      deviceFreeStorageMegabytes: Math.round(breakdown.freeBytes / (1024 * 1024)),
    };

    if (!getNative()) {
      return 'file:///mock/diagnostics.txt';
    }

    return await getNative().exportDiagnostics(JSON.stringify(sanitizedData, null, 2));
  }

  async deleteAllAppData(): Promise<boolean> {
    // Clear AsyncStorage keys first
    await AsyncStorage.clear();

    if (!getNative()) {
      return true;
    }

    return await getNative().deleteAllAppData();
  }
}

export const storageBackupService = new StorageBackupService();

export function formatStorage(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}
