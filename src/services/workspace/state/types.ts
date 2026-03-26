/**
 * Shared types for WorkspaceStateService and its submodules.
 */

import type { Source } from '../../../types/source';
import type { Workspace, WorkspaceMetadata, WorkspaceSyncStatus } from '../../../types/workspace';
import type { HeaderRule, RulesCollection } from '../../../types/rules';
import type { ProxyRule } from '../../../types/proxy';
import type { SyncData } from '../sync/types';

// ── State shape ───────────────────────────────────────────────────

export interface WorkspaceState {
    initialized: boolean;
    loading: boolean;
    error: string | null;
    workspaces: Workspace[];
    activeWorkspaceId: string;
    isWorkspaceSwitching: boolean;
    syncStatus: Record<string, WorkspaceSyncStatus>;
    sources: Source[];
    rules: RulesCollection;
    proxyRules: ProxyRule[];
}

// ── External service interfaces ───────────────────────────────────

export interface WebSocketServiceLike {
    sources: Source[];
    rules: RulesCollection;
    sourceHandler: { broadcastSources(): void };
    ruleHandler: { broadcastRules(): void };
    environmentHandler: EnvironmentResolverLike;
}

export interface ProxyServiceLike {
    switchWorkspace(workspaceId: string): Promise<void>;
    updateSources(sources: Source[]): void;
    updateHeaderRules(rules: HeaderRule[]): void;
    updateProxyRules(rules: ProxyRule[]): void;
    updateEnvironmentVariables(variables: Record<string, string | { value: string }> | null): void;
    clearRules(): void;
}

export interface EnvironmentResolverLike {
    loadEnvironmentVariables(): Record<string, string>;
    resolveTemplate(template: string, variables: Record<string, string>): string;
    setVariables(variables: Record<string, string>): void;
    clearVariableCache(): void;
}

export interface SourceRefreshServiceLike {
    updateSource(source: Source): Promise<void>;
    removeSourcesNotIn(ids: Set<string>): Promise<void>;
    clearAllSources(): Promise<void>;
    manualRefresh(sourceId: string): Promise<{ success: boolean; error?: string }>;
    resetCircuitBreaker(sourceId: string): void;
    fetchOnce?(source: Source): Promise<{ content: string; originalResponse: string | null; headers: Record<string, string>; isFiltered: boolean; filteredWith: string | null }>;
}

export interface WorkspaceSyncSchedulerLike {
    onWorkspaceSwitch(workspaceId: string, options?: { skipInitialSync?: boolean }): Promise<void>;
    onWorkspaceUpdated(workspaceId: string, workspace: Workspace): Promise<void>;
    importSyncedData(workspaceId: string, data: SyncData, options?: { broadcastToExtensions?: boolean }): Promise<void>;
}

// ── Dirty tracking ────────────────────────────────────────────────

export interface DirtyFlags {
    sources: boolean;
    rules: boolean;
    proxyRules: boolean;
    workspaces: boolean;
}

// ── Context passed to CRUD submodules ─────────────────────────────

/**
 * Shared context that CRUD operations receive from the orchestrator.
 * Provides mutable access to state, dirty flags, and services without
 * coupling the submodules to the WorkspaceStateService class.
 */
export interface StateContext {
    state: WorkspaceState;
    dirty: DirtyFlags;
    appDataPath: string;
    webSocketService: WebSocketServiceLike | null;
    proxyService: ProxyServiceLike | null;
    envResolver: EnvironmentResolverLike | null;
    sourceRefreshService: SourceRefreshServiceLike | null;
    syncScheduler: WorkspaceSyncSchedulerLike | null;
    scheduleDebouncedSave(): void;
    saveAll(): Promise<void>;
    saveSources(): Promise<void>;
    saveWorkspacesConfig(): Promise<void>;
    loadWorkspaceData(workspaceId: string): Promise<void>;
    updateWorkspaceMetadataInMemory(workspaceId: string, metadata: Partial<WorkspaceMetadata>): void;
}
