import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  edgeTtsService,
  EDGE_VOICES,
  EDGE_STORAGE_KEYS,
} from '../src/services/edgeTtsService';
import { narrationPipelineService } from '../src/services/narrationPipeline';

describe('EdgeTtsService & Narration Engine Modes', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('contains predefined Edge Neural voices with rich profiles', () => {
    expect(EDGE_VOICES.length).toBe(8);
    const ids = EDGE_VOICES.map(v => v.id);
    expect(ids).toContain('en-US-JennyNeural');
    expect(ids).toContain('en-US-GuyNeural');
    expect(ids).toContain('en-US-AriaNeural');
    expect(ids).toContain('en-US-ChristopherNeural');
    expect(ids).toContain('en-US-EmmaNeural');
    expect(ids).toContain('en-US-BrianNeural');
    expect(ids).toContain('en-US-AvaNeural');
    expect(ids).toContain('en-US-EricNeural');
  });

  test('validates voice IDs correctly', () => {
    expect(edgeTtsService.isValidVoice('en-US-JennyNeural')).toBe(true);
    expect(edgeTtsService.isValidVoice('en-US-GuyNeural')).toBe(true);
    expect(edgeTtsService.isValidVoice('invalid-voice')).toBe(false);
  });

  test('retrieves voice profile by ID', () => {
    const jenny = edgeTtsService.getVoiceById('en-US-JennyNeural');
    expect(jenny).toBeDefined();
    expect(jenny?.name).toContain('Jenny');
    expect(jenny?.gender).toBe('female');

    const guy = edgeTtsService.getVoiceById('en-US-GuyNeural');
    expect(guy).toBeDefined();
    expect(guy?.name).toContain('Guy');
    expect(guy?.gender).toBe('male');
  });

  test('reads and saves selected voice in AsyncStorage', async () => {
    expect(await edgeTtsService.getSelectedVoice()).toBe('en-US-JennyNeural');

    await edgeTtsService.saveSelectedVoice('en-US-GuyNeural');
    expect(await edgeTtsService.getSelectedVoice()).toBe('en-US-GuyNeural');
    expect(await AsyncStorage.getItem(EDGE_STORAGE_KEYS.EDGE_VOICE)).toBe('en-US-GuyNeural');
  });

  test('reads and saves engine mode in AsyncStorage', async () => {
    expect(await edgeTtsService.getEngineMode()).toBe('edge-cloud');

    await edgeTtsService.saveEngineMode('chatterbox-local');
    expect(await edgeTtsService.getEngineMode()).toBe('chatterbox-local');
    expect(await AsyncStorage.getItem(EDGE_STORAGE_KEYS.ENGINE_MODE)).toBe('chatterbox-local');
  });

  test('narrationPipelineService integrates edge-cloud and edgeVoice preferences', async () => {
    const prefs1 = await narrationPipelineService.getPreferences();
    expect(prefs1.engineMode).toBe('edge-cloud');
    expect(prefs1.edgeVoice).toBe('en-US-JennyNeural');

    const updated = await narrationPipelineService.savePreferences({
      engineMode: 'chatterbox-local',
      edgeVoice: 'en-US-ChristopherNeural',
    });
    expect(updated.engineMode).toBe('chatterbox-local');
    expect(updated.edgeVoice).toBe('en-US-ChristopherNeural');

    const prefs2 = await narrationPipelineService.getPreferences();
    expect(prefs2.engineMode).toBe('chatterbox-local');
    expect(prefs2.edgeVoice).toBe('en-US-ChristopherNeural');
  });
});
