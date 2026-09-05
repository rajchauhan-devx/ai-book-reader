import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  initialModelDownloadSnapshot,
  modelDownloadService,
  type ModelDownloadSnapshot,
} from '../services/modelDownload';
import {narrationEngineService} from '../services/narrationEngine';

type ModelDownloadContextValue = {
  status: ModelDownloadSnapshot;
  startDownload: (wifiOnly: boolean) => Promise<void>;
  pauseDownload: () => Promise<void>;
  removeModel: () => Promise<void>;
  refresh: () => Promise<void>;
};

const ModelDownloadContext = createContext<ModelDownloadContextValue | null>(
  null,
);

export function ModelDownloadProvider({children}: {children: React.ReactNode}) {
  const [status, setStatus] = useState(initialModelDownloadSnapshot);

  const refresh = useCallback(async () => {
    setStatus(await modelDownloadService.getStatus());
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = modelDownloadService.subscribe(snapshot => {
      if (mounted) {
        setStatus(snapshot);
      }
    });

    refresh()
      .catch(error => {
        if (mounted) {
          setStatus(current => ({
            ...current,
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'The voice status could not be checked.',
          }));
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refresh]);

  const startDownload = useCallback(async (wifiOnly: boolean) => {
    setStatus(current => ({
      ...current,
      state: 'checking',
      message: 'Checking connection and storage',
    }));
    try {
      await modelDownloadService.start(wifiOnly);
    } catch (error) {
      setStatus(current => ({
        ...current,
        state: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'The voice download could not be started.',
      }));
    }
  }, []);

  const pauseDownload = useCallback(async () => {
    await modelDownloadService.pause();
  }, []);

  const removeModel = useCallback(async () => {
    await narrationEngineService.unload();
    await modelDownloadService.remove();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({status, startDownload, pauseDownload, removeModel, refresh}),
    [pauseDownload, refresh, removeModel, startDownload, status],
  );

  return (
    <ModelDownloadContext.Provider value={value}>
      {children}
    </ModelDownloadContext.Provider>
  );
}

export function useModelDownload() {
  const value = useContext(ModelDownloadContext);
  if (!value) {
    throw new Error('useModelDownload must be used inside ModelDownloadProvider');
  }
  return value;
}
