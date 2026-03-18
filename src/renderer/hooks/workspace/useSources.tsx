import {useCallback} from 'react';
import {useCentralizedWorkspace} from '../useCentralizedWorkspace';
import {showMessage} from '../../utils';

import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useSources');

export interface SourceData {
  sourceId: string;
  sourceType: string;
  sourcePath?: string;
  sourceMethod?: string;
  sourceName?: string;
  sourceTag?: string;
  sourceContent?: string;
  requestOptions?: Record<string, unknown>;
  jsonFilter?: {
    enabled: boolean;
    path?: string;
    [key: string]: unknown;
  };
  refreshOptions?: RefreshOptions;
  activationState?: string;
  missingDependencies?: string[];
  createdAt?: string;
  isFiltered?: boolean;
  filteredWith?: string | null;
  needsInitialFetch?: boolean;
  originalResponse?: string | null;
  [key: string]: unknown;
}

interface RefreshOptions {
  enabled?: boolean;
  interval?: number;
  [key: string]: unknown;
}

interface UseSourcesReturn {
  sources: SourceData[];
  addSource: (sourceData: Record<string, unknown>) => Promise<SourceData | null>;
  updateSource: (sourceId: string, updates: Record<string, unknown>) => Promise<SourceData | null>;
  removeSource: (sourceId: string) => Promise<boolean>;
  updateSourceContent: (sourceId: string, content: string) => Promise<boolean>;
  importSources: (newSources: SourceData[], replace?: boolean) => Promise<boolean>;
  refreshSource: (sourceId: string) => Promise<boolean>;
  updateRefreshOptions: (sourceId: string, options: RefreshOptions) => Promise<boolean>;
  exportSources: () => SourceData[];
  shouldSuppressBroadcast: (sourcesToCheck: SourceData[]) => boolean;
}

/**
 * Hook for source management
 */
export function useSources(): UseSourcesReturn {
  const { sources: rawSources, service, isWorkspaceSwitching } = useCentralizedWorkspace();
  const sources = rawSources as SourceData[];

  const addSource = useCallback(async (sourceData: Record<string, unknown>): Promise<SourceData | null> => {
    try {
      return await service.addSource(sourceData) as SourceData;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [service]);

  const updateSource = useCallback(async (sourceId: string, updates: Record<string, unknown>): Promise<SourceData | null> => {
    try {
      log.debug('updateSource called', { sourceId, updates });
      const updatedSource = await service.updateSource(sourceId, updates) as SourceData | null;
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

  const importSources = useCallback(async (newSources: SourceData[], replace: boolean = false): Promise<boolean> => {
    try {
      if (replace) {
        service.setState({ sources: newSources }, ['sources']);
      } else {
        // Get fresh sources from service to avoid stale closure
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
      // Get fresh sources from service to avoid stale closure issue
      const currentSources = service.getState().sources as SourceData[];
      const source = currentSources.find((s: SourceData) => s.sourceId === sourceId);
      if (!source) {
        log.error(`Source with ID ${sourceId} not found. Available sources:`, currentSources.map((s: SourceData) => ({ id: s.sourceId, type: s.sourceType, path: s.sourcePath })));
        throw new Error(`Source with ID ${sourceId} not found. It may still be saving.`);
      }

      // For file sources, re-read the file
      if (source.sourceType === 'file') {
        const content = await window.electronAPI.readFile(source.sourcePath || '');
        await service.updateSourceContent(sourceId, String(content));
        showMessage('success', 'Source refreshed');
      }
      // For HTTP sources, we don't handle refresh here
      // The actual HTTP refresh is handled by components that have access to useHttp
      else if (source.sourceType === 'http') {
        log.debug('HTTP source refresh should be handled by component with useHttp access');
        return true;
      }
      // For env sources, re-read the environment variable
      else if (source.sourceType === 'env') {
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

  const exportSources = useCallback((): SourceData[] => {
    return sources;
  }, [sources]);

  // Function to check if broadcasts should be suppressed
  const shouldSuppressBroadcast = useCallback((sourcesToCheck: SourceData[]): boolean => {
    // Suppress broadcasts during workspace switching
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
