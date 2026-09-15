import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  type EdgeVoiceId,
  type NarrationEngineMode,
  edgeTtsService,
} from './edgeTtsService';

export type VoiceProfile = {
  id: string;
  name: string;
  descriptor: string;
  engine: 'natural' | 'system' | 'edge';
  isDefault: boolean;
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
  voiceId: string;
  expression: string;
  engineMode: NarrationEngineMode;
  edgeVoice: EdgeVoiceId;
  chatterboxVoice: string;
  opencodeApiKey?: string;
  opencodeBaseUrl?: string;
  opencodeModel?: string;
  enableAiRefinement?: boolean;
};

const PREFS_KEY = '@ai-book-reader/narration-preferences';

export const DEFAULT_VOICES: VoiceProfile[] = [
  {
    id: 'warm',
    name: 'Warm Narrator',
    descriptor: 'Rich, engaging tone ideal for fiction and storytelling',
    engine: 'natural',
    isDefault: true,
  },
  {
    id: 'clear',
    name: 'Clear Voice',
    descriptor: 'Balanced, precise tone best for non-fiction and study',
    engine: 'natural',
    isDefault: false,
  },
  {
    id: 'deep',
    name: 'Deep Voice',
    descriptor: 'Resonant, dramatic tone for mysteries and epics',
    engine: 'natural',
    isDefault: false,
  },
  {
    id: 'gentle',
    name: 'Gentle Voice',
    descriptor: 'Soft, calm cadence for relaxed and bedtime reading',
    engine: 'natural',
    isDefault: false,
  },
];

export const DEFAULT_EXPRESSIONS: ExpressionPreset[] = [
  {
    id: 'calm',
    name: 'Calm',
    descriptor: 'Steady, controlled pacing',
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
  voiceId: 'warm',
  expression: 'natural',
  engineMode: 'edge-cloud',
  edgeVoice: 'en-US-JennyNeural',
  chatterboxVoice: 'warm',
  opencodeApiKey: '',
  opencodeBaseUrl: 'https://opencode.ai/zen/v1',
  opencodeModel: 'mimo-v2.5-free',
  enableAiRefinement: true,
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
        voiceId: typeof parsed.voiceId === 'string' ? parsed.voiceId : 'warm',
        expression:
          typeof parsed.expression === 'string' ? parsed.expression : 'natural',
        engineMode:
          parsed.engineMode === 'chatterbox-local'
            ? 'chatterbox-local'
            : 'edge-cloud',
        edgeVoice:
          parsed.edgeVoice && edgeTtsService.isValidVoice(parsed.edgeVoice)
            ? parsed.edgeVoice
            : 'en-US-JennyNeural',
        chatterboxVoice:
          typeof parsed.chatterboxVoice === 'string'
            ? parsed.chatterboxVoice
            : 'warm',
        opencodeApiKey:
          typeof parsed.opencodeApiKey === 'string'
            ? parsed.opencodeApiKey
            : '',
        opencodeBaseUrl:
          typeof parsed.opencodeBaseUrl === 'string'
            ? parsed.opencodeBaseUrl
            : 'https://opencode.ai/zen/v1',
        opencodeModel:
          typeof parsed.opencodeModel === 'string'
            ? parsed.opencodeModel
            : 'mimo-v2.5-free',
        enableAiRefinement:
          typeof parsed.enableAiRefinement === 'boolean'
            ? parsed.enableAiRefinement
            : true,
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
      voiceId: patch.voiceId ?? current.voiceId,
      expression: patch.expression ?? current.expression,
      engineMode: patch.engineMode ?? current.engineMode,
      edgeVoice: patch.edgeVoice ?? current.edgeVoice,
      chatterboxVoice: patch.chatterboxVoice ?? current.chatterboxVoice,
      opencodeApiKey: patch.opencodeApiKey !== undefined ? patch.opencodeApiKey : current.opencodeApiKey,
      opencodeBaseUrl: patch.opencodeBaseUrl !== undefined ? patch.opencodeBaseUrl : current.opencodeBaseUrl,
      opencodeModel: patch.opencodeModel !== undefined ? patch.opencodeModel : current.opencodeModel,
      enableAiRefinement: patch.enableAiRefinement !== undefined ? patch.enableAiRefinement : current.enableAiRefinement,
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
      engine: typeof result.engine === 'string' ? result.engine : 'natural',
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
      throw new Error('Audio picker is not available on this platform.');
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
      engine: 'natural',
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
          voiceId: typeof e.voiceId === 'string' ? e.voiceId : 'warm',
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
