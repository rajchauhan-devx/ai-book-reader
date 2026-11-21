import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  kokoroTtsService,
  KOKORO_VOICES,
  KOKORO_STORAGE_KEYS,
  type KokoroVoiceId,
} from '../src/services/kokoroTtsService';
import { narrationPipelineService } from '../src/services/narrationPipeline';

describe('KokoroTtsService & Offline Voice Catalog', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('contains predefined Kokoro offline neural voices with distinct personas', () => {
    expect(KOKORO_VOICES.length).toBe(9);
    const ids = KOKORO_VOICES.map(v => v.id);
    expect(ids).toContain('af_heart');
    expect(ids).toContain('af_bella');
    expect(ids).toContain('af_sarah');
    expect(ids).toContain('af_nicole');
    expect(ids).toContain('af_sky');
    expect(ids).toContain('am_adam');
    expect(ids).toContain('am_michael');
    expect(ids).toContain('bf_emma');
    expect(ids).toContain('bm_george');
  });

  test('validates Kokoro voice IDs correctly', () => {
    expect(kokoroTtsService.isValidVoice('af_heart')).toBe(true);
    expect(kokoroTtsService.isValidVoice('af_bella')).toBe(true);
    expect(kokoroTtsService.isValidVoice('am_adam')).toBe(true);
    expect(kokoroTtsService.isValidVoice('invalid-voice')).toBe(false);
  });

  test('retrieves voice profile by ID', () => {
    const heart = kokoroTtsService.getVoiceById('af_heart');
    expect(heart).toBeDefined();
    expect(heart?.name).toContain('Heart');
    expect(heart?.gender).toBe('female');
    expect(heart?.accent).toBe('American');

    const bella = kokoroTtsService.getVoiceById('af_bella');
    expect(bella).toBeDefined();
    expect(bella?.name).toContain('Bella');
    expect(bella?.gender).toBe('female');
    expect(bella?.accent).toBe('American');

    const george = kokoroTtsService.getVoiceById('bm_george');
    expect(george).toBeDefined();
    expect(george?.name).toContain('George');
    expect(george?.gender).toBe('male');
    expect(george?.accent).toBe('British');
  });

  test('reads and saves selected voice in AsyncStorage', async () => {
    expect(await kokoroTtsService.getSelectedVoice()).toBe('af_heart');

    await kokoroTtsService.saveSelectedVoice('am_adam');
    expect(await kokoroTtsService.getSelectedVoice()).toBe('am_adam');
    expect(await AsyncStorage.getItem(KOKORO_STORAGE_KEYS.SELECTED_VOICE)).toBe('am_adam');
  });

  test('narrationPipelineService integrates Kokoro offline preferences', async () => {
    const prefs1 = await narrationPipelineService.getPreferences();
    expect(prefs1.voiceId).toBe('af_heart');

    const updated = await narrationPipelineService.savePreferences({
      voiceId: 'bf_emma',
    });
    expect(updated.voiceId).toBe('bf_emma');

    const prefs2 = await narrationPipelineService.getPreferences();
    expect(prefs2.voiceId).toBe('bf_emma');
  });
});
