import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  defaultReaderPreferences,
  normalizeReaderPreferences,
  readerPreferencesRepository,
} from '../src/services/readerPreferences';

describe('reader appearance preferences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bounds unsafe or stale stored values', () => {
    expect(
      normalizeReaderPreferences({
        fontFamily: 'unknown',
        fontSize: 200,
        lineHeight: 0.2,
      }),
    ).toEqual({ fontFamily: 'serif', fontSize: 28, lineHeight: 1.4 });
    expect(normalizeReaderPreferences(null)).toEqual(defaultReaderPreferences);
  });

  it('loads defaults for damaged JSON and persists normalized values', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{damaged');
    await expect(readerPreferencesRepository.get()).resolves.toEqual(
      defaultReaderPreferences,
    );
    await expect(
      readerPreferencesRepository.set({
        fontFamily: 'sans',
        fontSize: 23.6,
        lineHeight: 1.84,
      }),
    ).resolves.toEqual({ fontFamily: 'sans', fontSize: 24, lineHeight: 1.8 });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ai-book-reader/reader-appearance',
      JSON.stringify({ fontFamily: 'sans', fontSize: 24, lineHeight: 1.8 }),
    );
  });
});
