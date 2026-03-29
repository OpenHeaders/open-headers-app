/**
 * Shared types for workspace synchronization.
 *
 * Used by WorkspaceSyncScheduler, SyncDataImporter, SyncChangeDetector,
 * and SyncBroadcaster.
 */

import type { Source } from '../../../types/source';
import type { Workspace, WorkspaceAuthData, WorkspaceSyncStatus, CommitInfo } from '../../../types/workspace';
import type { RulesCollection } from '../../../types/rules';
import type { ProxyRule } from '../../../types/proxy';
import type { EnvironmentMap, EnvironmentSchema } from '../../../types/environment';

// ── Sync operation types ─────────────────────────────────────────

export interface SyncConfig {
    workspaceId: string;
    workspaceName: string;
    url: string | undefined;
    branch: string;
    path: string;
    authType: string;
    authData: WorkspaceAuthData;
}

export interface SyncResult {
    success: boolean;
    error?: string;
    data?: SyncData;
    commitHash?: string;
    commitInfo?: CommitInfo;
}

export interface SyncData {
    sources?: Source[];
    rules?: RulesCollection;
    proxyRules?: ProxyRule[];
    environments?: EnvironmentMap;
    environmentSchema?: EnvironmentSchema;
}

/**
 * Outcome of a performSync call.
 *
 * performSync serves two callers with different needs:
 *  - Timer-driven syncs: fire-and-forget, silently ignore skipped syncs.
 *  - User-initiated (manualSync): must surface skip reasons as user-facing errors.
 *
 * Rather than returning void (which conflates "ran" with "decided not to run"),
 * performSync returns a typed result so each caller can interpret the outcome
 * according to its context. This keeps workspace resolution in one place while
 * giving user-facing paths enough information to report meaningful errors.
 */
export type PerformSyncResult =
    | { outcome: 'completed' }
    | { outcome: 'skipped'; reason: SyncSkipReason };

/**
 * Return value from executeSyncCore — pure data, no side effects on sync status.
 *
 * performSync is the sole owner of sync status lifecycle transitions.
 * executeSyncCore does the git work and returns what happened so performSync
 * can update status consistently.
 */
export interface SyncCoreResult {
    success: boolean;
    error?: string;
    hasChanges: boolean;
    commitHash?: string;
    commitInfo?: CommitInfo;
}

export type SyncSkipReason =
    | 'already_in_progress'
    | 'workspace_not_found'
    | 'workspace_not_syncable'
    | 'network_offline'
    | 'git_not_installed';

/** Human-readable messages for sync skip reasons, used by user-facing callers. */
export const SYNC_SKIP_MESSAGES: Record<SyncSkipReason, string> = {
    already_in_progress: 'Sync is already in progress',
    workspace_not_found: 'Workspace not found',
    workspace_not_syncable: 'Only Git/Team workspaces can be synced',
    network_offline: 'Network is offline',
    git_not_installed: 'Git is not installed',
};

export interface SyncStatus {
    scheduled: boolean;
    syncing: boolean;
    lastSync: number | null;
}

// ── Service interfaces ───────────────────────────────────────────

export interface GitSyncServiceLike {
    getGitStatus(): Promise<{ isInstalled: boolean; version?: string; error?: string }>;
    syncWorkspace(config: SyncConfig): Promise<SyncResult>;
    testConnection(config: { url?: string; branch?: string; authType?: string; authData?: WorkspaceAuthData }): Promise<{ success: boolean; error?: string }>;
}

export interface WorkspaceSettingsServiceLike {
    getWorkspaces(): Promise<Workspace[]>;
    updateWorkspace(workspaceId: string, workspace: Partial<Workspace>): Promise<Workspace>;
    updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus): Promise<void>;
}

/**
 * Interface for the authoritative sync status owner (WorkspaceStateService).
 * WorkspaceSyncScheduler uses this to push sync status so the renderer stays in sync.
 */
export interface SyncStatusOwnerLike {
    updateSyncStatus(workspaceId: string, status: Partial<WorkspaceSyncStatus>): void;
}

export interface NetworkServiceLike {
    on(event: string, handler: (...args: unknown[]) => void): void;
    getState(): NetworkState;
}

export interface NetworkState {
    isOnline: boolean;
}

// ── Scheduler options ────────────────────────────────────────────

export interface SchedulerOptions {
    broadcaster?: BroadcasterFn | null;
}

// ── Broadcast types ──────────────────────────────────────────────

export interface WorkspaceBroadcastBase {
    workspaceId: string;
    timestamp?: number;
}

export interface SyncCompletedBroadcast extends WorkspaceBroadcastBase {
    success: boolean;
    error?: string;
    commitInfo?: CommitInfo;
    hasChanges?: boolean;
}

export interface SyncStatusBroadcast extends WorkspaceBroadcastBase {
    syncing: boolean;
    hasChanges: boolean;
}

export interface SyncWarningBroadcast extends WorkspaceBroadcastBase {
    warning: string;
}

export interface DataUpdatedBroadcast extends WorkspaceBroadcastBase {
    hasChanges: boolean;
}

export interface WorkspaceNotificationBroadcast extends WorkspaceBroadcastBase {
    timestamp: number;
}

export type WorkspaceBroadcastData =
    | SyncCompletedBroadcast
    | SyncStatusBroadcast
    | SyncWarningBroadcast
    | DataUpdatedBroadcast
    | WorkspaceNotificationBroadcast;

export type BroadcasterFn = (channel: string, data: WorkspaceBroadcastData) => void;

// ── Constants ────────────────────────────────────────────────────

export const SYNC_CONSTANTS = {
    DEFAULT_SYNC_INTERVAL: 60 * 60 * 1000,       // 1 hour
    DEFAULT_GIT_BRANCH: 'main',
    DEFAULT_CONFIG_PATH: 'config/open-headers.json',
    DEFAULT_AUTH_TYPE: 'none',
    SHUTDOWN_TIMEOUT: 30000,                       // 30 seconds
    SHUTDOWN_POLL_INTERVAL: 500,                   // 0.5 seconds
    MAX_OFFLINE_DURATION: 30 * 60 * 1000,          // 30 minutes before forcing retry
    GIT_CONNECTIVITY_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    RESUME_SYNC_DELAY: 5000,                       // 5 seconds delay after network recovery
} as const;
