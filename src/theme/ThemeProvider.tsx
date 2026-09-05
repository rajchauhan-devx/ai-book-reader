import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {useColorScheme} from 'react-native';
import {preferencesRepository} from '../services/preferences';
import {
  AppColors,
  darkColors,
  lightColors,
  ThemePreference,
} from './tokens';

type AppThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({children}: {children: React.ReactNode}) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    let mounted = true;
    preferencesRepository
      .getTheme()
      .then(savedTheme => {
        if (mounted) {
          setPreference(savedTheme);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const updatePreference = useCallback((nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    preferencesRepository.setTheme(nextPreference).catch(() => undefined);
  }, []);

  const isDark =
    preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo(
    () => ({colors, isDark, preference, setPreference: updatePreference}),
    [colors, isDark, preference, updatePreference],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return value;
}
