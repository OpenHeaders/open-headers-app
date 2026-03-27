/**
 * Service adapter for workspace operations
 * Provides abstraction layer between controller and actual services
 */

import { createLogger } from '../../../../utils/error-handling/logger';
import type { Workspace, WorkspaceSyncStatus, WorkspaceType, WorkspaceAuthData, CommitInfo, WorkspaceSyncCompletedData } from '../../../../../types/workspace';
const log = createLogger('WorkspaceServiceAdapter');

interface AdapterGitProgressEvent {
    type: string;
    data: GitProgressEvent;
}

interface GitResult {
    success: boolean;
    error?: string;
    message?: string;
    branches?: string[];
    configFileValid?: boolean;
    validationDetails?: { sourceCount?: number; ruleCount?: number; proxyRuleCount?: number; variableCount?: number };
    readAccess?: boolean;
    writeAccess?: boolean;
    commitHash?: string;
    commitInfo?: CommitInfo;
    files?: string[];
    noChanges?: boolean;
    details?: { canPush?: boolean; reason?: string };
}

interface GitConfig {
    url?: string;
    branch?: string;
    authType?: string;
    filePath?: string;
    path?: string;
    files?: Record<string, string>;
    message?: string;
    authData?: WorkspaceAuthData;
    checkWriteAccess?: boolean;
    isInvite?: boolean;
}

interface SyncEvent {
    type: string;
    data: WorkspaceSyncCompletedData;
}

export interface WorkspaceContextType {
    createWorkspace: (data: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }) => Promise<Workspace | null>;
    updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<boolean>;
    deleteWorkspace: (id: string) => Promise<boolean>;
    getWorkspaces?: () => Promise<Workspace[]>;
    workspaces?: Workspace[];
    switchWorkspace?: (id: string) => Promise<boolean>;
    syncWorkspace?: (id: string, options?: { silent?: boolean }) => Promise<boolean>;
    cloneWorkspaceToPersonal?: (id: string, newName?: string | null) => Promise<Workspace | null>;
    activeWorkspaceId?: string;
    syncStatus?: Record<string, WorkspaceSyncStatus>;
    loading?: boolean;
}

interface ServiceAdapterDependencies {
    workspaceContext: WorkspaceContextType;
}

/**
 * Adapter for Git-related operations
 */
class GitServiceAdapter {
    progressListeners: Set<(event: AdapterGitProgressEvent) => void>;

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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async install() {
        try {
            // Subscribe to progress updates
            const progressHandler = (data: GitProgressEvent) => {
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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async testConnection(config: GitConfig) {
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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async commitConfiguration(config: GitConfig) {
        try {
            // Subscribe to progress updates
            const progressHandler = (data: GitProgressEvent) => {
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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async createBranch(config: GitConfig) {
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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async checkWritePermissions(config: GitConfig) {
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
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Start listening for Git connection progress updates
     * Returns unsubscribe function that should be called when done
     */
    subscribeToConnectionProgress() {
        const progressHandler = (data: GitProgressEvent) => {
            this.progressListeners.forEach(listener => {
                listener({ type: 'git-connection', data });
            });
        };

        return window.electronAPI.onGitConnectionProgress(progressHandler);
    }

    onProgress(listener: (event: AdapterGitProgressEvent) => void): () => void {
        this.progressListeners.add(listener);
        return () => { this.progressListeners.delete(listener); };
    }
}

/**
 * Adapter for workspace CRUD operations
 */
class WorkspaceServiceAdapter {
    workspaceContext: WorkspaceContextType;

    constructor(workspaceContext: WorkspaceContextType) {
        this.workspaceContext = workspaceContext;
    }

    async create(workspaceData: Partial<Workspace> & { id: string; type: WorkspaceType }): Promise<Workspace | null> {
        const typed = { ...workspaceData, name: workspaceData.name || '' };
        const result = await this.workspaceContext.createWorkspace(typed);

        if (!result) {
            const error = new Error('Workspace creation returned null');
            log.error('Failed to create workspace:', error);
            throw error;
        }

        return result;
    }

    async update(workspaceId: string, workspaceData: Partial<Workspace>) {
        const result = await this.workspaceContext.updateWorkspace(workspaceId, workspaceData);

        if (!result) {
            const error = new Error('Workspace update failed');
            log.error('Failed to update workspace:', error);
            throw error;
        }

        return result;
    }

    async delete(workspaceId: string) {
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

    async get(workspaceId: string) {
        if (this.workspaceContext.getWorkspaces) {
            const workspaces = await this.workspaceContext.getWorkspaces();
            return workspaces.find(w => w.id === workspaceId);
        }
        return (this.workspaceContext.workspaces ?? []).find(w => w.id === workspaceId);
    }

    async list() {
        if (this.workspaceContext.getWorkspaces) {
            return await this.workspaceContext.getWorkspaces();
        }
        return this.workspaceContext.workspaces ?? [];
    }
}

/**
 * Adapter for sync operations - Singleton pattern to prevent multiple instances
 */
class SyncServiceAdapter {
    static instance: SyncServiceAdapter | null = null;
    syncListeners!: Set<(event: SyncEvent) => void>;
    electronListeners!: Map<string, () => void>;
    isSetup!: boolean;

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

    async initializeWorkspaceSync(workspaceId: string) {
        const result = await window.electronAPI.initializeWorkspaceSync(workspaceId);

        if (!result.success) {
            const error = new Error(result.error || 'Failed to initialize sync');
            log.error('Failed to initialize workspace sync:', error);
            throw error;
        }

        return result;
    }

    async syncWorkspace(workspaceId: string, options: { silent?: boolean } = {}) {
        const result = await window.electronAPI.syncWorkspace(workspaceId, options);

        if (!result.success) {
            const error = new Error(result.error || 'Sync failed');
            log.error('Failed to sync workspace:', error);
            throw error;
        }

        return result;
    }

    onSyncCompleted(listener: (data: WorkspaceSyncCompletedData) => void) {
        const wrappedListener = (event: SyncEvent) => {
            if (event.type === 'sync-completed') {
                listener(event.data);
            }
        };

        this.syncListeners.add(wrappedListener);
        return () => this.syncListeners.delete(wrappedListener);
    }

}

interface ServiceAdapterInstance {
    gitService: GitServiceAdapter;
    workspaceService: WorkspaceServiceAdapter;
    syncService: SyncServiceAdapter;
    cleanup: () => void;
}

/**
 * Main service adapter factory - uses singleton pattern
 */
export class WorkspaceServiceAdapterFactory {
    static instance: ServiceAdapterInstance | null = null;

    static create(dependencies: ServiceAdapterDependencies) {
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
