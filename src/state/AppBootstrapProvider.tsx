import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {preferencesRepository} from '../services/preferences';

type AppBootstrapContextValue = {
  ready: boolean;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
};

const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(null);

export function AppBootstrapProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    preferencesRepository
      .hasCompletedOnboarding()
      .then(completed => {
        if (mounted) {
          setHasCompletedOnboarding(completed);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await preferencesRepository.completeOnboarding();
    setHasCompletedOnboarding(true);
  }, []);

  const value = useMemo(
    () => ({ready, hasCompletedOnboarding, completeOnboarding}),
    [completeOnboarding, hasCompletedOnboarding, ready],
  );

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
}

export function useAppBootstrap() {
  const value = useContext(AppBootstrapContext);
  if (!value) {
    throw new Error('useAppBootstrap must be used inside AppBootstrapProvider');
  }
  return value;
}
