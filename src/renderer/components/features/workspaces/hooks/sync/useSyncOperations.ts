import { App } from 'antd';
import { TIMING } from '../../constants';

const { createLogger } = require('../../../../../utils/error-handling/logger');
const log = createLogger('SyncOperations');

/**
 * Custom hook for workspace sync operations
 * 
 * Handles Git workspace synchronization, sync listeners,
 * and workspace switching with proper error handling.
 * 
 * @param {Object} workspaceContext - Workspace context object
 * @returns {Object} Sync operations and utilities
 */
export const useSyncOperations = (workspaceContext) => {
    const { message } = App.useApp();
    const { syncWorkspace, switchWorkspace } = workspaceContext;
    
    /**
     * Sets up sync listeners for new Git workspaces
     * @returns {Object} Sync listeners object
     */
    const setupSyncListeners = () => {
        const syncMessageKey = 'workspace-syncing';
        let syncHandled = false;
        let timeoutId = null;
        
        const syncListeners = {
            messageKey: syncMessageKey,
            cleanup: () => {
                if (syncListeners.unsubscribeStart) syncListeners.unsubscribeStart();
                if (syncListeners.unsubscribe) syncListeners.unsubscribe();
                if (timeoutId) clearTimeout(timeoutId);
            },
            setupListeners: (workspaceId) => {
                syncListeners.unsubscribeStart = window.electronAPI.onWorkspaceSyncStarted((data) => {
                    if (data.workspaceId === workspaceId && data.isInitialSync) {
                        log.info('[Workspaces] Initial sync started for new Git workspace');
                    }
                });
                
                syncListeners.unsubscribe = window.electronAPI.onWorkspaceSyncCompleted((data) => {
                    if (data.workspaceId === workspaceId && data.isInitialSync && !syncHandled) {
                        syncHandled = true;
                        message.destroy(syncMessageKey);
                        
                        if (data.success) {
                            log.info(`[Workspaces] Switching to newly synced Git workspace: ${workspaceId}`);
                            switchWorkspace(workspaceId).catch(error => {
                                log.error(`[Workspaces] Failed to switch to Git workspace: ${error.message}`);
                                void message.error('Failed to switch to new workspace');
                            });
                        } else {
                            void message.warning(`Workspace created but sync failed: ${data.error || 'Unknown error'}. You can manually sync later.`);
                            log.info(`[Workspaces] Switching to Git workspace despite sync failure: ${workspaceId}`);
                            switchWorkspace(workspaceId);
                        }
                        syncListeners.cleanup();
                    }
                });
            },
            startTimeout: (workspaceId) => {
                timeoutId = setTimeout(() => {
                    if (!syncHandled) {
                        syncHandled = true;
                        message.destroy(syncMessageKey);
                        void message.warning('Git sync is taking longer than expected. Switching to workspace anyway.');
                        syncListeners.cleanup();
                        log.info(`[Workspaces] Timeout reached, switching to Git workspace: ${workspaceId}`);
                        switchWorkspace(workspaceId);
                    }
                }, TIMING.SYNC_TIMEOUT);
            }
        };
        
        return syncListeners;
    };
    
    /**
     * Handles workspace switch after creation
     * @param {Object} result - Creation result
     * @param {Object} workspace - Workspace object
     * @param {Object} syncListeners - Sync listeners object
     */
    const handleWorkspaceSwitch = async (result, workspace, syncListeners) => {
        const workspaceId = result.id || workspace.id;
        
        if (workspace.type === 'git' && syncListeners) {
            syncListeners.setupListeners(workspaceId);
            syncListeners.startTimeout(workspaceId);
            
            message.loading({
                content: 'Syncing workspace from Git repository...',
                key: syncListeners.messageKey,
                duration: 0
            });
        } else {
            log.info(`[Workspaces] Switching to newly created personal workspace: ${workspaceId}`);
            await switchWorkspace(workspaceId);
        }
    };
    
    /**
     * Handles workspace sync
     * @param {Object} workspace - Workspace to sync
     */
    const handleSyncWorkspace = async (workspace) => {
        if (workspace.type !== 'git') {
            return;
        }

        // Call syncWorkspace which will handle its own success/error notifications
        await syncWorkspace(workspace.id);
    };
    
    return {
        setupSyncListeners,
        handleWorkspaceSwitch,
        handleSyncWorkspace
    };
};
