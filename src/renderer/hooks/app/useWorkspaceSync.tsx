/**
 * Workspace Synchronization Hook
 *
 * Handles workspace data synchronization notifications and updates.
 */

import { useEffect, useRef } from 'react';
import { showMessage } from '../../utils/ui/messageUtil';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useWorkspaceSync');

// Delay before showing notification — coalesces rapid-fire events into one
const NOTIFICATION_COALESCE_MS = 1000;

interface UseWorkspaceSyncDeps {
  activeWorkspaceId: string;
}

/**
 * Hook for managing workspace synchronization
 */
export function useWorkspaceSync({ activeWorkspaceId }: UseWorkspaceSyncDeps): void {
  // Pending notification timer — coalesces multiple events into a single notification
  const pendingNotificationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // (this should always happen regardless of notification coalescing)
      window.dispatchEvent(new CustomEvent('workspace-data-refresh-needed', {
        detail: { workspaceId: activeWorkspaceId }
      }));

      // Coalesce notifications: when multiple sync events arrive in a burst
      // (e.g. app waking from background with queued IPC events), reset the
      // timer on each event so only one notification shows after the burst settles.
      if (pendingNotificationRef.current) {
        clearTimeout(pendingNotificationRef.current);
      }
      pendingNotificationRef.current = setTimeout(() => {
        pendingNotificationRef.current = null;
        showMessage('success', 'Workspace synced successfully');
      }, NOTIFICATION_COALESCE_MS);
    });

    return () => {
      if (pendingNotificationRef.current) {
        clearTimeout(pendingNotificationRef.current);
      }
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [activeWorkspaceId]);
}
