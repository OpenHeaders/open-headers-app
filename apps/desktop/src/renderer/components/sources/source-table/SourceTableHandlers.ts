/**
 * Source Table Handlers
 *
 * Event handlers and business logic for source table operations.
 *
 * This module contains factory functions that create handlers for various
 * source table operations including save, refresh, remove, and modal management.
 * Each handler encapsulates complex state management and error handling logic.
 *
 * Key Features:
 * - Factory pattern for dependency injection
 * - Comprehensive error handling with user feedback
 * - State management coordination across multiple components
 * - Loading states and visual feedback during operations
 * - Proper cleanup and resource management
 *
 * Handler Types:
 * - Save: Handles source updates with refresh coordination
 * - Refresh: Manages manual refresh operations with status tracking
 * - Remove: Handles source deletion with cleanup
 * - Modal: Manages modal state for edit and view operations
 *
 * @module SourceTableHandlers
 * @since 3.0.0
 */

import { showMessage } from '@/renderer/utils/ui/messageUtil';
import type { Source } from '@/types/source';
import { debugRefreshState } from './SourceTableUtils';

interface LoggerLike {
  debug: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

interface TimeManagerLike {
  now: () => number;
  getDate: () => Date;
}

interface SaveSourceParams {
  onUpdateSource: (sourceId: string, data: Partial<Source>) => Promise<Source | null>;
  setRefreshingSourceId: (id: string | null) => void;
  setEditModalVisible: (visible: boolean) => void;
  handleRefreshSource: (sourceId: string, source: Source) => Promise<boolean>;
  log: LoggerLike;
}

interface RefreshSourceParams {
  onRefreshSource: (sourceId: string, updatedSource?: Source | null) => Promise<boolean>;
  setRefreshingSourceId: (id: string | null) => void;
  timeManager: TimeManagerLike;
  log: LoggerLike;
}

interface RemoveSourceParams {
  onRemoveSource: (sourceId: string) => Promise<boolean>;
  setRemovingSourceId: (id: string | null) => void;
  sources: Source[];
}

interface ModalHandlerParams {
  setSelectedSourceId: (id: string | null) => void;
  setEditModalVisible: (visible: boolean) => void;
  setContentViewerVisible: (visible: boolean) => void;
}

// Handler factory functions for source table operations
// Each factory creates a handler with dependency injection for better testability

/**
 * Creates save source handler with refresh logic
 */
export const createSaveSourceHandler =
  ({ onUpdateSource, setRefreshingSourceId, setEditModalVisible, handleRefreshSource, log }: SaveSourceParams) =>
  async (sourceData: Source & { refreshNow: boolean }) => {
    // Main save handler that coordinates source updates with refresh operations
    // Handles both simple updates and complex refresh-triggered updates
    try {
      // Set loading state for visual feedback during save operation
      setRefreshingSourceId(sourceData.sourceId);

      // Extract refreshNow flag and remove it from the data sent to parent
      // This flag indicates if an immediate refresh should be triggered after save
      const { refreshNow: shouldRefreshNow, ...dataToSave } = sourceData;

      log.debug('Saving source data...', {
        sourceId: dataToSave.sourceId,
        refreshOptions: dataToSave.refreshOptions,
        autoRefreshEnabled: dataToSave.refreshOptions?.enabled,
        shouldRefreshNow,
      });

      // Call parent handler to update the source and get the updated source
      // Parent handler typically updates the sources array and returns the updated source
      const updatedSource = await onUpdateSource(dataToSave.sourceId, dataToSave);
      log.debug('UpdateSource returned:', { updatedSource, hasValue: !!updatedSource });

      if (updatedSource) {
        log.debug('Source updated successfully');

        // Push updated config directly to main-process SourceRefreshService
        // so it picks up new refreshOptions immediately (no disk-read race).
        // Must await before triggering refresh to ensure config is applied first.
        if (updatedSource.sourceType === 'http' && window.electronAPI?.sourceRefresh) {
          try {
            await window.electronAPI.sourceRefresh.updateSource(updatedSource);
          } catch (err) {
            log.error('Failed to push source config to main process:', err);
          }
        }

        // Trigger refresh if explicitly requested via refreshNow flag
        if (shouldRefreshNow) {
          log.debug('Triggering refresh after save...');

          try {
            const refreshSuccess = await handleRefreshSource(sourceData.sourceId, updatedSource);

            if (refreshSuccess) {
              log.debug('Manual refresh completed successfully');
            } else {
              log.debug('Manual refresh failed');
            }
          } catch (error) {
            log.error('Error during manual refresh:', error);
          }
        } else {
          log.debug('Not triggering refresh - auto-refresh enabled and immediate refresh not requested');
          // RefreshManager will handle the timer update automatically
        }

        // Close the modal after successful save
        setEditModalVisible(false);

        // Success message after modal is closed to ensure proper timing
        setTimeout(() => {
          showMessage('success', 'Source updated successfully');
        }, 100);

        return true;
      } else {
        showMessage('error', 'Failed to update source');
        return false;
      }
    } catch (error) {
      log.error('Error saving source:', error);
      showMessage('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setRefreshingSourceId(null);
    }
  };

/**
 * Creates refresh source handler with status tracking
 */
export const createRefreshSourceHandler =
  ({ onRefreshSource, setRefreshingSourceId, timeManager, log }: RefreshSourceParams) =>
  async (sourceId: string, updatedSource: Source | null = null) => {
    try {
      debugRefreshState(sourceId, 'Manual Refresh Started', {}, log, timeManager);
      setRefreshingSourceId(sourceId);

      const success = await onRefreshSource(sourceId, updatedSource);
      debugRefreshState(sourceId, 'Manual Refresh Completed', { success }, log, timeManager);
      return success;
    } catch (error) {
      debugRefreshState(
        sourceId,
        'Manual Refresh Error',
        { error: error instanceof Error ? error.message : String(error) },
        log,
        timeManager,
      );
      return false;
    } finally {
      setRefreshingSourceId(null);
    }
  };

/**
 * Creates remove source handler with cleanup
 */
export const createRemoveSourceHandler =
  ({ onRemoveSource, setRemovingSourceId, sources }: RemoveSourceParams) =>
  async (sourceId: string) => {
    // Remove source handler with comprehensive cleanup and user feedback
    // Handles state cleanup and provides informative messages to users
    try {
      // Set removing state for visual feedback (loading spinner)
      setRemovingSourceId(sourceId);

      // Get source details for informative user messages
      const source = sources.find((s) => s.sourceId === sourceId);
      const sourceType = source?.sourceType?.toUpperCase() || 'SOURCE';
      const sourceTag = source?.sourceTag || `#${sourceId}`;

      // Call parent handler to remove the source from the sources array
      const success = await onRemoveSource(sourceId);

      if (success) {
        // Show warning message with extended duration and important info
        showMessage(
          'warning',
          `${sourceType} source ${sourceTag} has been removed. Any browser extension rules using this source will be affected.`,
          5, // Duration in seconds - longer for important warnings
        );
      } else {
        showMessage('error', `Failed to remove source ${sourceTag}`);
      }

      return success;
    } catch (error) {
      showMessage('error', `Error removing source: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      // Clear removing state to stop loading spinner
      setRemovingSourceId(null);
    }
  };

/**
 * Creates modal handlers for edit and content view
 * @param {Object} params - Handler parameters
 * @param {Function} params.setSelectedSourceId - Set selected source ID
 * @param {Function} params.setEditModalVisible - Set edit modal visibility
 * @param {Function} params.setContentViewerVisible - Set content viewer visibility
 * @returns {Object} Modal handlers
 */
export const createModalHandlers = ({
  setSelectedSourceId,
  setEditModalVisible,
  setContentViewerVisible,
}: ModalHandlerParams) => ({
  // Edit source handler - opens edit modal for the selected source
  handleEditSource: (source: Source) => {
    // Store only the source ID to always get latest data from sources array
    setSelectedSourceId(source.sourceId);
    setEditModalVisible(true);
  },

  // View content handler - opens content viewer modal for the selected source
  handleViewContent: (source: Source) => {
    // Store only the source ID to always get latest data from sources array
    setSelectedSourceId(source.sourceId);
    setContentViewerVisible(true);
  },

  // Close modal handler - closes both modals and clears selection
  handleCloseModal: () => {
    // Hide modals first to start closing animation
    setEditModalVisible(false);
    setContentViewerVisible(false);

    // Clear selected source ID after animation completes
    // Timeout matches modal animation duration for smooth UX
    setTimeout(() => {
      setSelectedSourceId(null);
    }, 300);
  },
});
