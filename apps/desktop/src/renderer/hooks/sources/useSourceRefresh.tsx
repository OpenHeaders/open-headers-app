/**
 * Source Refresh Hook — delegates all refreshes to main process.
 *
 * HTTP refresh is handled by main-process SourceRefreshService.
 * File/env refresh is handled by main-process WorkspaceStateService.
 * This hook provides the UI-facing API for source operations.
 */

import { useCallback } from 'react';
import { showMessage } from '../../utils';
import { createLogger } from '../../utils/error-handling/logger';
import type { Source, NewSourceData } from '../../../types/source';
import type { HttpRequestSpec } from '../../../types/http';
const log = createLogger('useSourceRefresh');

interface UseSourceRefreshDeps {
  sources: Source[];
  workspaceId: string;
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Source) => Promise<Source | null>;
}

interface UseSourceRefreshReturn {
  handleHttpSourceRefresh: (sourceId: string, updatedSource?: Source | null) => Promise<boolean>;
  refreshSourceWithHttp: (sourceId: string) => Promise<boolean>;
  handleAddSource: (sourceData: NewSourceData) => Promise<boolean>;
}

export function useSourceRefresh({ sources, workspaceId, refreshSource, manualRefresh, addSource }: UseSourceRefreshDeps): UseSourceRefreshReturn {

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
   * Handle add source — fetches initial content for HTTP sources via main process
   * before adding. The source doesn't exist in SourceRefreshService yet, so we
   * call HttpRequestService directly via IPC.
   */
  const handleAddSource = useCallback(async (sourceData: NewSourceData): Promise<boolean> => {
    log.debug('Adding source:', sourceData);

    const enrichedData: Source = { sourceId: '', ...sourceData };

    if (sourceData.sourceType === 'http') {
      try {
        log.debug('Fetching initial content for HTTP source before adding');
        showMessage('info', 'Fetching content...');

        const spec: HttpRequestSpec = {
          url: sourceData.sourcePath || '',
          method: sourceData.sourceMethod || 'GET',
          headers: sourceData.requestOptions?.headers,
          queryParams: sourceData.requestOptions?.queryParams,
          body: sourceData.requestOptions?.body,
          contentType: sourceData.requestOptions?.contentType,
          totpSecret: sourceData.requestOptions?.totpSecret,
          jsonFilter: sourceData.jsonFilter?.enabled
              ? { enabled: true, path: sourceData.jsonFilter.path || '' }
              : undefined,
          sourceId: 'new-source-' + Date.now(),
          workspaceId
        };

        const result = await window.electronAPI.httpRequest.executeRequest(spec);

        // Fail on HTTP errors — user should see why the source can't be fetched
        if (result.statusCode >= 400) {
          showMessage('error', `Failed to fetch content: HTTP ${result.statusCode} error`);
          return false;
        }

        enrichedData.sourceContent = result.filteredBody ?? result.body;
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
  }, [addSource, refreshSource]);

  return {
    handleHttpSourceRefresh,
    refreshSourceWithHttp,
    handleAddSource
  };
}
