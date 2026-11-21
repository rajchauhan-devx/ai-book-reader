import {
  MODEL_PACK_BYTES,
  formatDownloadBytes,
  normalizeModelDownloadSnapshot,
} from '../src/services/modelDownload';

describe('model download status', () => {
  it('normalizes native progress into safe UI values', () => {
    expect(
      normalizeModelDownloadSnapshot({
        state: 'downloading',
        progress: 1.5,
        downloadedBytes: MODEL_PACK_BYTES + 100,
        totalBytes: MODEL_PACK_BYTES,
        message: 'Downloading voice files',
      }),
    ).toEqual({
      state: 'downloading',
      progress: 1,
      downloadedBytes: MODEL_PACK_BYTES,
      totalBytes: MODEL_PACK_BYTES,
      message: 'Downloading voice files',
      supported: true,
      availableBytes: 0,
      memoryBytes: 0,
      packVersion: 'kokoro-v1.0-onnx',
    });
  });

  it('rejects unknown native states without crashing the UI', () => {
    expect(
      normalizeModelDownloadSnapshot({state: 'mystery'}).state,
    ).toBe('failed');
  });

  it('formats the model size for the progress screen', () => {
    expect(formatDownloadBytes(MODEL_PACK_BYTES)).toBe('84 MB');
  });
});
