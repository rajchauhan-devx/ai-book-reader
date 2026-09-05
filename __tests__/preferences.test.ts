import AsyncStorage from '@react-native-async-storage/async-storage';
import {preferencesRepository} from '../src/services/preferences';

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('uses system theme until the user chooses another theme', async () => {
  expect(await preferencesRepository.getTheme()).toBe('system');

  await preferencesRepository.setTheme('dark');

  expect(await preferencesRepository.getTheme()).toBe('dark');
});

test('persists first launch completion', async () => {
  expect(await preferencesRepository.hasCompletedOnboarding()).toBe(false);

  await preferencesRepository.completeOnboarding();

  expect(await preferencesRepository.hasCompletedOnboarding()).toBe(true);
});

