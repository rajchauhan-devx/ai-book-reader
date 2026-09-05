import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_VOICES,
  DEFAULT_EXPRESSIONS,
  defaultNarrationPreferences,
  narrationPipelineService,
} from '../src/services/narrationPipeline';

describe('narrationPipelineService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('returns default preferences when none are stored', async () => {
    const prefs = await narrationPipelineService.getPreferences();
    expect(prefs).toEqual(defaultNarrationPreferences);
  });

  it('saves and updates preferences in AsyncStorage', async () => {
    await narrationPipelineService.savePreferences({
      voiceId: 'clear',
      expression: 'expressive',
    });
    const updated = await narrationPipelineService.getPreferences();
    expect(updated).toEqual({
      voiceId: 'clear',
      expression: 'expressive',
    });
  });

  it('returns default curated voices and expressions when native is unavailable', async () => {
    const catalog = await narrationPipelineService.getCuratedVoices();
    expect(catalog.voices).toEqual(DEFAULT_VOICES);
    expect(catalog.expressions).toEqual(DEFAULT_EXPRESSIONS);
    expect(catalog.voices.some(v => v.id === 'warm' && v.isDefault)).toBe(true);
  });

  it('returns safe fallback chapter audio status when native is unavailable', async () => {
    const status = await narrationPipelineService.getChapterAudioStatus(
      'book-1',
      'ch-1',
    );
    expect(status).toEqual({
      readySegments: 0,
      totalSegments: 0,
      durationMs: 0,
      totalBytes: 0,
      isComplete: false,
    });
  });
});
