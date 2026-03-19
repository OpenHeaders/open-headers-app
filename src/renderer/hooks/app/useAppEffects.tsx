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

import React from 'react';
import { useAppInitialization } from './useAppInitialization';
import { useFileWatcher } from './useFileWatcher';
import { useNavigation, NavigationIntent } from './useNavigation';
import type { InitialAction } from '../../components/modals/settings/SettingsModal';
import { useWorkspaceSync } from './useWorkspaceSync';
import { useUpdateChecker, UpdateNotificationHandle } from './useUpdateChecker';

interface UseAppEffectsDeps {
  setAppVersion: (version: string) => void;
  setActiveTab: (tab: string) => void;
  setCurrentRecord: (record: Record<string, unknown> | null) => void;
  refreshSource: (sourceId: string) => void;
  activeWorkspaceId: string;
  navigate: (intent: NavigationIntent) => void;
  clearAllHighlights: () => void;
  ACTIONS: Record<string, string>;
  TARGETS: Record<string, string>;
  setSettingsInitialTab: (tab: string | null) => void;
  setSettingsVisible: (visible: boolean) => void;
  setSettingsAction: (action: InitialAction | null) => void;
}

interface UseAppEffectsReturn {
  updateNotificationRef: React.MutableRefObject<UpdateNotificationHandle | null>;
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
