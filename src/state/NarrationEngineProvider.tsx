import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  initialNarrationSnapshot,
  narrationEngineService,
  type NarrationEngineSnapshot,
  type PerformanceMode,
  type VoiceTestResult,
} from '../services/narrationEngine';

type NarrationContextValue = {
  status: NarrationEngineSnapshot;
  result: VoiceTestResult | null;
  error: string | null;
  testNaturalVoice: (voiceId?: string, text?: string) => Promise<void>;
  testPhoneVoice: (text?: string) => Promise<void>;
  stop: () => Promise<void>;
  setPerformanceMode: (mode: PerformanceMode) => Promise<void>;
  refresh: () => Promise<void>;
};

const NarrationContext = createContext<NarrationContextValue | null>(null);

export function NarrationEngineProvider({children}: {children: React.ReactNode}) {
  const [status, setStatus] = useState(initialNarrationSnapshot);
  const [result, setResult] = useState<VoiceTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await narrationEngineService.getStatus());
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = narrationEngineService.subscribe(snapshot => {
      if (mounted) {
        setStatus(snapshot);
      }
    });
    refresh().catch(refreshError => {
      if (mounted) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'The voice engine could not be checked.',
        );
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refresh]);

  const test = useCallback(
    async (preferNatural: boolean, text?: string, voiceId?: string) => {
      setError(null);
      setResult(null);
      try {
        setResult(
          await narrationEngineService.test(preferNatural, text, voiceId),
        );
      } catch (testError) {
        const message =
          testError instanceof Error
            ? testError.message
            : 'The voice test failed.';
        if (!message.toLowerCase().includes('cancel')) {
          setError(message);
        }
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    await narrationEngineService.cancel();
    setStatus(current => ({
      ...current,
      state: 'idle',
      running: false,
      message: 'Voice test stopped',
    }));
  }, []);

  const setPerformanceMode = useCallback(async (mode: PerformanceMode) => {
    await narrationEngineService.setMode(mode);
    setStatus(current => ({...current, performanceMode: mode}));
  }, []);

  const value = useMemo<NarrationContextValue>(
    () => ({
      status,
      result,
      error,
      testNaturalVoice: (voiceId?: string, text?: string) =>
        test(
          true,
          typeof text === 'string' ? text : undefined,
          typeof voiceId === 'string' ? voiceId : undefined,
        ),
      testPhoneVoice: (text?: string) =>
        test(true, typeof text === 'string' ? text : undefined),
      stop,
      setPerformanceMode,
      refresh,
    }),
    [error, refresh, result, setPerformanceMode, status, stop, test],
  );

  return (
    <NarrationContext.Provider value={value}>
      {children}
    </NarrationContext.Provider>
  );
}

const defaultNarrationContextValue: NarrationContextValue = {
  status: initialNarrationSnapshot,
  result: null,
  error: null,
  testNaturalVoice: async () => {},
  testPhoneVoice: async () => {},
  stop: async () => {},
  setPerformanceMode: async () => {},
  refresh: async () => {},
};

export function useNarrationEngine() {
  const value = useContext(NarrationContext);
  return value ?? defaultNarrationContextValue;
}

export default NarrationEngineProvider;
