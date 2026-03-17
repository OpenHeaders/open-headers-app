import electron from 'electron';
const { ipcRenderer } = electron;

const workspaceAPI = {
    // WebSocket status
    wsGetConnectionStatus: (): Promise<unknown> => ipcRenderer.invoke('ws-get-connection-status'),
    wsCheckCertTrust: (): Promise<unknown> => ipcRenderer.invoke('ws-check-cert-trust'),
    wsTrustCert: (): Promise<unknown> => ipcRenderer.invoke('ws-trust-cert'),
    wsUntrustCert: (): Promise<unknown> => ipcRenderer.invoke('ws-untrust-cert'),

    // Core workspace operations
    initializeWorkspaceSync: (workspaceId: string): Promise<unknown> => ipcRenderer.invoke('initializeWorkspaceSync', workspaceId),
    deleteWorkspace: (workspaceId: string): Promise<unknown> => ipcRenderer.invoke('deleteWorkspace', workspaceId),
    deleteWorkspaceFolder: (workspaceId: string): Promise<unknown> => ipcRenderer.invoke('deleteWorkspaceFolder', workspaceId),
    syncWorkspace: (workspaceId: string, options: unknown): Promise<unknown> => ipcRenderer.invoke('workspace-sync', workspaceId, options),

    // Workspace management operations
    workspaceTestConnection: (gitConfig: unknown): Promise<unknown> => ipcRenderer.invoke('workspace-test-connection', gitConfig),
    workspaceSyncAll: (): Promise<unknown> => ipcRenderer.invoke('workspace-sync-all'),
    workspaceGetSyncStatus: (): Promise<unknown> => ipcRenderer.invoke('workspace-get-sync-status'),
    workspaceAutoSyncEnabled: (): Promise<unknown> => ipcRenderer.invoke('workspace-auto-sync-enabled'),
    workspaceOpenFolder: (workspaceId: string): Promise<unknown> => ipcRenderer.invoke('workspace-open-folder', workspaceId),
    servicesHealthCheck: (): Promise<unknown> => ipcRenderer.invoke('services-health-check'),

    // Event listeners for workspace sync
    onWorkspaceSyncProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('workspace-sync-progress', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-progress', subscription);
    },

    onWorkspaceSyncCompleted: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('workspace-sync-completed', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-completed', subscription);
    },

    onWorkspaceSyncStarted: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('workspace-sync-started', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-started', subscription);
    },

    onWorkspaceDataUpdated: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('workspace-data-updated', subscription);
        return () => ipcRenderer.removeListener('workspace-data-updated', subscription);
    },

    onCliWorkspaceJoined: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('cli-workspace-joined', subscription);
        return () => ipcRenderer.removeListener('cli-workspace-joined', subscription);
    },

    onEnvironmentsStructureChanged: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('environments-structure-changed', subscription);
        return () => ipcRenderer.removeListener('environments-structure-changed', subscription);
    },

    onWsConnectionStatusChanged: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('ws-connection-status-changed', subscription);
        return () => ipcRenderer.removeListener('ws-connection-status-changed', subscription);
    },

    // Team workspace invite processing
    onProcessTeamWorkspaceInvite: (callback: (inviteData: unknown) => void): (() => void) => {
        const subscription = (event: unknown, inviteData: unknown) => callback(inviteData);
        ipcRenderer.on('process-team-workspace-invite', subscription);
        return () => ipcRenderer.removeListener('process-team-workspace-invite', subscription);
    },

    onShowErrorMessage: (callback: (errorData: unknown) => void): (() => void) => {
        const subscription = (event: unknown, errorData: unknown) => callback(errorData);
        ipcRenderer.on('show-error-message', subscription);
        return () => ipcRenderer.removeListener('show-error-message', subscription);
    },

    // Generate invite links for team workspaces
    generateTeamWorkspaceInvite: (workspaceData: unknown): Promise<unknown> => ipcRenderer.invoke('generate-team-workspace-invite', workspaceData),

    // Generate environment config links
    generateEnvironmentConfigLink: (environmentData: unknown): Promise<unknown> => ipcRenderer.invoke('generate-environment-config-link', environmentData),

    // Environment config import processing
    onProcessEnvironmentConfigImport: (callback: (envData: unknown) => void): (() => void) => {
        const subscription = (event: unknown, envData: unknown) => {
            callback(envData);
        };
        ipcRenderer.on('process-environment-config-import', subscription);
        return () => {
            ipcRenderer.removeListener('process-environment-config-import', subscription);
        };
    }
};

export default workspaceAPI;
