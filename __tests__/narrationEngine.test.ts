import {
  normalizeNarrationSnapshot,
  normalizeVoiceTestResult,
} from '../src/services/narrationEngine';

describe('narration engine bridge values', () => {
  it('clamps progress and accepts supported engine states', () => {
    expect(
      normalizeNarrationSnapshot({
        state: 'generating',
        progress: 4,
        message: 'Creating speech',
        performanceMode: 'quality',
        modelInstalled: true,
        running: true,
        engine: 'natural',
        batteryPercent: 88,
        thermalStatus: 0,
      }),
    ).toEqual({
      state: 'generating',
      progress: 1,
      message: 'Creating speech',
      performanceMode: 'quality',
      modelInstalled: true,
      running: true,
      engine: 'natural',
      batteryPercent: 88,
      thermalStatus: 0,
    });
  });

  it('keeps a natural voice test result and its local timing', () => {
    expect(
      normalizeVoiceTestResult({
        engine: 'natural',
        audioPath: '/private/test.wav',
        durationMs: 2100,
        generationMs: 4200,
        realtimeFactor: 2,
        message: 'Generated locally',
      }),
    ).toMatchObject({
      engine: 'natural',
      durationMs: 2100,
      generationMs: 4200,
      realtimeFactor: 2,
      fallbackReason: null,
    });
  });
});
