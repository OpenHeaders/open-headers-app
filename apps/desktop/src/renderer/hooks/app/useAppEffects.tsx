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

import type { Recording } from '@openheaders/core';
import type { RefObject } from 'react';
import type { InitialAction } from '@/renderer/components/modals/settings/SettingsModal';
import { useAppInitialization } from './useAppInitialization';
import { useFileWatcher } from './useFileWatcher';
import { type NavigationIntent, useNavigation } from './useNavigation';
import { type UpdateNotificationHandle, useUpdateChecker } from './useUpdateChecker';
import { useWorkspaceSync } from './useWorkspaceSync';

interface UseAppEffectsDeps {
  setAppVersion: (version: string) => void;
  setActiveTab: (tab: string) => void;
  setCurrentRecord: (record: Recording | null) => void;
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
  updateNotificationRef: RefObject<UpdateNotificationHandle | null>;
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
  setSettingsAction,
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
    setSettingsAction,
  });

  // Handle workspace synchronization
  useWorkspaceSync({ activeWorkspaceId });

  // Get update checking functionality
  const { updateNotificationRef, handleCheckForUpdates } = useUpdateChecker();

  return {
    updateNotificationRef,
    handleCheckForUpdates,
    clearAllHighlights,
  };
}
