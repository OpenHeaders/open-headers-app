/**
 * Source Refresh Hook
 *
 * Handles source refresh operations including HTTP requests, file watching,
 * and source addition with proper content fetching.
 */

import { useCallback } from 'react';
import { useHttp } from '../useHttp';
import { showMessage } from '../../utils';
import { createLogger } from '../../utils/error-handling/logger';
import type { Source, NewSourceData } from '../../../types/source';
const log = createLogger('useSourceRefresh');

interface UseSourceRefreshDeps {
  sources: Source[];
  updateSource: (sourceId: string, updates: Partial<Source>) => void;
  refreshSource: (sourceId: string) => Promise<boolean>;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (sourceData: Record<string, unknown>) => Promise<Source | null>;
}

interface UseSourceRefreshReturn {
  handleHttpSourceRefresh: (sourceId: string, updatedSource?: Source | null) => Promise<boolean>;
  refreshSourceWithHttp: (sourceId: string) => Promise<boolean>;
  handleAddSource: (sourceData: NewSourceData) => Promise<boolean>;
}

/**
 * Hook for handling source refresh operations
 */
export function useSourceRefresh({ sources, updateSource, refreshSource, manualRefresh, addSource }: UseSourceRefreshDeps): UseSourceRefreshReturn {
  const http = useHttp();

  /**
   * Handle HTTP source refresh with actual HTTP request
   */
  const handleHttpSourceRefresh = useCallback(async (sourceId: string, updatedSource: Source | null = null): Promise<boolean> => {
    try {
      // Find the source - use the sources from the hook which are always fresh
      const source = updatedSource || sources.find((s) => s.sourceId === sourceId);
      if (!source || source.sourceType !== 'http') {
        log.error(`HTTP source ${sourceId} not found`);
        return false;
      }

      log.debug(`Making HTTP request for source ${sourceId}`, source);

      // Make the HTTP request
      const jsonFilter = { enabled: source.jsonFilter?.enabled ?? false, path: source.jsonFilter?.path };
      const result = await http.request(
        sourceId,
        source.sourcePath || '',
        source.sourceMethod || 'GET',
        source.requestOptions || {},
        jsonFilter
      );

      // Update the source content and metadata
      const updates: Partial<Source> = {
        sourceContent: result.content
      };

      // If there's a JSON filter, store the original response and filtering metadata
      if (result.isFiltered && result.originalResponse) {
        updates.originalResponse = result.originalResponse;
        updates.isFiltered = true;
        updates.filteredWith = result.filteredWith;
      } else {
        // Clear filtering metadata if not filtered
        updates.originalResponse = null;
        updates.isFiltered = false;
        updates.filteredWith = null;
      }

      // Update needsInitialFetch flag if this was the first fetch
      if (source.needsInitialFetch) {
        updates.needsInitialFetch = false;
      }

      // Update the source with all changes at once
      updateSource(sourceId, updates);

      showMessage('success', 'Source refreshed');
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to refresh HTTP source ${sourceId}:`, error);
      showMessage('error', `Failed to refresh source: ${message}`);
      return false;
    }
  }, [sources, updateSource, http]);

  /**
   * Wrapper for refreshSource that handles HTTP sources properly
   */
  const refreshSourceWithHttp = useCallback(async (sourceId: string): Promise<boolean> => {
    // Find the source type
    const source = sources.find((s) => s.sourceId === sourceId);
    if (source && source.sourceType === 'http') {
      // Use RefreshManager for HTTP sources to ensure proper scheduling
      return manualRefresh(sourceId);
    } else {
      // For non-HTTP sources, use the regular refresh
      return refreshSource(sourceId);
    }
  }, [sources, manualRefresh, refreshSource]);

  /**
   * Handle add source with initial content fetching for HTTP sources
   */
  const handleAddSource = useCallback(async (sourceData: NewSourceData): Promise<boolean> => {
    log.debug('Adding source:', sourceData);

    // Build the enriched source data (with content from initial fetch)
    const enrichedData: Record<string, unknown> = { ...sourceData };

    // For HTTP sources, fetch content BEFORE adding the source
    if (sourceData.sourceType === 'http') {
      try {
        log.debug('Fetching initial content for HTTP source before adding');
        showMessage('info', 'Fetching content...');

        // Make the HTTP request to get initial content
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

        if (result.isFiltered && result.originalResponse) {
          enrichedData.originalResponse = result.originalResponse;
          enrichedData.isFiltered = true;
          enrichedData.filteredWith = result.filteredWith;
        }

        const refreshOptions = { ...(sourceData.refreshOptions || { enabled: false }), lastRefresh: Date.now() };
        enrichedData.refreshOptions = refreshOptions;

        log.debug('Initial content fetched successfully');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Failed to fetch initial content:', error);
        showMessage('error', `Failed to fetch content: ${message}`);
        return false;
      }
    }

    // Now add the source with content already included
    const newSource = await addSource(enrichedData);
    if (newSource) {
      log.debug('Source added successfully:', newSource);
      showMessage('success', 'Source added successfully');

      // RefreshManager will automatically pick up the new source through the workspace service subscription

      // For file and env sources, trigger refresh after adding
      if (sourceData.sourceType === 'file' || sourceData.sourceType === 'env') {
        log.debug(`Triggering initial fetch for new ${sourceData.sourceType} source`);
        setTimeout(() => {
          refreshSource(newSource.sourceId);
        }, 100); // Small delay to ensure state has propagated
      }

      return true;
    } else {
      log.debug('Failed to add source');
      return false;
    }
  }, [http, addSource, refreshSource]);

  return {
    handleHttpSourceRefresh,
    refreshSourceWithHttp,
    handleAddSource
  };
}
