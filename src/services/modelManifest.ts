export const MODEL_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ModelArtifactRole =
  | 'tokenizer'
  | 'text-encoder'
  | 'speech-encoder'
  | 'language-model'
  | 'decoder'
  | 'vocoder'
  | 'watermarker'
  | 'voice'
  | 'license'
  | 'runtime-config';

export type ModelArtifact = {
  path: string;
  bytes: number;
  sha256: string;
  role: ModelArtifactRole;
};

export type ModelManifest = {
  schemaVersion: typeof MODEL_MANIFEST_SCHEMA_VERSION;
  id: string;
  version: string;
  displayName: string;
  variant: 'nano';
  languageTags: string[];
  runtime: {
    id: 'onnxruntime' | 'chatterboxcpp';
    minimumVersion: string;
    entryManifest: string;
    supportedAbis: ('arm64-v8a' | 'x86_64')[];
  };
  compatibility: {
    minimumAppVersion: string;
    minimumAndroidApi: number;
    minimumRamBytes: number;
    recommendedRamBytes: number;
    requiredFreeBytes: number;
  };
  artifacts: ModelArtifact[];
};

const sha256Pattern = /^[a-f0-9]{64}$/;
const safePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/;
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const artifactRoles = new Set<ModelArtifactRole>([
  'tokenizer',
  'text-encoder',
  'speech-encoder',
  'language-model',
  'decoder',
  'vocoder',
  'watermarker',
  'voice',
  'license',
  'runtime-config',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function parseModelManifest(value: unknown): ModelManifest {
  if (!isObject(value)) {
    throw new Error('Model manifest must be an object.');
  }
  if (value.schemaVersion !== MODEL_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Unsupported model manifest schema.');
  }
  if (!hasString(value.id) || !hasString(value.displayName)) {
    throw new Error('Model manifest identity is missing.');
  }
  if (!hasString(value.version) || !versionPattern.test(value.version)) {
    throw new Error('Model manifest version is invalid.');
  }
  if (value.variant !== 'nano') {
    throw new Error('Only the Chatterbox Nano variant is supported in the first pack.');
  }
  if (!Array.isArray(value.languageTags) || value.languageTags.length === 0 || !value.languageTags.every(hasString)) {
    throw new Error('At least one model language is required.');
  }

  const runtime = value.runtime;
  if (
    !isObject(runtime) ||
    (runtime.id !== 'onnxruntime' && runtime.id !== 'chatterboxcpp') ||
    !hasString(runtime.minimumVersion) ||
    !hasString(runtime.entryManifest) ||
    !safePathPattern.test(runtime.entryManifest) ||
    !Array.isArray(runtime.supportedAbis) ||
    runtime.supportedAbis.length === 0 ||
    !runtime.supportedAbis.every(abi => abi === 'arm64-v8a' || abi === 'x86_64')
  ) {
    throw new Error('Model runtime configuration is invalid.');
  }

  const compatibility = value.compatibility;
  if (
    !isObject(compatibility) ||
    !hasString(compatibility.minimumAppVersion) ||
    !versionPattern.test(compatibility.minimumAppVersion) ||
    !Number.isInteger(compatibility.minimumAndroidApi) ||
    !Number.isSafeInteger(compatibility.minimumRamBytes) ||
    !Number.isSafeInteger(compatibility.recommendedRamBytes) ||
    !Number.isSafeInteger(compatibility.requiredFreeBytes) ||
    (compatibility.minimumAndroidApi as number) < 23 ||
    (compatibility.minimumRamBytes as number) <= 0 ||
    (compatibility.recommendedRamBytes as number) < (compatibility.minimumRamBytes as number) ||
    (compatibility.requiredFreeBytes as number) <= 0
  ) {
    throw new Error('Model compatibility requirements are invalid.');
  }

  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    throw new Error('Model manifest has no artifacts.');
  }

  const seenPaths = new Set<string>();
  for (const artifact of value.artifacts) {
    if (
      !isObject(artifact) ||
      !hasString(artifact.path) ||
      !safePathPattern.test(artifact.path) ||
      !Number.isSafeInteger(artifact.bytes) ||
      (artifact.bytes as number) <= 0 ||
      !hasString(artifact.sha256) ||
      !sha256Pattern.test(artifact.sha256) ||
      !artifactRoles.has(artifact.role as ModelArtifactRole)
    ) {
      throw new Error('Model manifest contains an invalid artifact.');
    }
    if (seenPaths.has(artifact.path)) {
      throw new Error(`Model manifest repeats artifact path: ${artifact.path}`);
    }
    seenPaths.add(artifact.path);
  }

  if (!seenPaths.has(runtime.entryManifest as string)) {
    throw new Error('Runtime entry manifest is not included in the artifacts.');
  }

  return value as ModelManifest;
}

export function getModelDownloadBytes(manifest: ModelManifest): number {
  return manifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
}

