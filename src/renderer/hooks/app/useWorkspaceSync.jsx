/**
 * Workspace Synchronization Hook
 * 
 * Handles workspace data synchronization notifications and updates.
 */

import { useEffect } from 'react';
import { showMessage } from '../../utils/ui/messageUtil';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useWorkspaceSync');

/**
 * Hook for managing workspace synchronization
 * 
 * @param {Object} deps - Dependencies
 * @param {string} deps.activeWorkspaceId - Currently active workspace ID
 */
export function useWorkspaceSync({ activeWorkspaceId }) {
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
      window.dispatchEvent(new CustomEvent('workspace-data-refresh-needed', {
        detail: { workspaceId: activeWorkspaceId }
      }));
      
      showMessage('success', 'Workspace synced successfully');
    });
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [activeWorkspaceId]);
}