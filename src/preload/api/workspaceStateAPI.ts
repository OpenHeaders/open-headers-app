/**
 * Preload API for WorkspaceStateService.
 *
 * Exposes typed IPC methods on window.electronAPI.workspaceState.
 * The renderer hydrates from main on window open, then receives
 * incremental state patches via IPC events.
 */

import { ipcRenderer } from 'electron';
import type { Source, SourceUpdate } from '../../types/source';
import type { HeaderRule } from '../../types/rules';
import type { ProxyRule } from '../../types/proxy';
import type { Workspace, WorkspaceType } from '../../types/workspace';
import type { WorkspaceState } from '../../services/workspace/WorkspaceStateService';

export interface WorkspaceStatePatch {
    sources?: Source[];
    rules?: { header: HeaderRule[]; request: unknown[]; response: unknown[] };
    proxyRules?: ProxyRule[];
    workspaces?: Workspace[];
    activeWorkspaceId?: string;
    syncStatus?: Record<string, unknown>;
    loading?: boolean;
    error?: string | null;
    initialized?: boolean;
    isWorkspaceSwitching?: boolean;
}

export interface SwitchProgress {
    step: string;
    progress: number;
    label: string;
    isGitOperation: boolean;
}

interface OperationResult {
    success: boolean;
    error?: string;
}

interface InitResult extends OperationResult {
    state: WorkspaceState;
}

interface AddSourceResult extends OperationResult {
    source?: Source;
}

interface UpdateSourceResult extends OperationResult {
    source?: Source | null;
}

interface CreateWorkspaceResult extends OperationResult {
    workspace?: Workspace;
}

export function createWorkspaceStateAPI() {
    return {
        // State access
        initialize: (): Promise<InitResult> =>
            ipcRenderer.invoke('workspace-state:initialize'),

        getState: (): Promise<WorkspaceState> =>
            ipcRenderer.invoke('workspace-state:get-state'),

        // Workspace switching
        switchWorkspace: (workspaceId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:switch-workspace', workspaceId),

        // Source CRUD
        addSource: (sourceData: Source): Promise<AddSourceResult> =>
            ipcRenderer.invoke('workspace-state:add-source', sourceData),

        updateSource: (sourceId: string, updates: SourceUpdate): Promise<UpdateSourceResult> =>
            ipcRenderer.invoke('workspace-state:update-source', sourceId, updates),

        removeSource: (sourceId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:remove-source', sourceId),

        updateSourceContent: (sourceId: string, content: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:update-source-content', sourceId, content),

        refreshSource: (sourceId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:refresh-source', sourceId),

        importSources: (sources: Source[], replace: boolean): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:import-sources', sources, replace),

        // Header Rule CRUD
        addHeaderRule: (ruleData: Partial<HeaderRule>): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:add-header-rule', ruleData),

        updateHeaderRule: (ruleId: string, updates: Partial<HeaderRule>): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:update-header-rule', ruleId, updates),

        removeHeaderRule: (ruleId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:remove-header-rule', ruleId),

        // Proxy Rule CRUD
        addProxyRule: (ruleData: ProxyRule): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:add-proxy-rule', ruleData),

        removeProxyRule: (ruleId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:remove-proxy-rule', ruleId),

        // Workspace CRUD
        createWorkspace: (workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }): Promise<CreateWorkspaceResult> =>
            ipcRenderer.invoke('workspace-state:create-workspace', workspace),

        updateWorkspace: (workspaceId: string, updates: Partial<Workspace>): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:update-workspace', workspaceId, updates),

        deleteWorkspace: (workspaceId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:delete-workspace', workspaceId),

        syncWorkspace: (workspaceId: string): Promise<OperationResult> =>
            ipcRenderer.invoke('workspace-state:sync-workspace', workspaceId),

        // IPC event listeners (main → renderer)
        onStatePatch: (callback: (patch: WorkspaceStatePatch) => void): (() => void) => {
            const handler = (_event: Electron.IpcRendererEvent, patch: WorkspaceStatePatch) => callback(patch);
            ipcRenderer.on('workspace:state-patch', handler);
            return () => ipcRenderer.removeListener('workspace:state-patch', handler);
        },

        onSwitchProgress: (callback: (progress: SwitchProgress) => void): (() => void) => {
            const handler = (_event: Electron.IpcRendererEvent, progress: SwitchProgress) => callback(progress);
            ipcRenderer.on('workspace:switch-progress', handler);
            return () => ipcRenderer.removeListener('workspace:switch-progress', handler);
        }
    };
}

export type WorkspaceStateAPI = ReturnType<typeof createWorkspaceStateAPI>;
