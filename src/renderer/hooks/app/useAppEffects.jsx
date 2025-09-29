/**
 * Main App Effects Hook
 * 
 * Consolidated hook that manages all core application effects by combining
 * smaller, focused hooks for better maintainability and separation of concerns.
 * 
 * This hook coordinates:
 * - App initialization and version management
 * - File change monitoring
 * - Navigation handling
 * - Workspace synchronization
 * - Update checking functionality
 */

import { useAppInitialization } from './useAppInitialization';
import { useFileWatcher } from './useFileWatcher';
import { useNavigation } from './useNavigation';
import { useWorkspaceSync } from './useWorkspaceSync';
import { useUpdateChecker } from './useUpdateChecker';

/**
 * Main application effects hook
 * 
 * Combines all app-level effects into a single hook while maintaining
 * separation of concerns through individual specialized hooks.
 * 
 * @param {Object} deps - Dependencies object
 * @param {Function} deps.setAppVersion - Sets the application version
 * @param {Function} deps.setActiveTab - Sets the active tab in the UI
 * @param {Function} deps.setCurrentRecord - Sets the current record for viewing
 * @param {Function} deps.refreshSource - Refreshes a specific source
 * @param {string} deps.activeWorkspaceId - Currently active workspace ID
 * @param {Function} deps.navigate - Navigation handler function
 * @param {Function} deps.clearAllHighlights - Clears all UI highlights
 * @param {Object} deps.ACTIONS - Available navigation actions
 * @param {Object} deps.TARGETS - Available navigation targets
 * @param {Function} deps.setSettingsInitialTab - Sets initial settings tab
 * @param {Function} deps.setSettingsVisible - Controls settings modal visibility
 * @param {Function} deps.setSettingsAction - Sets settings action to perform
 * @returns {Object} - Object containing refs and handlers for external use
 */
export function useAppEffects({
  setAppVersion,
  setActiveTab,
  setCurrentRecord,
  refreshSource,
  activeWorkspaceId,
  navigate,
  clearAllHighlights,
  ACTIONS,
  TARGETS,
  setSettingsInitialTab,
  setSettingsVisible,
  setSettingsAction
}) {
  // Initialize app and handle record opening
  useAppInitialization({ setAppVersion, setActiveTab, setCurrentRecord });

  // Monitor file changes and refresh sources
  useFileWatcher({ refreshSource });

  // Handle navigation requests from main process
  useNavigation({ 
    setActiveTab, 
    navigate, 
    ACTIONS, 
    TARGETS, 
    setSettingsInitialTab, 
    setSettingsVisible, 
    setSettingsAction 
  });

  // Handle workspace synchronization
  useWorkspaceSync({ activeWorkspaceId });

  // Get update checking functionality
  const { updateNotificationRef, handleCheckForUpdates } = useUpdateChecker();

  return {
    updateNotificationRef,
    handleCheckForUpdates,
    clearAllHighlights
  };
}