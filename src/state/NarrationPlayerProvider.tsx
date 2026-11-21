import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  initialPlayerState,
  narrationPlayerService,
  type PlayerState,
  type SleepTimerPreset,
} from '../services/narrationPlayer';
import { narrationPipelineService } from '../services/narrationPipeline';

interface NarrationPlayerContextValue {
  playerState: PlayerState;
  isPlaying: boolean;
  isBuffering: boolean;
  play: (
    bookId: string,
    chapterId: string,
    sentenceIndex: number,
    voiceId?: string,
    expression?: string,
    speed?: number,
    pageSize?: number,
  ) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  seekSentence: (sentenceIndex: number) => Promise<boolean>;
  nextSentence: () => Promise<boolean>;
  prevSentence: () => Promise<boolean>;
  skipTime: (deltaMs: number) => Promise<boolean>;
  setSpeed: (speed: number) => Promise<boolean>;
  setSleepTimer: (preset: SleepTimerPreset) => Promise<boolean>;
}

const NarrationPlayerContext = createContext<NarrationPlayerContextValue | null>(null);

export function NarrationPlayerProvider({ children }: { children: React.ReactNode }) {
  const [playerState, setPlayerState] = useState<PlayerState>(initialPlayerState);

  useEffect(() => {
    // Initial fetch
    narrationPlayerService.getPlayerState().then(setPlayerState).catch(() => undefined);

    // Sync engine config from saved preferences
    narrationPipelineService.getPreferences().then(async prefs => {
      await narrationPlayerService.setEngineConfig(prefs.voiceId);
    }).catch(() => undefined);

    // Subscribe to native playback events
    const unsubscribe = narrationPlayerService.subscribe(state => {
      setPlayerState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const play = useCallback(
    async (
      bookId: string,
      chapterId: string,
      sentenceIndex: number,
      voiceId?: string,
      expression?: string,
      speed?: number,
      pageSize?: number,
    ) => {
      let effectiveVoice = voiceId;
      try {
        const prefs = await narrationPipelineService.getPreferences();
        if (!effectiveVoice) {
          effectiveVoice = prefs.voiceId || 'af_heart';
        }
      } catch {
        if (!effectiveVoice) {
          effectiveVoice = 'af_heart';
        }
      }
      return narrationPlayerService.play(
        bookId,
        chapterId,
        sentenceIndex,
        effectiveVoice,
        expression,
        speed ?? playerState.speed,
        pageSize,
        'kokoro',
      );
    },
    [playerState.speed],
  );

  const pause = useCallback(async () => {
    return narrationPlayerService.pause();
  }, []);

  const resume = useCallback(async () => {
    return narrationPlayerService.resume();
  }, []);

  const stop = useCallback(async () => {
    return narrationPlayerService.stop();
  }, []);

  const seekSentence = useCallback(async (sentenceIndex: number) => {
    return narrationPlayerService.seekSentence(sentenceIndex);
  }, []);

  const nextSentence = useCallback(async () => {
    return narrationPlayerService.seekSentence(playerState.sentenceIndex + 1);
  }, [playerState.sentenceIndex]);

  const prevSentence = useCallback(async () => {
    return narrationPlayerService.seekSentence(Math.max(0, playerState.sentenceIndex - 1));
  }, [playerState.sentenceIndex]);

  const skipTime = useCallback(async (deltaMs: number) => {
    return narrationPlayerService.skipTime(deltaMs);
  }, []);

  const setSpeed = useCallback(async (speed: number) => {
    return narrationPlayerService.setSpeed(speed);
  }, []);

  const setSleepTimer = useCallback(async (preset: SleepTimerPreset) => {
    return narrationPlayerService.setSleepTimer(preset);
  }, []);

  const value = useMemo<NarrationPlayerContextValue>(() => ({
    playerState,
    isPlaying: playerState.state === 'playing',
    isBuffering: playerState.state === 'buffering',
    play,
    pause,
    resume,
    stop,
    seekSentence,
    nextSentence,
    prevSentence,
    skipTime,
    setSpeed,
    setSleepTimer,
  }), [
    playerState,
    play,
    pause,
    resume,
    stop,
    seekSentence,
    nextSentence,
    prevSentence,
    skipTime,
    setSpeed,
    setSleepTimer,
  ]);

  return (
    <NarrationPlayerContext.Provider value={value}>
      {children}
    </NarrationPlayerContext.Provider>
  );
}

const defaultFallbackValue: NarrationPlayerContextValue = {
  playerState: initialPlayerState,
  isPlaying: false,
  isBuffering: false,
  play: async () => false,
  pause: async () => false,
  resume: async () => false,
  stop: async () => false,
  seekSentence: async () => false,
  nextSentence: async () => false,
  prevSentence: async () => false,
  skipTime: async () => false,
  setSpeed: async () => false,
  setSleepTimer: async () => false,
};

export function useNarrationPlayer(): NarrationPlayerContextValue {
  const ctx = useContext(NarrationPlayerContext);
  return ctx ?? defaultFallbackValue;
}
