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
      voiceId: 'af_sarah',
      expression: 'expressive',
    });
    const updated = await narrationPipelineService.getPreferences();
    expect(updated).toEqual({
      ...defaultNarrationPreferences,
      voiceId: 'af_sarah',
      expression: 'expressive',
    });
  });

  it('returns default curated voices and expressions when native is unavailable', async () => {
    const catalog = await narrationPipelineService.getCuratedVoices();
    expect(catalog.voices).toEqual(DEFAULT_VOICES);
    expect(catalog.expressions).toEqual(DEFAULT_EXPRESSIONS);
    expect(catalog.voices.some(v => v.id === 'af_heart' && v.isDefault)).toBe(true);
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

  describe('custom reference voice methods', () => {
    it('throws or returns safe fallback when native is unavailable', async () => {
      const picked = await narrationPipelineService.pickReferenceAudio();
      expect(picked).toBeNull();
      await expect(
        narrationPipelineService.importCustomVoice('content://dummy', 'My Voice'),
      ).rejects.toThrow('Custom voice import is not available.');
      const deleted = await narrationPipelineService.deleteCustomVoice('non-existent');
      expect(deleted).toBe(false);
    });

    it('delegates to NativeModules.NarrationEngine when available', async () => {
      let isolatedPipeline: typeof import('../src/services/narrationPipeline');
      const mockPickReferenceAudio = jest.fn().mockResolvedValue({
        uri: 'content://audio/123',
        name: 'sample.mp3',
        size: 102400,
      });
      const mockImportCustomVoice = jest.fn().mockResolvedValue({
        id: 'voice_123',
        name: 'My Custom Voice',
        descriptor: 'Cloned reference voice (4.5s)',
        engine: 'natural',
        isDefault: false,
        isCustom: true,
        sampleDurationSec: 4.5,
      });
      const mockDeleteCustomVoice = jest.fn().mockResolvedValue(true);

      jest.isolateModules(() => {
        const { NativeModules } = require('react-native');
        NativeModules.NarrationEngine = {
          addListener: jest.fn(),
          removeListeners: jest.fn(),
          pickReferenceAudio: mockPickReferenceAudio,
          importCustomVoice: mockImportCustomVoice,
          deleteCustomVoice: mockDeleteCustomVoice,
          getCuratedVoices: jest.fn().mockResolvedValue({
            voices: [
              {
                id: 'voice_123',
                name: 'My Custom Voice',
                descriptor: 'Cloned reference voice (4.5s)',
                engine: 'natural',
                isDefault: false,
                isCustom: true,
                sampleDurationSec: 4.5,
              },
            ],
            expressions: [],
          }),
        };
        isolatedPipeline = require('../src/services/narrationPipeline');
      });

      // Test pickReferenceAudio
      const picked = await isolatedPipeline!.narrationPipelineService.pickReferenceAudio();
      expect(mockPickReferenceAudio).toHaveBeenCalledTimes(1);
      expect(picked).toEqual({
        uri: 'content://audio/123',
        name: 'sample.mp3',
        size: 102400,
      });

      // Test importCustomVoice
      const imported = await isolatedPipeline!.narrationPipelineService.importCustomVoice(
        'content://audio/123',
        'My Custom Voice',
      );
      expect(mockImportCustomVoice).toHaveBeenCalledWith('content://audio/123', 'My Custom Voice');
      expect(imported.isCustom).toBe(true);
      expect(imported.id).toBe('voice_123');
      expect(imported.sampleDurationSec).toBe(4.5);

      // Test deleteCustomVoice
      const deleted = await isolatedPipeline!.narrationPipelineService.deleteCustomVoice('voice_123');
      expect(mockDeleteCustomVoice).toHaveBeenCalledWith('voice_123');
      expect(deleted).toBe(true);
    });
  });
});

