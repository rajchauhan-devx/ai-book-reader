import { NativeEventEmitter, NativeModules } from 'react-native';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'buffering' | 'ended';

export type SleepTimerPreset = 'off' | '10m' | '20m' | '30m' | '45m' | '60m' | 'chapter';

export interface PlayerState {
  state: PlaybackState;
  bookId: string | null;
  chapterId: string | null;
  bookTitle: string | null;
  chapterTitle: string | null;
  sentenceIndex: number;
  totalSentences: number;
  positionMs: number;
  durationMs: number;
  speed: number;
  sleepTimerSecondsRemaining: number;
  isSleepTimerActive: boolean;
  sleepTimerEndOfChapter: boolean;
  pagePreparationReady?: number;
  pagePreparationTotal?: number;
}

export const initialPlayerState: PlayerState = {
  state: 'idle',
  bookId: null,
  chapterId: null,
  bookTitle: null,
  chapterTitle: null,
  sentenceIndex: 0,
  totalSentences: 0,
  positionMs: 0,
  durationMs: 0,
  speed: 1.0,
  sleepTimerSecondsRemaining: 0,
  isSleepTimerActive: false,
  sleepTimerEndOfChapter: false,
  pagePreparationReady: 0,
  pagePreparationTotal: 0,
};

const NativePlayer = NativeModules.NarrationPlayer;
const playerEmitter = NativePlayer ? new NativeEventEmitter(NativePlayer) : null;

class NarrationPlayerService {
  private fallbackState: PlayerState = { ...initialPlayerState };
  private mockListeners: Set<(state: PlayerState) => void> = new Set();

  async getPlayerState(): Promise<PlayerState> {
    if (!NativePlayer) {
      return { ...this.fallbackState };
    }
    try {
      const state = await NativePlayer.getPlayerState();
      return this.normalizeState(state);
    } catch {
      return { ...this.fallbackState };
    }
  }

  async play(
    bookId: string,
    chapterId: string,
    sentenceIndex: number,
    voiceId?: string,
    expression?: string,
    speed?: number,
    pageSize?: number,
  ): Promise<boolean> {
    if (!NativePlayer) {
      this.fallbackState = {
        ...this.fallbackState,
        state: 'playing',
        bookId,
        chapterId,
        sentenceIndex,
        speed: speed ?? this.fallbackState.speed,
      };
      this.emitMockState();
      return true;
    }
    return NativePlayer.play(
      bookId,
      chapterId,
      sentenceIndex,
      voiceId ?? 'warm',
      expression ?? 'natural',
      speed ?? 1.0,
      pageSize ?? 20,
    );
  }

  async pause(): Promise<boolean> {
    if (!NativePlayer) {
      this.fallbackState = { ...this.fallbackState, state: 'paused' };
      this.emitMockState();
      return true;
    }
    return NativePlayer.pause();
  }

  async resume(): Promise<boolean> {
    if (!NativePlayer) {
      this.fallbackState = { ...this.fallbackState, state: 'playing' };
      this.emitMockState();
      return true;
    }
    return NativePlayer.resume();
  }

  async stop(): Promise<boolean> {
    if (!NativePlayer) {
      this.fallbackState = { ...initialPlayerState };
      this.emitMockState();
      return true;
    }
    return NativePlayer.stop();
  }

  async seekSentence(sentenceIndex: number): Promise<boolean> {
    if (!NativePlayer) {
      this.fallbackState = {
        ...this.fallbackState,
        sentenceIndex: Math.max(0, sentenceIndex),
        positionMs: 0,
      };
      this.emitMockState();
      return true;
    }
    return NativePlayer.seekSentence(sentenceIndex);
  }

  async skipTime(deltaMs: number): Promise<boolean> {
    if (!NativePlayer) {
      const nextPos = Math.max(0, this.fallbackState.positionMs + deltaMs);
      this.fallbackState = { ...this.fallbackState, positionMs: nextPos };
      this.emitMockState();
      return true;
    }
    return NativePlayer.skipTime(deltaMs);
  }

  async setSpeed(speed: number): Promise<boolean> {
    const clampedSpeed = Math.min(2.0, Math.max(0.75, speed));
    if (!NativePlayer) {
      this.fallbackState = { ...this.fallbackState, speed: clampedSpeed };
      this.emitMockState();
      return true;
    }
    return NativePlayer.setSpeed(clampedSpeed);
  }

  async setSleepTimer(preset: SleepTimerPreset): Promise<boolean> {
    let minutes = 0;
    let endOfChapter = false;

    switch (preset) {
      case '10m':
        minutes = 10;
        break;
      case '20m':
        minutes = 20;
        break;
      case '30m':
        minutes = 30;
        break;
      case '45m':
        minutes = 45;
        break;
      case '60m':
        minutes = 60;
        break;
      case 'chapter':
        endOfChapter = true;
        break;
      case 'off':
      default:
        minutes = 0;
        endOfChapter = false;
        break;
    }

    if (!NativePlayer) {
      this.fallbackState = {
        ...this.fallbackState,
        isSleepTimerActive: minutes > 0 || endOfChapter,
        sleepTimerEndOfChapter: endOfChapter,
        sleepTimerSecondsRemaining: minutes * 60,
      };
      this.emitMockState();
      return true;
    }

    return NativePlayer.setSleepTimer(minutes, endOfChapter);
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    if (playerEmitter) {
      const subscription = playerEmitter.addListener(
        'NarrationPlayerStateChanged',
        rawState => {
          listener(this.normalizeState(rawState));
        },
      );
      return () => subscription.remove();
    } else {
      this.mockListeners.add(listener);
      return () => {
        this.mockListeners.delete(listener);
      };
    }
  }

  private normalizeState(raw: any): PlayerState {
    if (!raw) return { ...initialPlayerState };
    return {
      state: (raw.state as PlaybackState) || 'idle',
      bookId: raw.bookId ?? null,
      chapterId: raw.chapterId ?? null,
      bookTitle: raw.bookTitle ?? null,
      chapterTitle: raw.chapterTitle ?? null,
      sentenceIndex: Number(raw.sentenceIndex) || 0,
      totalSentences: Number(raw.totalSentences) || 0,
      positionMs: Number(raw.positionMs) || 0,
      durationMs: Number(raw.durationMs) || 0,
      speed: Number(raw.speed) || 1.0,
      sleepTimerSecondsRemaining: Number(raw.sleepTimerSecondsRemaining) || 0,
      isSleepTimerActive: Boolean(raw.isSleepTimerActive),
      sleepTimerEndOfChapter: Boolean(raw.sleepTimerEndOfChapter),
      pagePreparationReady: Number(raw.pagePreparationReady) || 0,
      pagePreparationTotal: Number(raw.pagePreparationTotal) || 0,
    };
  }

  private emitMockState() {
    const s = { ...this.fallbackState };
    for (const listener of this.mockListeners) {
      listener(s);
    }
  }
}

export const narrationPlayerService = new NarrationPlayerService();
