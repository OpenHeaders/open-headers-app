import { useCallback } from 'react';
import type { RefreshOptions, Source, SourceUpdate } from '../../../types/source';
import { showMessage } from '../../utils';
import { createLogger } from '../../utils/error-handling/logger';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';

const log = createLogger('useSources');

interface UseSourcesReturn {
  sources: Source[];
  addSource: (sourceData: Source) => Promise<Source | null>;
  updateSource: (sourceId: string, updates: SourceUpdate) => Promise<Source | null>;
  removeSource: (sourceId: string) => Promise<boolean>;
  updateSourceContent: (sourceId: string, content: string) => Promise<boolean>;
  importSources: (newSources: Source[], replace?: boolean) => Promise<boolean>;
  refreshSource: (sourceId: string) => Promise<boolean>;
  updateRefreshOptions: (sourceId: string, options: RefreshOptions) => Promise<boolean>;
  exportSources: () => Source[];
  shouldSuppressBroadcast: (sourcesToCheck: Source[]) => boolean;
}

/**
 * Hook for source management — all mutations go through main process via IPC.
 */
export function useSources(): UseSourcesReturn {
  const { sources, service, isWorkspaceSwitching } = useCentralizedWorkspace();

  const addSource = useCallback(
    async (sourceData: Source): Promise<Source | null> => {
      try {
        return await service.addSource(sourceData);
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [service],
  );

  const updateSource = useCallback(
    async (sourceId: string, updates: SourceUpdate): Promise<Source | null> => {
      try {
        return await service.updateSource(sourceId, updates);
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [service],
  );

  const removeSource = useCallback(
    async (sourceId: string): Promise<boolean> => {
      try {
        await service.removeSource(sourceId);
        showMessage('success', 'Source removed');
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const updateSourceContent = useCallback(
    async (sourceId: string, content: string): Promise<boolean> => {
      try {
        await service.updateSourceContent(sourceId, content);
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const importSources = useCallback(
    async (newSources: Source[], replace: boolean = false): Promise<boolean> => {
      try {
        await service.importSources(newSources, replace);
        showMessage('success', `Imported ${newSources.length} sources`);
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const refreshSource = useCallback(
    async (sourceId: string): Promise<boolean> => {
      try {
        const result = await service.refreshSource(sourceId);
        if (result) {
          showMessage('success', 'Source refreshed');
        }
        return result;
      } catch (error: unknown) {
        showMessage('error', `Failed to refresh source: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    [service],
  );

  const updateRefreshOptions = useCallback(
    async (sourceId: string, options: RefreshOptions): Promise<boolean> => {
      try {
        await service.updateSource(sourceId, { refreshOptions: options });
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const exportSources = useCallback((): Source[] => {
    return sources;
  }, [sources]);

  const shouldSuppressBroadcast = useCallback(
    (_sourcesToCheck: Source[]): boolean => {
      if (isWorkspaceSwitching) {
        log.debug('Suppressing broadcast during workspace switch');
        return true;
      }
      return false;
    },
    [isWorkspaceSwitching],
  );

  return {
    sources,
    addSource,
    updateSource,
    removeSource,
    updateSourceContent,
    importSources,
    refreshSource,
    updateRefreshOptions,
    exportSources,
    shouldSuppressBroadcast,
  };
}
