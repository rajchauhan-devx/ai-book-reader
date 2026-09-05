import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReaderFontFamily = 'serif' | 'sans';

export type ReaderPreferences = {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
};

const storageKey = '@ai-book-reader/reader-appearance';

export const defaultReaderPreferences: ReaderPreferences = {
  fontFamily: 'serif',
  fontSize: 20,
  lineHeight: 1.7,
};

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultReaderPreferences;
  }
  const record = value as Record<string, unknown>;
  const fontSize =
    typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)
      ? Math.round(record.fontSize)
      : defaultReaderPreferences.fontSize;
  const lineHeight =
    typeof record.lineHeight === 'number' && Number.isFinite(record.lineHeight)
      ? Math.round(record.lineHeight * 10) / 10
      : defaultReaderPreferences.lineHeight;
  return {
    fontFamily: record.fontFamily === 'sans' ? 'sans' : 'serif',
    fontSize: Math.min(28, Math.max(16, fontSize)),
    lineHeight: Math.min(2, Math.max(1.4, lineHeight)),
  };
}

export const readerPreferencesRepository = {
  async get(): Promise<ReaderPreferences> {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return defaultReaderPreferences;
    try {
      return normalizeReaderPreferences(JSON.parse(raw));
    } catch {
      return defaultReaderPreferences;
    }
  },

  async set(value: ReaderPreferences): Promise<ReaderPreferences> {
    const normalized = normalizeReaderPreferences(value);
    await AsyncStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  },
};
