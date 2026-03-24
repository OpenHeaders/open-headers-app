import electron from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { OperationResult } from '../../types/common';
import type {
    Workspace,
    WorkspaceAuthData,
    TeamWorkspaceInvite,
    WorkspaceSyncCompletedData,
    WorkspaceDataUpdatedData,
    CliWorkspaceJoinedData,
    ServicesHealth,
} from '../../types/workspace';
import type { EnvironmentMap, EnvironmentSchema, EnvironmentConfigData } from '../../types/environment';

const { ipcRenderer } = electron;

/** WebSocket connection status returned by the main process. */
interface WsConnectionStatus {
    totalConnections: number;
    browserCounts: Record<string, number>;
    clients: {
        id: string;
        browser: string;
        browserVersion: string;
        platform: string;
        connectionType: string;
        connectedAt: number;
        lastActivity: number;
        extensionVersion: string;
    }[];
    wsServerRunning: boolean;
    wsPort: number;
    error?: string;
}

/** Sync status per workspace. */
interface SyncStatus {
    scheduled: boolean;
    syncing: boolean;
    lastSync: number | null;
}

/** Workspace sync options from the renderer. */
interface WorkspaceSyncOptions {
    silent?: boolean;
}

/** Git config for testing connection. */
interface GitTestConfig {
    url?: string;
    branch?: string;
    authType?: string;
    authData?: WorkspaceAuthData;
}

/** Result from generateTeamWorkspaceInvite. */
interface GenerateInviteResult {
    success: boolean;
    inviteData?: TeamWorkspaceInvite;
    links?: { appLink: string; webLink: string };
    error?: string;
}

/** Result from generateEnvironmentConfigLink. */
interface GenerateEnvLinkResult {
    success: boolean;
    envConfigData?: EnvironmentConfigData;
    links?: { appLink: string; webLink: string; dataSize: number };
    error?: string;
}

/** Data for environment config link generation. */
interface EnvironmentLinkData {
    environments?: EnvironmentMap;
    environmentSchema?: EnvironmentSchema;
    includeValues?: boolean;
}

const workspaceAPI = {
    // WebSocket status
    wsGetConnectionStatus: (): Promise<WsConnectionStatus> => ipcRenderer.invoke('ws-get-connection-status'),

    // Core workspace operations
    initializeWorkspaceSync: (workspaceId: string): Promise<OperationResult> => ipcRenderer.invoke('initializeWorkspaceSync', workspaceId),
    deleteWorkspace: (workspaceId: string): Promise<OperationResult> => ipcRenderer.invoke('deleteWorkspace', workspaceId),
    deleteWorkspaceFolder: (workspaceId: string): Promise<OperationResult> => ipcRenderer.invoke('deleteWorkspaceFolder', workspaceId),
    syncWorkspace: (workspaceId: string, options: WorkspaceSyncOptions): Promise<OperationResult> => ipcRenderer.invoke('workspace-sync', workspaceId, options),

    // Workspace management operations
    workspaceTestConnection: (gitConfig: GitTestConfig): Promise<OperationResult> => ipcRenderer.invoke('workspace-test-connection', gitConfig),
    workspaceSyncAll: (): Promise<OperationResult> => ipcRenderer.invoke('workspace-sync-all'),
    workspaceGetSyncStatus: (): Promise<Record<string, SyncStatus>> => ipcRenderer.invoke('workspace-get-sync-status'),
    workspaceAutoSyncEnabled: (): Promise<boolean> => ipcRenderer.invoke('workspace-auto-sync-enabled'),
    workspaceOpenFolder: (workspaceId: string): Promise<OperationResult> => ipcRenderer.invoke('workspace-open-folder', workspaceId),
    servicesHealthCheck: (): Promise<ServicesHealth> => ipcRenderer.invoke('services-health-check'),

    // Event listeners for workspace sync
    onWorkspaceSyncProgress: (callback: (data: WorkspaceSyncCompletedData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: WorkspaceSyncCompletedData) => callback(data);
        ipcRenderer.on('workspace-sync-progress', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-progress', subscription);
    },

    onWorkspaceSyncCompleted: (callback: (data: WorkspaceSyncCompletedData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: WorkspaceSyncCompletedData) => callback(data);
        ipcRenderer.on('workspace-sync-completed', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-completed', subscription);
    },

    onWorkspaceSyncStarted: (callback: (data: WorkspaceSyncCompletedData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: WorkspaceSyncCompletedData) => callback(data);
        ipcRenderer.on('workspace-sync-started', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-started', subscription);
    },

    onWorkspaceDataUpdated: (callback: (data: WorkspaceDataUpdatedData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: WorkspaceDataUpdatedData) => callback(data);
        ipcRenderer.on('workspace-data-updated', subscription);
        return () => ipcRenderer.removeListener('workspace-data-updated', subscription);
    },

    onCliWorkspaceJoined: (callback: (data: CliWorkspaceJoinedData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: CliWorkspaceJoinedData) => callback(data);
        ipcRenderer.on('cli-workspace-joined', subscription);
        return () => ipcRenderer.removeListener('cli-workspace-joined', subscription);
    },

    onEnvironmentsStructureChanged: (callback: (data: { workspaceId: string; timestamp: number }) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: { workspaceId: string; timestamp: number }) => callback(data);
        ipcRenderer.on('environments-structure-changed', subscription);
        return () => ipcRenderer.removeListener('environments-structure-changed', subscription);
    },

    onWsConnectionStatusChanged: (callback: (data: WsConnectionStatus) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: WsConnectionStatus) => callback(data);
        ipcRenderer.on('ws-connection-status-changed', subscription);
        return () => ipcRenderer.removeListener('ws-connection-status-changed', subscription);
    },

    // Team workspace invite processing
    onProcessTeamWorkspaceInvite: (callback: (inviteData: TeamWorkspaceInvite) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, inviteData: TeamWorkspaceInvite) => callback(inviteData);
        ipcRenderer.on('process-team-workspace-invite', subscription);
        return () => ipcRenderer.removeListener('process-team-workspace-invite', subscription);
    },

    onShowErrorMessage: (callback: (errorData: { title?: string; message: string }) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, errorData: { title?: string; message: string }) => callback(errorData);
        ipcRenderer.on('show-error-message', subscription);
        return () => ipcRenderer.removeListener('show-error-message', subscription);
    },

    // Generate invite links for team workspaces
    generateTeamWorkspaceInvite: (workspaceData: Partial<Workspace> & { includeAuthData?: boolean }): Promise<GenerateInviteResult> => ipcRenderer.invoke('generate-team-workspace-invite', workspaceData),

    // Generate environment config links
    generateEnvironmentConfigLink: (environmentData: EnvironmentLinkData): Promise<GenerateEnvLinkResult> => ipcRenderer.invoke('generate-environment-config-link', environmentData),

    // Environment config import processing
    onProcessEnvironmentConfigImport: (callback: (envData: EnvironmentConfigData) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, envData: EnvironmentConfigData) => {
            callback(envData);
        };
        ipcRenderer.on('process-environment-config-import', subscription);
        return () => {
            ipcRenderer.removeListener('process-environment-config-import', subscription);
        };
    }
};

export default workspaceAPI;
