import {useCallback} from 'react';
import {useCentralizedWorkspace} from '../useCentralizedWorkspace';
import {showMessage} from '../../utils';
import type { Source, RefreshOptions } from '../../../types/source';

import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useSources');


interface UseSourcesReturn {
  sources: Source[];
  addSource: (sourceData: Source) => Promise<Source | null>;
  updateSource: (sourceId: string, updates: Partial<Source>) => Promise<Source | null>;
  removeSource: (sourceId: string) => Promise<boolean>;
  updateSourceContent: (sourceId: string, content: string) => Promise<boolean>;
  importSources: (newSources: Source[], replace?: boolean) => Promise<boolean>;
  refreshSource: (sourceId: string) => Promise<boolean>;
  updateRefreshOptions: (sourceId: string, options: RefreshOptions) => Promise<boolean>;
  exportSources: () => Source[];
  shouldSuppressBroadcast: (sourcesToCheck: Source[]) => boolean;
}

/**
 * Hook for source management
 */
export function useSources(): UseSourcesReturn {
  const { sources, service, isWorkspaceSwitching } = useCentralizedWorkspace();

  const addSource = useCallback(async (sourceData: Source): Promise<Source | null> => {
    try {
      return await service.addSource(sourceData);
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [service]);

  const updateSource = useCallback(async (sourceId: string, updates: Partial<Source>): Promise<Source | null> => {
    try {
      log.debug('updateSource called', { sourceId, updates });
      const updatedSource: Source | null = await service.updateSource(sourceId, updates);
      log.debug('updateSource returning', {
        sourceId,
        updatedSource: !!updatedSource,
        sourceIdReturned: updatedSource?.sourceId
      });
      return updatedSource;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [service]);

  const removeSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      await service.removeSource(sourceId);
      showMessage('success', 'Source removed');
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const updateSourceContent = useCallback(async (sourceId: string, content: string): Promise<boolean> => {
    try {
      await service.updateSourceContent(sourceId, content);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const importSources = useCallback(async (newSources: Source[], replace: boolean = false): Promise<boolean> => {
    try {
      if (replace) {
        service.setState({ sources: newSources }, ['sources']);
      } else {
        const currentSources = service.getState().sources;
        const merged = [...currentSources, ...newSources];
        service.setState({ sources: merged }, ['sources']);
      }
      showMessage('success', `Imported ${newSources.length} sources`);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const refreshSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      const currentSources = service.getState().sources;
      const source = currentSources.find((s) => s.sourceId === sourceId);
      if (!source) {
        log.error(`Source with ID ${sourceId} not found. Available sources:`, currentSources.map((s) => ({ id: s.sourceId, type: s.sourceType, path: s.sourcePath })));
        throw new Error(`Source with ID ${sourceId} not found. It may still be saving.`);
      }

      if (source.sourceType === 'file') {
        const content = await window.electronAPI.readFile(source.sourcePath || '');
        await service.updateSourceContent(sourceId, String(content));
        showMessage('success', 'Source refreshed');
      } else if (source.sourceType === 'http') {
        log.debug('HTTP source refresh should be handled by component with useHttp access');
        return true;
      } else if (source.sourceType === 'env') {
        const value = await window.electronAPI.getEnvVariable(source.sourcePath || '');
        await service.updateSourceContent(sourceId, value || '');
        showMessage('success', 'Source refreshed');
      }

      return true;
    } catch (error: unknown) {
      showMessage('error', `Failed to refresh source: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [service]);

  const updateRefreshOptions = useCallback(async (sourceId: string, options: RefreshOptions): Promise<boolean> => {
    try {
      await service.updateSource(sourceId, { refreshOptions: options });
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const exportSources = useCallback((): Source[] => {
    return sources;
  }, [sources]);

  const shouldSuppressBroadcast = useCallback((_sourcesToCheck: Source[]): boolean => {
    if (isWorkspaceSwitching) {
      log.debug('Suppressing broadcast during workspace switch');
      return true;
    }
    return false;
  }, [isWorkspaceSwitching]);

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
    shouldSuppressBroadcast
  };
}
