import AsyncStorage from '@react-native-async-storage/async-storage';
import type {PreferencesRepository} from './contracts';
import type {ThemePreference} from '../theme/tokens';

const keys = {
  theme: '@ai-book-reader/theme',
  onboarding: '@ai-book-reader/onboarding-complete',
} as const;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

class AsyncPreferencesRepository implements PreferencesRepository {
  async getTheme(): Promise<ThemePreference> {
    const value = await AsyncStorage.getItem(keys.theme);
    return isThemePreference(value) ? value : 'system';
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    await AsyncStorage.setItem(keys.theme, theme);
  }

  async hasCompletedOnboarding(): Promise<boolean> {
    return (await AsyncStorage.getItem(keys.onboarding)) === 'true';
  }

  async completeOnboarding(): Promise<void> {
    await AsyncStorage.setItem(keys.onboarding, 'true');
  }
}

export const preferencesRepository: PreferencesRepository =
  new AsyncPreferencesRepository();

