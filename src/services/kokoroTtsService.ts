import AsyncStorage from '@react-native-async-storage/async-storage';

export type KokoroVoiceId =
  | 'af_heart'
  | 'af_bella'
  | 'af_sarah'
  | 'af_nicole'
  | 'af_sky'
  | 'am_adam'
  | 'am_michael'
  | 'bf_emma'
  | 'bm_george';

export type KokoroVoiceProfile = {
  id: KokoroVoiceId;
  name: string;
  descriptor: string;
  gender: 'female' | 'male';
  accent: 'American' | 'British';
  tone: string;
  isDefault?: boolean;
};

export const KOKORO_VOICES: KokoroVoiceProfile[] = [
  {
    id: 'af_heart',
    name: 'Heart (Flagship Expressive Narrator)',
    descriptor: 'Rich, emotional American female narrator with remarkable warmth, human breathing, and storytelling nuance',
    gender: 'female',
    accent: 'American',
    tone: 'Warm, Human & Expressive',
    isDefault: true,
  },
  {
    id: 'af_bella',
    name: 'Bella (Warm Narrator)',
    descriptor: 'Warm, expressive American female voice with rich storytelling cadence',
    gender: 'female',
    accent: 'American',
    tone: 'Warm & Expressive',
    isDefault: false,
  },
  {
    id: 'af_sarah',
    name: 'Sarah (Clear & Crisp)',
    descriptor: 'Articulate, balanced American female narrator with exceptional clarity',
    gender: 'female',
    accent: 'American',
    tone: 'Clear & Engaging',
  },
  {
    id: 'af_nicole',
    name: 'Nicole (Melodic & Soft)',
    descriptor: 'Gentle, soothing American female cadence ideal for bedtime and relaxed reads',
    gender: 'female',
    accent: 'American',
    tone: 'Gentle & Melodic',
  },
  {
    id: 'af_sky',
    name: 'Sky (Youthful & Bright)',
    descriptor: 'Animated, energetic American female voice suited for dialogue and dynamic scenes',
    gender: 'female',
    accent: 'American',
    tone: 'Vibrant & Cheerful',
  },
  {
    id: 'am_adam',
    name: 'Adam (Deep & Authoritative)',
    descriptor: 'Resonant, authoritative American male baritone ideal for history and nonfiction',
    gender: 'male',
    accent: 'American',
    tone: 'Resonant & Deep',
  },
  {
    id: 'am_michael',
    name: 'Michael (Natural & Friendly)',
    descriptor: 'Conversational, friendly American male narrator with smooth natural pacing',
    gender: 'male',
    accent: 'American',
    tone: 'Friendly & Conversational',
  },
  {
    id: 'bf_emma',
    name: 'Emma (Refined Classical)',
    descriptor: 'Sophisticated British female cadence with crisp diction for classical literature',
    gender: 'female',
    accent: 'British',
    tone: 'Refined & Literary',
  },
  {
    id: 'bm_george',
    name: 'George (Distinguished Baritone)',
    descriptor: 'Cultured, deep British male narrator with dramatic resonance for epic tales',
    gender: 'male',
    accent: 'British',
    tone: 'Distinguished & Resonant',
  },
];

export const KOKORO_STORAGE_KEYS = {
  SELECTED_VOICE: '@ai-book-reader/kokoro-voice',
  VOICE_SPEED: '@ai-book-reader/kokoro-speed',
} as const;

export class KokoroTtsService {
  getVoices(): KokoroVoiceProfile[] {
    return KOKORO_VOICES;
  }

  getVoiceById(id: string): KokoroVoiceProfile | undefined {
    return KOKORO_VOICES.find(v => v.id === id);
  }

  isValidVoice(id: string): id is KokoroVoiceId {
    return KOKORO_VOICES.some(v => v.id === id);
  }

  async getSelectedVoice(): Promise<KokoroVoiceId> {
    try {
      const stored = await AsyncStorage.getItem(KOKORO_STORAGE_KEYS.SELECTED_VOICE);
      if (stored && this.isValidVoice(stored)) {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'af_heart';
  }

  async saveSelectedVoice(voice: KokoroVoiceId): Promise<void> {
    await AsyncStorage.setItem(KOKORO_STORAGE_KEYS.SELECTED_VOICE, voice);
  }
}

export const kokoroTtsService = new KokoroTtsService();
