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

interface UseAppEffectsDeps {
  setAppVersion: (version: string) => void;
  setActiveTab: (tab: string) => void;
  setCurrentRecord: (record: any) => void;
  refreshSource: (sourceId: string) => void;
  activeWorkspaceId: string;
  navigate: (intent: any) => void;
  clearAllHighlights: () => void;
  ACTIONS: Record<string, string>;
  TARGETS: Record<string, string>;
  setSettingsInitialTab: (tab: string | null) => void;
  setSettingsVisible: (visible: boolean) => void;
  setSettingsAction: (action: any) => void;
}

interface UseAppEffectsReturn {
  updateNotificationRef: React.MutableRefObject<any>;
  handleCheckForUpdates: () => void;
  clearAllHighlights: () => void;
}

/**
 * Main application effects hook
 *
 * Combines all app-level effects into a single hook while maintaining
 * separation of concerns through individual specialized hooks.
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
}: UseAppEffectsDeps): UseAppEffectsReturn {
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
