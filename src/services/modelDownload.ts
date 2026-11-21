import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import type {ModelPackState} from './contracts';

export const MODEL_DOWNLOAD_EVENT = 'ModelDownloadProgress';
export const MODEL_PACK_BYTES = 88_436_096;

export type ModelDownloadSnapshot = {
  state: ModelPackState;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
  supported: boolean;
  availableBytes: number;
  memoryBytes: number;
  packVersion: string;
};

export type ModelStorageInfo = {
  installedBytes: number;
  partialBytes: number;
  availableBytes: number;
  totalBytes: number;
};

type NativeModelDownload = {
  getStatus(): Promise<unknown>;
  startDownload(wifiOnly: boolean): Promise<boolean>;
  pauseDownload(): Promise<boolean>;
  removeModel(): Promise<boolean>;
  getStorageInfo(): Promise<unknown>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const allowedStates = new Set<ModelPackState>([
  'not-installed',
  'checking',
  'downloading',
  'paused',
  'verifying',
  'ready',
  'failed',
  'unsupported',
]);

const nativeModelDownload = NativeModules.ModelDownload as
  | NativeModelDownload
  | undefined;

export const initialModelDownloadSnapshot: ModelDownloadSnapshot = {
  state: 'not-installed',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: MODEL_PACK_BYTES,
  message: 'Ready to download',
  supported: true,
  availableBytes: 0,
  memoryBytes: 0,
  packVersion: 'kokoro-v1.0-onnx',
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeModelDownloadSnapshot(
  value: unknown,
): ModelDownloadSnapshot {
  if (!value || typeof value !== 'object') {
    return initialModelDownloadSnapshot;
  }

  const candidate = value as Record<string, unknown>;
  const state = allowedStates.has(candidate.state as ModelPackState)
    ? (candidate.state as ModelPackState)
    : 'failed';
  const totalBytes = Math.max(
    0,
    asNumber(candidate.totalBytes, MODEL_PACK_BYTES),
  );
  const downloadedBytes = Math.min(
    totalBytes,
    Math.max(0, asNumber(candidate.downloadedBytes, 0)),
  );
  const progress = Math.min(
    1,
    Math.max(
      0,
      asNumber(
        candidate.progress,
        totalBytes > 0 ? downloadedBytes / totalBytes : 0,
      ),
    ),
  );

  return {
    state,
    progress,
    downloadedBytes,
    totalBytes,
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : initialModelDownloadSnapshot.message,
    supported: candidate.supported !== false,
    availableBytes: Math.max(0, asNumber(candidate.availableBytes, 0)),
    memoryBytes: Math.max(0, asNumber(candidate.memoryBytes, 0)),
    packVersion:
      typeof candidate.packVersion === 'string'
        ? candidate.packVersion
        : initialModelDownloadSnapshot.packVersion,
  };
}

export function formatDownloadBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function requireNativeModule(): NativeModelDownload {
  if (!nativeModelDownload) {
    throw new Error('The Android voice downloader is unavailable in this build.');
  }
  return nativeModelDownload;
}

export const modelDownloadService = {
  async getStatus(): Promise<ModelDownloadSnapshot> {
    if (!nativeModelDownload) {
      return initialModelDownloadSnapshot;
    }
    return normalizeModelDownloadSnapshot(await nativeModelDownload.getStatus());
  },

  async start(wifiOnly: boolean): Promise<void> {
    await requireNativeModule().startDownload(wifiOnly);
  },

  async pause(): Promise<void> {
    await requireNativeModule().pauseDownload();
  },

  async remove(): Promise<void> {
    await requireNativeModule().removeModel();
  },

  async getStorageInfo(): Promise<ModelStorageInfo> {
    if (!nativeModelDownload) {
      return {
        installedBytes: 0,
        partialBytes: 0,
        availableBytes: 0,
        totalBytes: MODEL_PACK_BYTES,
      };
    }
    const value = (await nativeModelDownload.getStorageInfo()) as Record<
      string,
      unknown
    >;
    return {
      installedBytes: Math.max(0, asNumber(value.installedBytes, 0)),
      partialBytes: Math.max(0, asNumber(value.partialBytes, 0)),
      availableBytes: Math.max(0, asNumber(value.availableBytes, 0)),
      totalBytes: Math.max(
        0,
        asNumber(value.totalBytes, MODEL_PACK_BYTES),
      ),
    };
  },

  subscribe(
    listener: (snapshot: ModelDownloadSnapshot) => void,
  ): () => void {
    if (!nativeModelDownload) {
      return () => undefined;
    }

    const emitter = new NativeEventEmitter(nativeModelDownload);
    const subscription: EmitterSubscription = emitter.addListener(
      MODEL_DOWNLOAD_EVENT,
      value => listener(normalizeModelDownloadSnapshot(value)),
    );
    return () => subscription.remove();
  },
};
