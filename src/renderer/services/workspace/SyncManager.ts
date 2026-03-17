/**
 * SyncManager - Handles workspace synchronization
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('SyncManager');

class SyncManager {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
  }

  /**
   * Wait for initial sync of a Git workspace
   */
  async waitForInitialSync(workspaceId, timeoutMs = 30000) {
    log.info(`[SyncManager] Waiting for initial sync of workspace ${workspaceId}...`);
    
    return new Promise((resolve, reject) => {
      let unsubscribe;
      let checkInterval;
      let syncReceived = false;
      const startTime = Date.now();
      
      const cleanup = () => {
        if (unsubscribe) unsubscribe();
        if (checkInterval) clearInterval(checkInterval);
      };
      
      // Listen for sync completion via IPC
      if (this.electronAPI && this.electronAPI.onWorkspaceSyncCompleted) {
        log.debug(`[SyncManager] Setting up sync completion listener for workspace ${workspaceId}`);
        unsubscribe = this.electronAPI.onWorkspaceSyncCompleted((data) => {
          log.debug(`[SyncManager] Received sync event:`, {
            workspaceId: data.workspaceId,
            expectedWorkspaceId: workspaceId,
            isInitialSync: data.isInitialSync,
            success: data.success
          });
          
          if (data.workspaceId === workspaceId && data.isInitialSync) {
            syncReceived = true;
            cleanup();
            if (data.success) {
              log.info('[SyncManager] Initial sync completed successfully via IPC event');
              resolve();
            } else {
              log.warn('[SyncManager] Initial sync failed via IPC event:', data.error);
              reject(new Error(data.error || 'Sync failed'));
            }
          }
        });
      } else {
        log.warn('[SyncManager] onWorkspaceSyncCompleted not available in electronAPI');
      }
      
      // Also periodically check if files appear (backup method)
      checkInterval = setInterval(async () => {
        if (!syncReceived) {
          try {
            const sourcesData = await this.electronAPI.loadFromStorage(
              `workspaces/${workspaceId}/sources.json`
            );
            if (sourcesData && sourcesData !== '[]') {
              log.info('[SyncManager] Detected workspace data via file check');
              cleanup();
              resolve();
            }
          } catch (e) {
            // File doesn't exist yet, keep waiting
          }
        }
        
        // Timeout check
        if (Date.now() - startTime > timeoutMs) {
          cleanup();
          log.warn(`[SyncManager] Initial sync timeout after ${timeoutMs/1000} seconds`);
          reject(new Error('Sync timeout'));
        }
      }, 1000);
    });
  }

  /**
   * Check if workspace needs initial sync
   */
  async needsInitialSync(workspaceId) {
    try {
      const sourcesData = await this.electronAPI.loadFromStorage(`workspaces/${workspaceId}/sources.json`);
      
      if (!sourcesData || sourcesData.trim() === '' || sourcesData.trim() === '[]') {
        return true;
      }
      
      try {
        const parsed = JSON.parse(sourcesData);
        return !Array.isArray(parsed) || parsed.length === 0;
      } catch (e) {
        return true;
      }
    } catch (error) {
      // File doesn't exist, needs sync
      return true;
    }
  }

  /**
   * Setup sync status listener
   */
  setupSyncListener(onSyncComplete) {
    if (!this.electronAPI || !this.electronAPI.onWorkspaceSyncCompleted) {
      log.warn('Workspace sync listener not available in electronAPI');
      return () => {};
    }
    
    const unsubscribe = this.electronAPI.onWorkspaceSyncCompleted((data) => {
      // Skip initial sync events as they're handled separately
      if (data.isInitialSync) {
        log.debug('Skipping initial sync event in general sync listener');
        return;
      }
      
      log.info('Workspace sync completed:', data);
      onSyncComplete(data);
    });
    
    return unsubscribe;
  }
}

module.exports = SyncManager;