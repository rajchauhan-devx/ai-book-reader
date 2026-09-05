import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';

export type NarrationEngineState =
  | 'idle'
  | 'preparing'
  | 'generating'
  | 'playing'
  | 'ready'
  | 'failed';

export type PerformanceMode = 'battery' | 'balanced' | 'quality';
export type NarrationEngineKind = 'natural' | 'system' | 'none';

export type NarrationEngineSnapshot = {
  state: NarrationEngineState;
  progress: number;
  message: string;
  performanceMode: PerformanceMode;
  modelInstalled: boolean;
  running: boolean;
  engine: NarrationEngineKind;
  batteryPercent: number;
  thermalStatus: number;
};

export type VoiceTestResult = {
  engine: Exclude<NarrationEngineKind, 'none'>;
  audioPath: string | null;
  durationMs: number;
  generationMs: number;
  realtimeFactor: number;
  fallbackReason: string | null;
  message: string;
};

type NativeNarrationEngine = {
  getStatus(): Promise<unknown>;
  setPerformanceMode(mode: PerformanceMode): Promise<PerformanceMode>;
  testVoice(text: string | null, preferNatural: boolean): Promise<unknown>;
  cancel(): Promise<boolean>;
  unload(): Promise<boolean>;
  getGeneratedAudioBytes(): Promise<number>;
  removeGeneratedAudio(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export const NARRATION_ENGINE_EVENT = 'NarrationEngineProgress';
const nativeEngine = NativeModules.NarrationEngine as
  | NativeNarrationEngine
  | undefined;

export const initialNarrationSnapshot: NarrationEngineSnapshot = {
  state: 'idle',
  progress: 0,
  message: 'Ready to test voice',
  performanceMode: 'balanced',
  modelInstalled: false,
  running: false,
  engine: 'none',
  batteryPercent: -1,
  thermalStatus: 0,
};

const states = new Set<NarrationEngineState>([
  'idle',
  'preparing',
  'generating',
  'playing',
  'ready',
  'failed',
]);
const modes = new Set<PerformanceMode>(['battery', 'balanced', 'quality']);
const engines = new Set<NarrationEngineKind>(['natural', 'system', 'none']);

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeNarrationSnapshot(
  value: unknown,
): NarrationEngineSnapshot {
  if (!value || typeof value !== 'object') {
    return initialNarrationSnapshot;
  }
  const candidate = value as Record<string, unknown>;
  return {
    state: states.has(candidate.state as NarrationEngineState)
      ? (candidate.state as NarrationEngineState)
      : 'failed',
    progress: Math.min(1, Math.max(0, number(candidate.progress))),
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : initialNarrationSnapshot.message,
    performanceMode: modes.has(candidate.performanceMode as PerformanceMode)
      ? (candidate.performanceMode as PerformanceMode)
      : 'balanced',
    modelInstalled: candidate.modelInstalled === true,
    running: candidate.running === true,
    engine: engines.has(candidate.engine as NarrationEngineKind)
      ? (candidate.engine as NarrationEngineKind)
      : 'none',
    batteryPercent: number(candidate.batteryPercent, -1),
    thermalStatus: number(candidate.thermalStatus),
  };
}

export function normalizeVoiceTestResult(value: unknown): VoiceTestResult {
  const candidate = (value ?? {}) as Record<string, unknown>;
  return {
    engine: candidate.engine === 'natural' ? 'natural' : 'system',
    audioPath:
      typeof candidate.audioPath === 'string' ? candidate.audioPath : null,
    durationMs: Math.max(0, number(candidate.durationMs)),
    generationMs: Math.max(0, number(candidate.generationMs)),
    realtimeFactor: Math.max(0, number(candidate.realtimeFactor)),
    fallbackReason:
      typeof candidate.fallbackReason === 'string'
        ? candidate.fallbackReason
        : null,
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : 'Voice test started',
  };
}

function requireEngine(): NativeNarrationEngine {
  if (!nativeEngine) {
    throw new Error('The Android voice engine is unavailable in this build.');
  }
  return nativeEngine;
}

export const narrationEngineService = {
  async getStatus() {
    if (!nativeEngine) {
      return initialNarrationSnapshot;
    }
    return normalizeNarrationSnapshot(await nativeEngine.getStatus());
  },
  async setMode(mode: PerformanceMode) {
    await requireEngine().setPerformanceMode(mode);
  },
  async test(preferNatural: boolean, text?: string) {
    return normalizeVoiceTestResult(
      await requireEngine().testVoice(text ?? null, preferNatural),
    );
  },
  async cancel() {
    await requireEngine().cancel();
  },
  async unload() {
    if (nativeEngine) {
      await nativeEngine.unload();
    }
  },
  async generatedAudioBytes() {
    return nativeEngine ? nativeEngine.getGeneratedAudioBytes() : 0;
  },
  async removeGeneratedAudio() {
    await requireEngine().removeGeneratedAudio();
  },
  subscribe(listener: (snapshot: NarrationEngineSnapshot) => void) {
    if (!nativeEngine) {
      return () => undefined;
    }
    const emitter = new NativeEventEmitter(nativeEngine);
    const subscription: EmitterSubscription = emitter.addListener(
      NARRATION_ENGINE_EVENT,
      value => listener(normalizeNarrationSnapshot(value)),
    );
    return () => subscription.remove();
  },
};
