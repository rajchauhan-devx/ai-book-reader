import {getModelDownloadBytes, parseModelManifest} from '../src/services/modelManifest';

const checksum = 'a'.repeat(64);

function validManifest() {
  return {
    schemaVersion: 1,
    id: 'kokoro-v1-en',
    version: '1.0.0',
    displayName: 'Kokoro Natural English',
    variant: 'kokoro',
    languageTags: ['en'],
    runtime: {
      id: 'onnxruntime',
      minimumVersion: '1.24.0',
      entryManifest: 'runtime/kokoro.json',
      supportedAbis: ['arm64-v8a'],
    },
    compatibility: {
      minimumAppVersion: '0.1.0',
      minimumAndroidApi: 29,
      minimumRamBytes: 2_000_000_000,
      recommendedRamBytes: 4_000_000_000,
      requiredFreeBytes: 500_000_000,
    },
    artifacts: [
      {path: 'runtime/kokoro.json', bytes: 1024, sha256: checksum, role: 'runtime-config'},
      {path: 'models/kokoro-v1.0.onnx', bytes: 2048, sha256: checksum, role: 'language-model'},
    ],
  };
}

test('accepts a valid Kokoro pack manifest', () => {
  const manifest = parseModelManifest(validManifest());
  expect(manifest.id).toBe('kokoro-v1-en');
  expect(getModelDownloadBytes(manifest)).toBe(3072);
});

test('rejects parent-directory paths', () => {
  const manifest = validManifest();
  manifest.artifacts[1].path = '../outside/model.onnx';
  expect(() => parseModelManifest(manifest)).toThrow('invalid artifact');
});

test('rejects artifacts with an invalid checksum', () => {
  const manifest = validManifest();
  manifest.artifacts[1].sha256 = 'not-a-checksum';
  expect(() => parseModelManifest(manifest)).toThrow('invalid artifact');
});

test('rejects a pack missing its runtime entry manifest', () => {
  const manifest = validManifest();
  manifest.runtime.entryManifest = 'runtime/missing.json';
  expect(() => parseModelManifest(manifest)).toThrow('Runtime entry manifest is not included');
});

