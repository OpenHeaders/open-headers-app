/**
 * Workspace Synchronization Hook
 *
 * Handles workspace data synchronization notifications and updates.
 */

import { useEffect, useRef } from 'react';
import { showMessage } from '../../utils/ui/messageUtil';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useWorkspaceSync');

// Minimum time between sync notifications (in milliseconds)
// This prevents notification spam when app returns from background with queued events
const NOTIFICATION_DEBOUNCE_MS = 5000;

/**
 * Hook for managing workspace synchronization
 *
 * @param {Object} deps - Dependencies
 * @param {string} deps.activeWorkspaceId - Currently active workspace ID
 */
export function useWorkspaceSync({ activeWorkspaceId }) {
  // Track the last time we showed a notification to prevent spam
  const lastNotificationTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWorkspaceDataUpdated((updateData) => {
      log.info('Received workspace data update notification:', {
        workspaceId: updateData.workspaceId,
        timestamp: updateData.timestamp
      });

      if (updateData.workspaceId !== activeWorkspaceId) {
        log.info('Ignoring data update for non-active workspace');
        return;
      }

      // Dispatch custom event to notify components about data refresh
      // (this should always happen regardless of notification debouncing)
      window.dispatchEvent(new CustomEvent('workspace-data-refresh-needed', {
        detail: { workspaceId: activeWorkspaceId }
      }));

      // Debounce notifications to prevent spam when returning from background
      // When app wakes up from sleep/background, multiple queued sync events
      // may arrive at once - we only want to show one notification
      const now = Date.now();
      if (now - lastNotificationTimeRef.current >= NOTIFICATION_DEBOUNCE_MS) {
        lastNotificationTimeRef.current = now;
        showMessage('success', 'Workspace synced successfully');
      } else {
        log.info('Suppressing duplicate sync notification (debounced)');
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [activeWorkspaceId]);
}