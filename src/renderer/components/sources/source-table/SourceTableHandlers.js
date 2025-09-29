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

import { showMessage } from '../../../utils/ui/messageUtil';
import { debugRefreshState } from './SourceTableUtils';

// Handler factory functions for source table operations
// Each factory creates a handler with dependency injection for better testability

/**
 * Creates save source handler with refresh logic
 * @param {Object} params - Handler parameters
 * @param {Function} params.onUpdateSource - Update source callback
 * @param {Function} params.setRefreshingSourceId - Set refreshing state
 * @param {Function} params.setRefreshDisplayStates - Set display states
 * @param {Function} params.setEditModalVisible - Set modal visibility
 * @param {Function} params.handleRefreshSource - Refresh source handler
 * @param {Object} params.log - Logger instance
 * @returns {Function} Save source handler
 */
export const createSaveSourceHandler = ({
    onUpdateSource,
    setRefreshingSourceId,
    setRefreshDisplayStates,
    setEditModalVisible,
    handleRefreshSource,
    log
}) => async (sourceData) => {
    // Main save handler that coordinates source updates with refresh operations
    // Handles both simple updates and complex refresh-triggered updates
    try {
        // Set loading state for visual feedback during save operation
        setRefreshingSourceId(sourceData.sourceId);

        // Extract refreshNow flag and remove it from the data sent to parent
        // This flag indicates if an immediate refresh should be triggered after save
        const shouldRefreshNow = sourceData.refreshNow === true;
        const dataToSave = { ...sourceData };
        delete dataToSave.refreshNow;

        log.debug('Saving source data...', { 
            sourceId: dataToSave.sourceId,
            refreshOptions: dataToSave.refreshOptions,
            autoRefreshEnabled: dataToSave.refreshOptions?.enabled,
            shouldRefreshNow
        });

        // Call parent handler to update the source and get the updated source
        // Parent handler typically updates the sources array and returns the updated source
        const updatedSource = onUpdateSource(dataToSave.sourceId, dataToSave);
        log.debug('UpdateSource returned:', { updatedSource, hasValue: !!updatedSource });

        if (updatedSource) {
            log.debug('Source updated successfully');

            // Clear cached refresh display state to force immediate UI update
            // This ensures the "Refreshes in..." text updates immediately after save
            setRefreshDisplayStates(prev => {
                // Only update if the key exists to avoid unnecessary re-renders
                if (sourceData.sourceId in prev) {
                    const { [sourceData.sourceId]: _, ...rest } = prev;
                    log.debug(`Cleared refresh display cache for source ${sourceData.sourceId}`);
                    return rest;
                }
                return prev;
            });

            // Trigger refresh if explicitly requested via refreshNow flag
            // This is typically set when user saves with refresh intention
            if (shouldRefreshNow) {
                log.debug('Triggering refresh after save...', {
                    reason: 'immediate-refresh-requested'
                });

                // Use a promise to wait for the next tick and ensure source is updated
                // This prevents race conditions with state updates
                await new Promise(resolve => setTimeout(resolve, 100));
                
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
        showMessage('error', `Error: ${error.message}`);
        return false;
    } finally {
        // Clear refreshing state with delay to ensure UI updates properly
        // Delay allows users to see the loading state briefly for better UX
        setTimeout(() => {
            setRefreshingSourceId(null);
        }, 1500);
    }
};

/**
 * Creates refresh source handler with status tracking
 * @param {Object} params - Handler parameters
 * @param {Function} params.onRefreshSource - Refresh source callback
 * @param {Function} params.setRefreshingSourceId - Set refreshing state
 * @param {Function} params.setRefreshDisplayStates - Set display states
 * @param {Object} params.timeManager - Time manager instance
 * @param {Object} params.log - Logger instance
 * @returns {Function} Refresh source handler
 */
export const createRefreshSourceHandler = ({
    onRefreshSource,
    setRefreshingSourceId,
    setRefreshDisplayStates,
    timeManager,
    log
}) => async (sourceId, updatedSource = null) => {
    // Manual refresh handler with comprehensive status tracking
    // Coordinates with RefreshManager and provides visual feedback
    try {
        debugRefreshState(sourceId, 'Manual Refresh Started', {}, log, timeManager);
        log.debug('Starting refresh for source', sourceId);

        // Set refreshing state for visual feedback
        setRefreshingSourceId(sourceId);

        // Update display state immediately to show "Refreshing..." text
        // This provides immediate feedback before the actual refresh completes
        setRefreshDisplayStates(prev => ({
            ...prev,
            [sourceId]: {
                text: 'Refreshing...',
                timestamp: timeManager.now()
            }
        }));

        // Call the parent refresh handler (which delegates to RefreshManager)
        // Parent handler typically fetches new data and updates the source content
        const success = await onRefreshSource(sourceId, updatedSource);

        debugRefreshState(sourceId, 'Manual Refresh Completed', { success }, log, timeManager);

        return success;
    } catch (error) {
        debugRefreshState(sourceId, 'Manual Refresh Error', { error: error.message }, log, timeManager);
        return false;
    } finally {
        // Clear refreshing state with a delay to ensure UI updates
        // Delay allows users to see the completion state briefly
        setTimeout(() => {
            setRefreshingSourceId(null);
            debugRefreshState(sourceId, 'Cleared Refreshing State', {}, log, timeManager);
        }, 1500);
    }
};

/**
 * Creates remove source handler with cleanup
 * @param {Object} params - Handler parameters
 * @param {Function} params.onRemoveSource - Remove source callback
 * @param {Function} params.setRemovingSourceId - Set removing state
 * @param {Function} params.setRefreshDisplayStates - Set display states
 * @param {Array} params.sources - Sources array
 * @returns {Function} Remove source handler
 */
export const createRemoveSourceHandler = ({
    onRemoveSource,
    setRemovingSourceId,
    setRefreshDisplayStates,
    sources
}) => async (sourceId) => {
    // Remove source handler with comprehensive cleanup and user feedback
    // Handles state cleanup and provides informative messages to users
    try {
        // Set removing state for visual feedback (loading spinner)
        setRemovingSourceId(sourceId);

        // Get source details for informative user messages
        const source = sources.find(s => s.sourceId === sourceId);
        const sourceType = source?.sourceType?.toUpperCase() || 'SOURCE';
        const sourceTag = source?.sourceTag || `#${sourceId}`;

        // Call parent handler to remove the source from the sources array
        const success = await onRemoveSource(sourceId);

        if (success) {
            // Clean up display states to prevent stale display and memory leaks
            setRefreshDisplayStates(prev => {
                const updated = { ...prev };
                delete updated[sourceId];
                return updated;
            });

            // Show warning message with extended duration and important info
            showMessage('warning',
                `${sourceType} source ${sourceTag} has been removed. Any browser extension rules using this source will be affected.`,
                5 // Duration in seconds - longer for important warnings
            );
        } else {
            showMessage('error', `Failed to remove source ${sourceTag}`);
        }

        return success;
    } catch (error) {
        showMessage('error', `Error removing source: ${error.message}`);
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
    setContentViewerVisible
}) => ({
    // Edit source handler - opens edit modal for the selected source
    handleEditSource: (source) => {
        // Store only the source ID to always get latest data from sources array
        setSelectedSourceId(source.sourceId);
        setEditModalVisible(true);
    },
    
    // View content handler - opens content viewer modal for the selected source
    handleViewContent: (source) => {
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
    }
});