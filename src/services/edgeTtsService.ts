import AsyncStorage from '@react-native-async-storage/async-storage';

export type NarrationEngineMode = 'edge-cloud' | 'chatterbox-local';

export type EdgeVoiceId =
  | 'en-US-JennyNeural'
  | 'en-US-GuyNeural'
  | 'en-US-AriaNeural'
  | 'en-US-ChristopherNeural'
  | 'en-US-EmmaNeural'
  | 'en-US-BrianNeural'
  | 'en-US-AvaNeural'
  | 'en-US-EricNeural';

export type EdgeVoiceProfile = {
  id: EdgeVoiceId;
  name: string;
  descriptor: string;
  gender: 'male' | 'female';
  tone: string;
};

export const EDGE_VOICES: EdgeVoiceProfile[] = [
  {
    id: 'en-US-JennyNeural',
    name: 'Jenny (Warm & Natural)',
    descriptor: 'Versatile, expressive, warm voice ideal for general fiction and storytelling',
    gender: 'female',
    tone: 'Warm & Expressive',
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Guy (Engaging & Clear)',
    descriptor: 'Crisp, friendly narrator with balanced pacing and exceptional clarity',
    gender: 'male',
    tone: 'Friendly & Engaging',
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Aria (Deep & Cinematic)',
    descriptor: 'Rich, articulate cadence designed for literature and dramatic reading',
    gender: 'female',
    tone: 'Articulate & Cinematic',
  },
  {
    id: 'en-US-ChristopherNeural',
    name: 'Christopher (Authoritative & Deep)',
    descriptor: 'Rich baritone cadence ideal for history, nonfiction, and epic tales',
    gender: 'male',
    tone: 'Authoritative & Resonant',
  },
  {
    id: 'en-US-EmmaNeural',
    name: 'Emma (Bright & Friendly)',
    descriptor: 'Clear, animated, cheerful cadence great for dialogue and light reads',
    gender: 'female',
    tone: 'Cheerful & Bright',
  },
  {
    id: 'en-US-BrianNeural',
    name: 'Brian (Refined & Classical)',
    descriptor: 'Sophisticated cadence with exceptional diction and literary depth',
    gender: 'male',
    tone: 'Refined & Sophisticated',
  },
  {
    id: 'en-US-AvaNeural',
    name: 'Ava (Modern & Expressive)',
    descriptor: 'Natural conversational flow with nuanced phrasing and warmth',
    gender: 'female',
    tone: 'Conversational & Fluid',
  },
  {
    id: 'en-US-EricNeural',
    name: 'Eric (Dynamic & Direct)',
    descriptor: 'Energetic, confident cadence suited for thrillers and fast-paced scenes',
    gender: 'male',
    tone: 'Energetic & Bold',
  },
];

export const EDGE_STORAGE_KEYS = {
  ENGINE_MODE: '@ai-book-reader/engine-mode',
  EDGE_VOICE: '@ai-book-reader/edge-voice',
  CHATTERBOX_CHARACTER: '@ai-book-reader/chatterbox-character',
};

export class EdgeTtsService {
  getVoices(): EdgeVoiceProfile[] {
    return EDGE_VOICES;
  }

  getVoiceById(id: string): EdgeVoiceProfile | undefined {
    return EDGE_VOICES.find(v => v.id === id);
  }

  isValidVoice(id: string): id is EdgeVoiceId {
    return EDGE_VOICES.some(v => v.id === id);
  }

  async getSelectedVoice(): Promise<EdgeVoiceId> {
    try {
      const stored = await AsyncStorage.getItem(EDGE_STORAGE_KEYS.EDGE_VOICE);
      if (stored && this.isValidVoice(stored)) {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'en-US-JennyNeural';
  }

  async saveSelectedVoice(voice: EdgeVoiceId): Promise<void> {
    await AsyncStorage.setItem(EDGE_STORAGE_KEYS.EDGE_VOICE, voice);
  }

  async getEngineMode(): Promise<NarrationEngineMode> {
    try {
      const stored = await AsyncStorage.getItem(EDGE_STORAGE_KEYS.ENGINE_MODE);
      if (stored === 'chatterbox-local' || stored === 'edge-cloud') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'edge-cloud';
  }

  async saveEngineMode(mode: NarrationEngineMode): Promise<void> {
    await AsyncStorage.setItem(EDGE_STORAGE_KEYS.ENGINE_MODE, mode);
  }
}

export const edgeTtsService = new EdgeTtsService();
