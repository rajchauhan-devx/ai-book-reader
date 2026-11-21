import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  type KokoroVoiceId,
  KOKORO_VOICES,
  kokoroTtsService,
} from './kokoroTtsService';

export type VoiceProfile = {
  id: string;
  name: string;
  descriptor: string;
  engine: 'kokoro' | 'natural' | 'system';
  isDefault: boolean;
  gender?: 'female' | 'male';
  accent?: 'American' | 'British';
  tone?: string;
  isCustom?: boolean;
  sampleDurationSec?: number;
};

export type AudioSelection = {
  uri: string;
  name: string;
  size: number;
};

export type ExpressionPreset = {
  id: string;
  name: string;
  descriptor: string;
};

export type ChapterAudioStatus = {
  readySegments: number;
  totalSegments: number;
  durationMs: number;
  totalBytes: number;
  isComplete: boolean;
};

export type SentenceAudioResult = {
  audioPath: string | null;
  durationMs: number;
  isCached: boolean;
  engine: string;
};

export type ChapterPreparationProgress = {
  state: 'idle' | 'preparing' | 'generating' | 'ready' | 'failed' | 'cancelled';
  bookId: string;
  chapterId: string;
  voiceId: string;
  readySegments: number;
  totalSegments: number;
  progress: number;
  currentText: string;
  message: string;
};

export type NarrationPreferences = {
  voiceId: KokoroVoiceId;
  expression: string;
  speed: number;
};

const PREFS_KEY = '@ai-book-reader/narration-preferences';

export const DEFAULT_VOICES: VoiceProfile[] = KOKORO_VOICES.map(v => ({
  id: v.id,
  name: v.name,
  descriptor: v.descriptor,
  engine: 'kokoro',
  isDefault: v.isDefault === true,
  gender: v.gender,
  accent: v.accent,
  tone: v.tone,
}));

export const DEFAULT_EXPRESSIONS: ExpressionPreset[] = [
  {
    id: 'calm',
    name: 'Calm',
    descriptor: 'Steady, relaxed pacing',
  },
  {
    id: 'natural',
    name: 'Natural',
    descriptor: 'Balanced expression and conversational cadence',
  },
  {
    id: 'expressive',
    name: 'Expressive',
    descriptor: 'Dynamic vocal range and dramatic inflection',
  },
];

export const defaultNarrationPreferences: NarrationPreferences = {
  voiceId: 'af_heart',
  expression: 'natural',
  speed: 1.0,
};

const nativeEngine = NativeModules.NarrationEngine;
export const CHAPTER_NARRATION_EVENT = 'ChapterNarrationProgress';

class NarrationPipelineService {
  private eventEmitter = nativeEngine
    ? new NativeEventEmitter(nativeEngine)
    : null;

  async getPreferences(): Promise<NarrationPreferences> {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      if (!raw) return defaultNarrationPreferences;
      const parsed = JSON.parse(raw) as Partial<NarrationPreferences>;
      return {
        voiceId:
          parsed.voiceId && kokoroTtsService.isValidVoice(parsed.voiceId)
            ? (parsed.voiceId as KokoroVoiceId)
            : 'af_bella',
        expression:
          typeof parsed.expression === 'string' ? parsed.expression : 'natural',
        speed:
          typeof parsed.speed === 'number' && Number.isFinite(parsed.speed)
            ? parsed.speed
            : 1.0,
      };
    } catch {
      return defaultNarrationPreferences;
    }
  }

  async savePreferences(
    patch: Partial<NarrationPreferences>,
  ): Promise<NarrationPreferences> {
    const current = await this.getPreferences();
    const updated: NarrationPreferences = {
      voiceId:
        patch.voiceId && kokoroTtsService.isValidVoice(patch.voiceId)
          ? patch.voiceId
          : current.voiceId,
      expression: patch.expression ?? current.expression,
      speed: patch.speed ?? current.speed,
    };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    return updated;
  }

  async getCuratedVoices(): Promise<{
    voices: VoiceProfile[];
    expressions: ExpressionPreset[];
  }> {
    if (!nativeEngine?.getCuratedVoices) {
      return { voices: DEFAULT_VOICES, expressions: DEFAULT_EXPRESSIONS };
    }
    try {
      const result = await nativeEngine.getCuratedVoices();
      return {
        voices: result.voices ?? DEFAULT_VOICES,
        expressions: result.expressions ?? DEFAULT_EXPRESSIONS,
      };
    } catch {
      return { voices: DEFAULT_VOICES, expressions: DEFAULT_EXPRESSIONS };
    }
  }

  async getChapterAudioStatus(
    bookId: string,
    chapterId: string,
    voiceId?: string,
  ): Promise<ChapterAudioStatus> {
    if (!nativeEngine?.getChapterAudioStatus) {
      return {
        readySegments: 0,
        totalSegments: 0,
        durationMs: 0,
        totalBytes: 0,
        isComplete: false,
      };
    }
    const resolvedVoice = voiceId ?? (await this.getPreferences()).voiceId;
    try {
      const result = await nativeEngine.getChapterAudioStatus(
        bookId,
        chapterId,
        resolvedVoice,
      );
      return {
        readySegments: Number(result.readySegments) || 0,
        totalSegments: Number(result.totalSegments) || 0,
        durationMs: Number(result.durationMs) || 0,
        totalBytes: Number(result.totalBytes) || 0,
        isComplete: result.isComplete === true,
      };
    } catch {
      return {
        readySegments: 0,
        totalSegments: 0,
        durationMs: 0,
        totalBytes: 0,
        isComplete: false,
      };
    }
  }

  async generateSentenceAudio(
    bookId: string,
    chapterId: string,
    sentenceIndex: number,
    voiceId?: string,
    expression?: string,
  ): Promise<SentenceAudioResult> {
    if (!nativeEngine?.generateSentenceAudio) {
      throw new Error('Narration generation is unavailable in this environment.');
    }
    const prefs = await this.getPreferences();
    const resolvedVoice = voiceId ?? prefs.voiceId;
    const resolvedExpr = expression ?? prefs.expression;

    const result = await nativeEngine.generateSentenceAudio(
      bookId,
      chapterId,
      sentenceIndex,
      resolvedVoice,
      resolvedExpr,
    );
    return {
      audioPath: typeof result.audioPath === 'string' ? result.audioPath : null,
      durationMs: Number(result.durationMs) || 0,
      isCached: result.isCached === true,
      engine: typeof result.engine === 'string' ? result.engine : 'kokoro',
    };
  }

  async prepareChapterAudio(
    bookId: string,
    chapterId: string,
    voiceId?: string,
    expression?: string,
  ): Promise<boolean> {
    if (!nativeEngine?.prepareChapterAudio) {
      throw new Error('Background narration worker is unavailable.');
    }
    const prefs = await this.getPreferences();
    const resolvedVoice = voiceId ?? prefs.voiceId;
    const resolvedExpr = expression ?? prefs.expression;
    return await nativeEngine.prepareChapterAudio(
      bookId,
      chapterId,
      resolvedVoice,
      resolvedExpr,
    );
  }

  async cancelChapterPreparation(
    bookId: string,
    chapterId: string,
  ): Promise<boolean> {
    if (!nativeEngine?.cancelChapterPreparation) {
      return false;
    }
    return await nativeEngine.cancelChapterPreparation(bookId, chapterId);
  }

  async removeBookAudio(bookId: string): Promise<boolean> {
    if (!nativeEngine?.removeBookAudio) {
      return false;
    }
    return await nativeEngine.removeBookAudio(bookId);
  }

  async removeAllAudio(): Promise<boolean> {
    if (!nativeEngine?.removeGeneratedAudio) {
      return false;
    }
    return await nativeEngine.removeGeneratedAudio();
  }

  async getTotalAudioBytes(): Promise<number> {
    if (!nativeEngine?.getGeneratedAudioBytes) {
      return 0;
    }
    return await nativeEngine.getGeneratedAudioBytes();
  }

  async pickReferenceAudio(): Promise<AudioSelection | null> {
    if (!nativeEngine?.pickReferenceAudio) {
      return null;
    }
    const result = await nativeEngine.pickReferenceAudio();
    if (!result || typeof result !== 'object') return null;
    return {
      uri: typeof result.uri === 'string' ? result.uri : '',
      name: typeof result.name === 'string' ? result.name : 'audio.mp3',
      size: Number(result.size) || 0,
    };
  }

  async importCustomVoice(uri: string, name: string): Promise<VoiceProfile> {
    if (!nativeEngine?.importCustomVoice) {
      throw new Error('Custom voice import is not available.');
    }
    const result = await nativeEngine.importCustomVoice(uri, name);
    return {
      id: String(result.id),
      name: String(result.name),
      descriptor: String(result.descriptor),
      engine: 'kokoro',
      isDefault: false,
      isCustom: true,
      sampleDurationSec: Number(result.sampleDurationSec) || 0,
    };
  }

  async deleteCustomVoice(voiceId: string): Promise<boolean> {
    if (!nativeEngine?.deleteCustomVoice) {
      return false;
    }
    return await nativeEngine.deleteCustomVoice(voiceId);
  }

  subscribeChapterProgress(
    listener: (progress: ChapterPreparationProgress) => void,
  ): () => void {
    if (!this.eventEmitter) return () => {};
    const subscription: EmitterSubscription = this.eventEmitter.addListener(
      CHAPTER_NARRATION_EVENT,
      (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const e = event as Record<string, unknown>;
        listener({
          state: (e.state as ChapterPreparationProgress['state']) ?? 'idle',
          bookId: typeof e.bookId === 'string' ? e.bookId : '',
          chapterId: typeof e.chapterId === 'string' ? e.chapterId : '',
          voiceId: typeof e.voiceId === 'string' ? e.voiceId : 'af_bella',
          readySegments: Number(e.readySegments) || 0,
          totalSegments: Number(e.totalSegments) || 0,
          progress: Number(e.progress) || 0,
          currentText: typeof e.currentText === 'string' ? e.currentText : '',
          message: typeof e.message === 'string' ? e.message : '',
        });
      },
    );
    return () => subscription.remove();
  }
}

export const narrationPipelineService = new NarrationPipelineService();
