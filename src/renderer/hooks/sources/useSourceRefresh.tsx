/**
 * Source Refresh Hook — simplified to delegate HTTP refreshes to main process.
 *
 * HTTP refresh is now handled by main-process SourceRefreshService.
 * This hook handles:
 *  - Manual refresh via IPC
 *  - Source addition with initial content fetching (still uses useHttp for the
 *    creation flow since the source doesn't exist in main yet)
 */

import { useCallback } from 'react';
import { useHttp } from '../useHttp';
import { showMessage } from '../../utils';
import { createLogger } from '../../utils/error-handling/logger';
import type { Source, NewSourceData } from '../../../types/source';
const log = createLogger('useSourceRefresh');

interface UseSourceRefreshDeps {
  sources: Source[];
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Source) => Promise<Source | null>;
}

interface UseSourceRefreshReturn {
  handleHttpSourceRefresh: (sourceId: string, updatedSource?: Source | null) => Promise<boolean>;
  refreshSourceWithHttp: (sourceId: string) => Promise<boolean>;
  handleAddSource: (sourceData: NewSourceData) => Promise<boolean>;
}

export function useSourceRefresh({ sources, refreshSource, manualRefresh, addSource }: UseSourceRefreshDeps): UseSourceRefreshReturn {
  const http = useHttp();

  /**
   * Handle HTTP source refresh — delegates to main process via IPC
   */
  const handleHttpSourceRefresh = useCallback(async (sourceId: string, _updatedSource: Source | null = null): Promise<boolean> => {
    try {
      if (window.electronAPI?.sourceRefresh) {
        const result = await window.electronAPI.sourceRefresh.manualRefresh(sourceId);
        if (result.success) {
          showMessage('success', 'Source refreshed');
          return true;
        } else {
          showMessage('error', `Failed to refresh source: ${result.error || 'Unknown error'}`);
          return false;
        }
      }
      // Fallback to RefreshManager context
      return manualRefresh(sourceId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to refresh HTTP source ${sourceId}:`, error);
      showMessage('error', `Failed to refresh source: ${message}`);
      return false;
    }
  }, [manualRefresh]);

  const refreshSourceWithHttp = useCallback(async (sourceId: string): Promise<boolean> => {
    const source = sources.find(s => s.sourceId === sourceId);
    if (source && source.sourceType === 'http') {
      return handleHttpSourceRefresh(sourceId);
    }
    return refreshSource(sourceId);
  }, [sources, handleHttpSourceRefresh, refreshSource]);

  /**
   * Handle add source — fetches initial content for HTTP sources before adding.
   * Uses renderer-side useHttp for the creation flow since the source
   * doesn't exist in the main-process SourceRefreshService yet.
   * After adding, the main process picks it up via workspace sync.
   */
  const handleAddSource = useCallback(async (sourceData: NewSourceData): Promise<boolean> => {
    log.debug('Adding source:', sourceData);

    const enrichedData: Source = { sourceId: '', ...sourceData };

    if (sourceData.sourceType === 'http') {
      try {
        log.debug('Fetching initial content for HTTP source before adding');
        showMessage('info', 'Fetching content...');

        const jsonFilter = { enabled: sourceData.jsonFilter?.enabled ?? false, path: sourceData.jsonFilter?.path };
        const result = await http.request(
          'new-source-' + Date.now(),
          sourceData.sourcePath || '',
          sourceData.sourceMethod || 'GET',
          sourceData.requestOptions || {},
          jsonFilter
        );

        enrichedData.sourceContent = result.content;
        enrichedData.needsInitialFetch = false;
        enrichedData.responseHeaders = result.headers ?? null;

        if (result.isFiltered && result.originalResponse) {
          enrichedData.originalResponse = result.originalResponse;
          enrichedData.isFiltered = true;
          enrichedData.filteredWith = result.filteredWith;
        }

        enrichedData.refreshOptions = { ...(sourceData.refreshOptions || { enabled: false }), lastRefresh: Date.now() };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Failed to fetch initial content:', error);
        showMessage('error', `Failed to fetch content: ${message}`);
        return false;
      }
    }

    const newSource = await addSource(enrichedData);
    if (newSource) {
      showMessage('success', 'Source added successfully');

      if (sourceData.sourceType === 'file' || sourceData.sourceType === 'env') {
        setTimeout(() => { refreshSource(newSource.sourceId); }, 100);
      }

      return true;
    }
    return false;
  }, [http, addSource, refreshSource]);

  return {
    handleHttpSourceRefresh,
    refreshSourceWithHttp,
    handleAddSource
  };
}
