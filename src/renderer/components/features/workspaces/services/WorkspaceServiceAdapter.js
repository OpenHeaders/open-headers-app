/**
 * Service adapter for workspace operations
 * Provides abstraction layer between controller and actual services
 */

const { createLogger } = require('../../../../utils/error-handling/logger');
const log = createLogger('WorkspaceServiceAdapter');

/**
 * Adapter for Git-related operations
 */
class GitServiceAdapter {
    constructor() {
        this.progressListeners = new Set();
    }

    async getStatus() {
        try {
            const status = await window.electronAPI.getGitStatus();
            return {
                isInstalled: status.isInstalled,
                version: status.version,
                error: status.error
            };
        } catch (error) {
            log.error('Failed to get Git status:', error);
            return {
                isInstalled: false,
                error: error.message
            };
        }
    }

    async install() {
        try {
            // Subscribe to progress updates
            const progressHandler = (data) => {
                this.progressListeners.forEach(listener => {
                    listener({ type: 'git-install', data });
                });
            };

            const unsubscribe = window.electronAPI.onGitInstallProgress(progressHandler);

            try {
                const result = await window.electronAPI.installGit();
                return {
                    success: result.success,
                    error: result.error,
                    message: result.message
                };
            } finally {
                unsubscribe();
            }
        } catch (error) {
            log.error('Git installation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async testConnection(config) {
        try {
            const result = await window.electronAPI.testGitConnection(config);
            return {
                success: result.success,
                error: result.error,
                message: result.message,
                branches: result.branches,
                configFileValid: result.configFileValid,
                validationDetails: result.validationDetails,
                readAccess: result.readAccess,
                writeAccess: result.writeAccess
            };
        } catch (error) {
            log.error('Git connection test failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async commitConfiguration(config) {
        try {
            // Subscribe to progress updates
            const progressHandler = (data) => {
                this.progressListeners.forEach(listener => {
                    listener({ type: 'git-commit', data });
                });
            };

            const unsubscribe = window.electronAPI.onGitCommitProgress ? 
                window.electronAPI.onGitCommitProgress(progressHandler) : 
                () => {};

            try {
                const result = await window.electronAPI.commitConfiguration(config);
                return {
                    success: result.success,
                    error: result.error,
                    commitHash: result.commitHash,
                    commitInfo: result.commitInfo,
                    files: result.files,
                    noChanges: result.noChanges,
                    message: result.message
                };
            } finally {
                unsubscribe();
            }
        } catch (error) {
            log.error('Git commit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createBranch(config) {
        try {
            const result = await window.electronAPI.createBranch(config);
            return {
                success: result.success,
                error: result.error,
                message: result.message
            };
        } catch (error) {
            log.error('Git branch creation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkWritePermissions(config) {
        try {
            const result = await window.electronAPI.checkWritePermissions(config);
            return {
                success: result.success,
                error: result.error,
                details: result.details
            };
        } catch (error) {
            log.error('Write permissions check failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Start listening for Git connection progress updates
     * Returns unsubscribe function that should be called when done
     */
    subscribeToConnectionProgress() {
        const progressHandler = (data) => {
            this.progressListeners.forEach(listener => {
                listener({ type: 'git-connection', data });
            });
        };

        return window.electronAPI.onGitConnectionProgress(progressHandler);
    }

    onProgress(listener) {
        this.progressListeners.add(listener);
        return () => this.progressListeners.delete(listener);
    }
}

/**
 * Adapter for workspace CRUD operations
 */
class WorkspaceServiceAdapter {
    constructor(workspaceContext) {
        this.workspaceContext = workspaceContext;
    }

    async create(workspaceData) {
        const result = await this.workspaceContext.createWorkspace(workspaceData);
        
        if (!result) {
            const error = new Error('Workspace creation returned null');
            log.error('Failed to create workspace:', error);
            throw error;
        }
        
        return {
            id: result.id || workspaceData.id,
            ...result
        };
    }

    async update(workspaceId, workspaceData) {
        const result = await this.workspaceContext.updateWorkspace(workspaceId, workspaceData);
        
        if (!result) {
            const error = new Error('Workspace update returned null');
            log.error('Failed to update workspace:', error);
            throw error;
        }
        
        return result;
    }

    async delete(workspaceId) {
        const result = await this.workspaceContext.deleteWorkspace(workspaceId);
        
        if (!result) {
            const error = new Error('Workspace deletion failed');
            log.error('Failed to delete workspace:', error);
            throw error;
        }
        
        return result;
    }

    // Note: Workspace activation is handled automatically during creation
    // by CentralizedWorkspaceService.createWorkspace() which already switches
    // to the newly created workspace

    async get(workspaceId) {
        const workspaces = await this.workspaceContext.getWorkspaces();
        return workspaces.find(w => w.id === workspaceId);
    }

    async list() {
        return await this.workspaceContext.getWorkspaces();
    }
}

/**
 * Adapter for sync operations - Singleton pattern to prevent multiple instances
 */
class SyncServiceAdapter {
    constructor() {
        if (SyncServiceAdapter.instance) {
            return SyncServiceAdapter.instance;
        }
        
        this.syncListeners = new Set();
        this.electronListeners = new Map();
        this.isSetup = false;
        this.setupEventListeners();
        
        SyncServiceAdapter.instance = this;
    }

    setupEventListeners() {
        // Only setup listeners once
        if (this.isSetup) {
            return;
        }
        
        // Listen for sync events from main process
        if (window.electronAPI.onWorkspaceSyncStarted) {
            const unsubscribe = window.electronAPI.onWorkspaceSyncStarted((data) => {
                this.syncListeners.forEach(listener => {
                    listener({ type: 'sync-started', data });
                });
            });
            this.electronListeners.set('sync-started', unsubscribe);
        }

        if (window.electronAPI.onWorkspaceSyncCompleted) {
            const unsubscribe = window.electronAPI.onWorkspaceSyncCompleted((data) => {
                this.syncListeners.forEach(listener => {
                    listener({ type: 'sync-completed', data });
                });
            });
            this.electronListeners.set('sync-completed', unsubscribe);
        }

        if (window.electronAPI.onWorkspaceSyncProgress) {
            const unsubscribe = window.electronAPI.onWorkspaceSyncProgress((data) => {
                this.syncListeners.forEach(listener => {
                    listener({ type: 'sync-progress', data });
                });
            });
            this.electronListeners.set('sync-progress', unsubscribe);
        }
        
        this.isSetup = true;
        log.debug('SyncServiceAdapter event listeners setup completed');
    }

    cleanup() {
        // Clean up listeners but keep singleton instance
        this.syncListeners.clear();
        
        // Don't destroy electron listeners or singleton instance
        // These should persist for the lifetime of the app
        log.debug('SyncServiceAdapter listeners cleared');
    }

    async initializeWorkspaceSync(workspaceId) {
        const result = await window.electronAPI.initializeWorkspaceSync(workspaceId);
        
        if (!result.success) {
            const error = new Error(result.error || 'Failed to initialize sync');
            log.error('Failed to initialize workspace sync:', error);
            throw error;
        }
        
        return result;
    }

    async syncWorkspace(workspaceId, options = {}) {
        const result = await window.electronAPI.syncWorkspace(workspaceId, options);
        
        if (!result.success) {
            const error = new Error(result.error || 'Sync failed');
            log.error('Failed to sync workspace:', error);
            throw error;
        }
        
        return result;
    }

    onSyncCompleted(listener) {
        const wrappedListener = (event) => {
            if (event.type === 'sync-completed') {
                listener(event.data);
            }
        };
        
        this.syncListeners.add(wrappedListener);
        return () => this.syncListeners.delete(wrappedListener);
    }

}

/**
 * Main service adapter factory - uses singleton pattern
 */
export class WorkspaceServiceAdapterFactory {
    static instance = null;
    
    static create(dependencies) {
        if (WorkspaceServiceAdapterFactory.instance) {
            // Update the workspace context if it changed
            if (dependencies?.workspaceContext) {
                WorkspaceServiceAdapterFactory.instance.workspaceService.workspaceContext = dependencies.workspaceContext;
            }
            return WorkspaceServiceAdapterFactory.instance;
        }
        
        const { workspaceContext } = dependencies;
        
        const gitService = new GitServiceAdapter();
        const workspaceService = new WorkspaceServiceAdapter(workspaceContext);
        const syncService = new SyncServiceAdapter();
        
        WorkspaceServiceAdapterFactory.instance = {
            gitService,
            workspaceService,
            syncService,
            cleanup: () => {
                // Clean up temporary listeners only
                if (syncService.cleanup) {
                    syncService.cleanup();
                }
                // Don't destroy the factory instance
            }
        };
        
        return WorkspaceServiceAdapterFactory.instance;
    }
    
    static reset() {
        // Only use this for testing or app shutdown
        WorkspaceServiceAdapterFactory.instance = null;
    }
}

export {
    GitServiceAdapter,
    WorkspaceServiceAdapter,
    SyncServiceAdapter
};