import {useCallback} from 'react';
import {useCentralizedWorkspace} from '../useCentralizedWorkspace';
import {showMessage} from '../../utils';

const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useSources');

interface UseSourcesReturn {
  sources: any[];
  addSource: (sourceData: any) => Promise<any>;
  updateSource: (sourceId: string, updates: any) => Promise<any>;
  removeSource: (sourceId: string) => Promise<boolean>;
  updateSourceContent: (sourceId: string, content: string) => Promise<boolean>;
  importSources: (newSources: any[], replace?: boolean) => Promise<boolean>;
  refreshSource: (sourceId: string) => Promise<boolean>;
  updateRefreshOptions: (sourceId: string, options: any) => Promise<boolean>;
  exportSources: () => any[];
  shouldSuppressBroadcast: (sourcesToCheck: any[]) => boolean;
}

/**
 * Hook for source management
 */
export function useSources(): UseSourcesReturn {
  const { sources, service, isWorkspaceSwitching } = useCentralizedWorkspace();

  const addSource = useCallback(async (sourceData: any): Promise<any> => {
    try {
      return await service.addSource(sourceData);
    } catch (error: any) {
      showMessage('error', error.message);
      return null;
    }
  }, [service]);

  const updateSource = useCallback(async (sourceId: string, updates: any): Promise<any> => {
    try {
      log.debug('updateSource called', { sourceId, updates });
      const updatedSource = await service.updateSource(sourceId, updates);
      log.debug('updateSource returning', {
        sourceId,
        updatedSource: !!updatedSource,
        sourceIdReturned: updatedSource?.sourceId
      });
      return updatedSource;
    } catch (error: any) {
      showMessage('error', error.message);
      return null;
    }
  }, [service]);

  const removeSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      await service.removeSource(sourceId);
      showMessage('success', 'Source removed');
      return true;
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const updateSourceContent = useCallback(async (sourceId: string, content: string): Promise<boolean> => {
    try {
      await service.updateSourceContent(sourceId, content);
      return true;
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const importSources = useCallback(async (newSources: any[], replace: boolean = false): Promise<boolean> => {
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
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const refreshSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      // Get fresh sources from service to avoid stale closure issue
      const currentSources = service.getState().sources;
      const source = currentSources.find((s: any) => s.sourceId === sourceId);
      if (!source) {
        log.error(`Source with ID ${sourceId} not found. Available sources:`, currentSources.map((s: any) => ({ id: s.sourceId, type: s.sourceType, path: s.sourcePath })));
        throw new Error(`Source with ID ${sourceId} not found. It may still be saving.`);
      }

      // For file sources, re-read the file
      if (source.sourceType === 'file') {
        const content = await (window as any).electronAPI.readFile(source.sourcePath);
        await service.updateSourceContent(sourceId, content);
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
        const value = await (window as any).electronAPI.getEnvVariable(source.sourcePath);
        await service.updateSourceContent(sourceId, value || '');
        showMessage('success', 'Source refreshed');
      }

      return true;
    } catch (error: any) {
      showMessage('error', `Failed to refresh source: ${error.message}`);
      return false;
    }
  }, [service]);

  const updateRefreshOptions = useCallback(async (sourceId: string, options: any): Promise<boolean> => {
    try {
      await service.updateSource(sourceId, { refreshOptions: options });
      return true;
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const exportSources = useCallback((): any[] => {
    return sources;
  }, [sources]);

  // Function to check if broadcasts should be suppressed
  const shouldSuppressBroadcast = useCallback((sourcesToCheck: any[]): boolean => {
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
