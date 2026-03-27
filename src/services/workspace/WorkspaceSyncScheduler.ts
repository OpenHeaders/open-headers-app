/**
 * WorkspaceSyncScheduler — manages automatic syncing of Git-based workspaces.
 *
 * Orchestration only:
 *  - Starts/stops periodic sync timers per workspace
 *  - Handles workspace switching and update events
 *  - Network-aware pause/resume
 *  - Delegates data import to SyncDataImporter
 *  - Delegates change detection to SyncChangeDetector
 *  - Delegates IPC broadcasting to SyncBroadcaster
 */

import mainLogger from '../../utils/mainLogger';
import { isTransientNetworkError } from './git/operations/TeamWorkspaceSyncer';
import { broadcastToRenderers } from './sync/SyncBroadcaster';
import { checkForDataChanges } from './sync/SyncChangeDetector';
import { importSyncedData } from './sync/SyncDataImporter';
import { isSyncableWorkspace } from '../../types/workspace';
import type { Workspace, WorkspaceSyncStatus } from '../../types/workspace';
import type {
    SyncConfig,
    SyncStatus,
    SchedulerOptions,
    BroadcasterFn,
    GitSyncServiceLike,
    WorkspaceSettingsServiceLike,
    NetworkServiceLike,
    NetworkStateChange,
    SyncData,
    SyncStatusOwnerLike,
} from './sync/types';
import { SYNC_CONSTANTS } from './sync/types';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceSyncScheduler');

class WorkspaceSyncScheduler {
    private readonly gitSyncService: GitSyncServiceLike;
    private readonly workspaceSettingsService: WorkspaceSettingsServiceLike;
    private readonly networkService: NetworkServiceLike;
    private readonly broadcaster: BroadcasterFn | null;

    // Callback: notified when sync changes workspace data on disk
    onSyncDataChanged: ((workspaceId: string) => Promise<void>) | null = null;

    // Authoritative sync status owner (WorkspaceStateService). When set, sync status
    // updates go here instead of WorkspaceSettingsService, ensuring the renderer sees them.
    private syncStatusOwner: SyncStatusOwnerLike | null = null;

    // State
    private readonly syncTimers: Map<string, ReturnType<typeof setInterval>>;
    private syncInProgress: Map<string, boolean>;
    private readonly lastSyncTime: Map<string, number>;
    private readonly syncInterval: number;

    // Current active workspace
    private activeWorkspaceId: string | null;
    private activeWorkspace: Workspace | null;

    // Network offline tracking
    private networkOfflineTime: number | null;
    private lastGitConnectivityCheck: Map<string, number>;
    private gitConnectivityCache: Map<string, boolean>;

    constructor(
        gitSyncService: GitSyncServiceLike,
        workspaceSettingsService: WorkspaceSettingsServiceLike,
        networkService: NetworkServiceLike,
        options: SchedulerOptions = {}
    ) {
        this.gitSyncService = gitSyncService;
        this.workspaceSettingsService = workspaceSettingsService;
        this.networkService = networkService;
        this.broadcaster = options.broadcaster ?? null;

        this.syncTimers = new Map();
        this.syncInProgress = new Map();
        this.lastSyncTime = new Map();
        this.syncInterval = SYNC_CONSTANTS.DEFAULT_SYNC_INTERVAL;

        this.activeWorkspaceId = null;
        this.activeWorkspace = null;

        this.networkOfflineTime = null;
        this.lastGitConnectivityCheck = new Map();
        this.gitConnectivityCache = new Map();

        log.info('WorkspaceSyncScheduler initialized');
    }

    /**
     * Wire the authoritative sync status owner (WorkspaceStateService).
     * Must be called after WorkspaceStateService is created but before syncs run.
     */
    setSyncStatusOwner(owner: SyncStatusOwnerLike): void {
        this.syncStatusOwner = owner;
    }

    // ── Lifecycle ────────────────────────────────────────────────

    async initialize(): Promise<void> {
        this.networkService.on('stateChanged', (event: NetworkStateChange) => {
            if (!event.newState.isOnline && event.oldState.isOnline) {
                log.info('Network went offline, recording offline time');
                this.networkOfflineTime = Date.now();
            } else if (event.newState.isOnline && !event.oldState.isOnline) {
                log.info('Network restored, resuming sync schedules');
                this.networkOfflineTime = null;
                this.resumeAllSyncs();
            }
        });
    }

    async shutdown(): Promise<void> {
        log.info('Shutting down WorkspaceSyncScheduler');

        for (const [, timerId] of this.syncTimers) {
            clearInterval(timerId);
        }
        this.syncTimers.clear();

        // Wait for in-progress syncs to complete
        const inProgressSyncs = Array.from(this.syncInProgress.entries())
            .filter(([, inProgress]) => inProgress)
            .map(([workspaceId]) => workspaceId);

        if (inProgressSyncs.length > 0) {
            log.info(`Waiting for ${inProgressSyncs.length} syncs to complete...`);
            const startTime = Date.now();

            while (Date.now() - startTime < SYNC_CONSTANTS.SHUTDOWN_TIMEOUT) {
                const stillInProgress = inProgressSyncs.filter(id => this.syncInProgress.get(id));
                if (stillInProgress.length === 0) break;
                await new Promise(resolve => setTimeout(resolve, SYNC_CONSTANTS.SHUTDOWN_POLL_INTERVAL));
            }
        }

        log.info('WorkspaceSyncScheduler shutdown complete');
    }

    // ── Workspace events ─────────────────────────────────────────

    async onWorkspaceSwitch(workspaceId: string, options: { skipInitialSync?: boolean } = {}): Promise<void> {
        log.info(`Workspace switched to: ${workspaceId}`);

        if (this.activeWorkspaceId) {
            this.stopSync(this.activeWorkspaceId);
        }

        try {
            const workspaces = await this.workspaceSettingsService.getWorkspaces();
            const workspace = workspaces.find(w => w.id === workspaceId);
            if (!workspace) {
                log.warn(`Workspace ${workspaceId} not found`);
                return;
            }

            this.activeWorkspaceId = workspaceId;
            this.activeWorkspace = workspace;

            if (isSyncableWorkspace(workspace) && workspace.autoSync !== false) {
                this.startSync(workspaceId, workspace, { skipInitialSync: options.skipInitialSync });
            } else {
                log.info(`Workspace ${workspaceId} is not a Git workspace or has autoSync disabled`);
            }
        } catch (error) {
            log.error('Error handling workspace switch:', error);
        }
    }

    async onWorkspaceUpdated(workspaceId: string, workspace: Workspace): Promise<void> {
        log.info(`Workspace ${workspaceId} updated, autoSync: ${workspace.autoSync}`);

        try {
            await this.workspaceSettingsService.updateWorkspace(workspaceId, workspace);
        } catch (error) {
            log.error('Failed to update workspace in settings service:', error);
        }

        if (this.activeWorkspaceId === workspaceId) {
            this.stopSync(workspaceId);
            this.activeWorkspace = workspace;

            if (isSyncableWorkspace(workspace) && workspace.autoSync !== false) {
                log.info(`Restarting auto-sync for workspace ${workspaceId}`);
                this.startSync(workspaceId, workspace);
            } else {
                log.info(`Auto-sync disabled for workspace ${workspaceId}`);
            }
        }
    }

    // ── Timer management ─────────────────────────────────────────

    /**
     * Schedule periodic sync for a workspace.
     *
     * Always creates the timer — performSync is the gatekeeper that checks
     * network, git status, and dedup. This ensures the timer exists even if
     * the network is temporarily offline at call time (e.g., app starts
     * without WiFi, workspace switches during VPN toggle).
     */
    startSync(workspaceId: string, workspace: Workspace, options: { skipInitialSync?: boolean } = {}): void {
        if (this.syncTimers.has(workspaceId)) {
            log.debug(`Sync already scheduled for workspace ${workspaceId}`);
            return;
        }

        log.info(`Starting auto-sync for workspace ${workspaceId} (${workspace.name})`);

        if (!options.skipInitialSync) {
            this.performSync(workspaceId, workspace).catch(error => {
                log.error(`Initial sync failed for workspace ${workspaceId}:`, error);
            });
        }

        const timerId = setInterval(() => {
            this.performSync(workspaceId, workspace).catch(error => {
                log.error(`Periodic sync failed for workspace ${workspaceId}:`, error);
            });
        }, this.syncInterval);

        this.syncTimers.set(workspaceId, timerId);
    }

    stopSync(workspaceId: string): void {
        const timerId = this.syncTimers.get(workspaceId);
        if (timerId) {
            clearInterval(timerId);
            this.syncTimers.delete(workspaceId);
            log.info(`Stopped auto-sync for workspace ${workspaceId}`);
        }
    }

    // ── Sync execution ───────────────────────────────────────────

    async performSync(workspaceId: string, workspace: Workspace): Promise<void> {
        if (this.syncInProgress.get(workspaceId)) {
            log.debug(`Sync already in progress for workspace ${workspaceId}, skipping`);
            return;
        }

        const networkState = this.networkService.getState();

        // Check network + offline duration for force retry
        if (!networkState.isOnline) {
            if (this.networkOfflineTime) {
                const offlineDuration = Date.now() - this.networkOfflineTime;
                if (offlineDuration > SYNC_CONSTANTS.MAX_OFFLINE_DURATION) {
                    const gitReachable = await this.checkGitConnectivity(workspaceId, workspace);
                    if (!gitReachable) {
                        log.debug(`Git server not reachable, skipping sync for workspace ${workspaceId}`);
                        return;
                    }
                    log.info('Git server is reachable despite network offline state, forcing sync');
                } else {
                    log.debug(`Network offline for ${Math.round(offlineDuration / 1000)}s, waiting before retry`);
                    return;
                }
            } else {
                log.debug(`Network is offline, skipping sync for workspace ${workspaceId}`);
                return;
            }
        }

        const gitStatus = await this.gitSyncService.getGitStatus();
        if (!gitStatus.isInstalled) {
            log.warn('Git is not installed, skipping sync');
            return;
        }

        log.info(`Starting sync for workspace ${workspaceId} (${workspace.name})`);
        this.syncInProgress.set(workspaceId, true);

        try {
            const startTime = Date.now();

            const syncConfig: SyncConfig = {
                workspaceId,
                workspaceName: workspace.name,
                url: workspace.gitUrl,
                branch: workspace.gitBranch || SYNC_CONSTANTS.DEFAULT_GIT_BRANCH,
                path: workspace.gitPath || SYNC_CONSTANTS.DEFAULT_CONFIG_PATH,
                authType: workspace.authType || SYNC_CONSTANTS.DEFAULT_AUTH_TYPE,
                authData: workspace.authData ?? {}
            };

            const result = await this.gitSyncService.syncWorkspace(syncConfig);

            if (result.success) {
                const duration = Date.now() - startTime;
                this.lastSyncTime.set(workspaceId, Date.now());
                log.info(`Successfully synced workspace ${workspaceId} in ${duration}ms`);

                let hasChanges = false;
                if (result.data) {
                    hasChanges = await checkForDataChanges(workspaceId, result.data);

                    await importSyncedData(
                        workspaceId,
                        result.data,
                        { broadcastToExtensions: hasChanges },
                        this.broadcaster,
                        this.onSyncDataChanged
                    );

                    if (hasChanges) {
                        broadcastToRenderers('workspace-data-updated', {
                            workspaceId,
                            timestamp: Date.now(),
                            hasChanges: true
                        }, this.broadcaster);
                    } else {
                        log.info(`No changes detected for workspace ${workspaceId}, skipping UI refresh`);
                        broadcastToRenderers('workspace-sync-status', {
                            workspaceId,
                            syncing: false,
                            hasChanges: false
                        }, this.broadcaster);
                    }
                } else {
                    log.warn(`Sync succeeded but no data was returned for workspace ${workspaceId}`);
                }

                broadcastToRenderers('workspace-sync-completed', {
                    workspaceId,
                    success: true,
                    timestamp: Date.now(),
                    commitInfo: result.commitInfo,
                    hasChanges
                }, this.broadcaster);

                const shouldUpdateStatus = hasChanges || !this.lastSyncTime.has(workspaceId);
                if (shouldUpdateStatus) {
                    await this.updateSyncStatus(workspaceId, {
                        syncing: false,
                        lastSync: new Date().toISOString(),
                        error: null,
                        lastCommit: result.commitHash,
                        commitInfo: result.commitInfo
                    });
                } else {
                    await this.updateSyncStatus(workspaceId, { syncing: false, error: null });
                }
            } else {
                await this.handleSyncError(workspaceId, new Error(result.error || 'Sync failed'));
            }
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.handleSyncError(workspaceId, err);
        } finally {
            this.syncInProgress.set(workspaceId, false);
        }
    }

    async manualSync(workspaceId: string): Promise<{ success: boolean; error?: string }> {
        const workspaces = await this.workspaceSettingsService.getWorkspaces();
        const workspace = workspaces.find(w => w.id === workspaceId);

        if (!workspace) {
            const error = `Workspace ${workspaceId} not found`;
            log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
            return { success: false, error };
        }

        if (!isSyncableWorkspace(workspace)) {
            const error = 'Only Git/Team workspaces can be synced';
            log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
            return { success: false, error };
        }

        try {
            await this.performSync(workspaceId, workspace);
            return { success: true };
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log.error(`Manual sync failed for workspace ${workspaceId}:`, error);
            return { success: false, error: errMsg };
        }
    }

    // ── Network / connectivity ───────────────────────────────────

    private async checkGitConnectivity(workspaceId: string, workspace: Workspace): Promise<boolean> {
        const now = Date.now();
        const lastCheck = this.lastGitConnectivityCheck.get(workspaceId) ?? 0;

        if (now - lastCheck < SYNC_CONSTANTS.GIT_CONNECTIVITY_CHECK_INTERVAL) {
            const cached = this.gitConnectivityCache.get(workspaceId);
            if (cached !== undefined) {
                log.debug(`Using cached Git connectivity result for ${workspaceId}: ${cached}`);
                return cached;
            }
        }

        try {
            log.info(`Checking Git connectivity for workspace ${workspaceId} to ${workspace.gitUrl}`);

            const result = await Promise.race([
                this.gitSyncService.testConnection({
                    url: workspace.gitUrl,
                    branch: workspace.gitBranch || SYNC_CONSTANTS.DEFAULT_GIT_BRANCH,
                    authType: workspace.authType || SYNC_CONSTANTS.DEFAULT_AUTH_TYPE,
                    authData: workspace.authData ?? {}
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Git connectivity check timeout')), 15000)
                )
            ]);

            const isReachable = result.success;
            this.lastGitConnectivityCheck.set(workspaceId, now);
            this.gitConnectivityCache.set(workspaceId, isReachable);
            log.info(`Git connectivity check for ${workspaceId}: ${isReachable ? 'SUCCESS' : 'FAILED'}`);
            return isReachable;
        } catch (error) {
            log.error(`Git connectivity check failed for ${workspaceId}:`, error);
            this.lastGitConnectivityCheck.set(workspaceId, now);
            this.gitConnectivityCache.set(workspaceId, false);
            return false;
        }
    }

    /**
     * Resume syncing after network recovery.
     *
     * Ensures the periodic timer exists (covers the case where startSync was
     * called while offline — the timer is always created now, but older code
     * paths may have cleared it). Then triggers an immediate sync after a
     * short delay so the user doesn't wait up to an hour for the next tick.
     */
    private async resumeAllSyncs(): Promise<void> {
        this.networkOfflineTime = null;
        this.gitConnectivityCache.clear();
        this.lastGitConnectivityCheck.clear();

        if (!this.activeWorkspaceId || !this.activeWorkspace) return;
        if (!isSyncableWorkspace(this.activeWorkspace) || this.activeWorkspace.autoSync === false) return;

        // Ensure periodic timer exists (idempotent — startSync checks syncTimers map)
        this.startSync(this.activeWorkspaceId, this.activeWorkspace, { skipInitialSync: true });

        // Immediate sync after short delay — don't wait for next hourly tick
        const workspaceId = this.activeWorkspaceId;
        const workspace = this.activeWorkspace;

        setTimeout(async () => {
            try {
                if (!this.networkService.getState().isOnline) {
                    log.info(`Network went offline again, skipping deferred sync for ${workspaceId}`);
                    return;
                }

                log.info(`Performing deferred sync for workspace ${workspaceId} after network recovery`);
                await this.performSync(workspaceId, workspace);
            } catch (error) {
                log.error(`Failed to sync workspace ${workspaceId} after network recovery:`, error);
            }
        }, SYNC_CONSTANTS.RESUME_SYNC_DELAY);
    }

    // ── Error handling / status ───────────────────────────────────

    private async handleSyncError(workspaceId: string, error: Error): Promise<void> {
        if (isTransientNetworkError(error.message)) {
            log.warn(`Sync skipped for workspace ${workspaceId} (transient): ${error.message}`);
        } else {
            log.error(`Failed to sync workspace ${workspaceId}:`, error);
        }

        broadcastToRenderers('workspace-sync-completed', {
            workspaceId,
            success: false,
            error: error.message,
            timestamp: Date.now()
        }, this.broadcaster);

        await this.updateSyncStatus(workspaceId, { syncing: false, error: error.message });
    }

    private async updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus): Promise<void> {
        // Primary: update WorkspaceStateService (owns workspaces.json, pushes patches to renderer)
        if (this.syncStatusOwner) {
            this.syncStatusOwner.updateSyncStatus(workspaceId, status);
        }

        // Secondary: also persist via WorkspaceSettingsService for backward compat.
        // WorkspaceStateService auto-save will overwrite syncStatus in workspaces.json,
        // so this is only relevant if syncStatusOwner is not wired (e.g., during tests).
        if (!this.syncStatusOwner) {
            try {
                await this.workspaceSettingsService.updateSyncStatus(workspaceId, status);
            } catch (error) {
                log.error('Failed to update sync status:', error);
            }
        }
    }

    getSyncStatus(): Record<string, SyncStatus> {
        const status: Record<string, SyncStatus> = {};
        for (const [workspaceId] of this.syncTimers) {
            status[workspaceId] = {
                scheduled: true,
                syncing: this.syncInProgress.get(workspaceId) ?? false,
                lastSync: this.lastSyncTime.get(workspaceId) ?? null
            };
        }
        return status;
    }

    /**
     * Import synced data — public for use by workspaceHandlers initial sync.
     */
    async importSyncedData(workspaceId: string, data: SyncData, options: { broadcastToExtensions?: boolean } = {}): Promise<void> {
        return importSyncedData(workspaceId, data, options, this.broadcaster, this.onSyncDataChanged);
    }
}

export { WorkspaceSyncScheduler };
export default WorkspaceSyncScheduler;
