const { ipcRenderer } = require('electron');

const workspaceAPI = {
    // WebSocket status
    wsGetConnectionStatus: () => ipcRenderer.invoke('ws-get-connection-status'),
    
    // Core workspace operations
    initializeWorkspaceSync: (workspaceId) => ipcRenderer.invoke('initializeWorkspaceSync', workspaceId),
    deleteWorkspace: (workspaceId) => ipcRenderer.invoke('deleteWorkspace', workspaceId),
    syncWorkspace: (workspaceId, options) => ipcRenderer.invoke('workspace-sync', workspaceId, options),
    
    // Workspace management operations
    workspaceTestConnection: (gitConfig) => ipcRenderer.invoke('workspace-test-connection', gitConfig),
    workspaceSyncAll: () => ipcRenderer.invoke('workspace-sync-all'),
    workspaceGetSyncStatus: () => ipcRenderer.invoke('workspace-get-sync-status'),
    workspaceAutoSyncEnabled: () => ipcRenderer.invoke('workspace-auto-sync-enabled'),
    workspaceOpenFolder: (workspaceId) => ipcRenderer.invoke('workspace-open-folder', workspaceId),
    servicesHealthCheck: () => ipcRenderer.invoke('services-health-check'),
    
    // Event listeners for workspace sync
    onWorkspaceSyncProgress: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('workspace-sync-progress', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-progress', subscription);
    },
    
    onWorkspaceSyncCompleted: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('workspace-sync-completed', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-completed', subscription);
    },
    
    onWorkspaceSyncStarted: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('workspace-sync-started', subscription);
        return () => ipcRenderer.removeListener('workspace-sync-started', subscription);
    },
    
    onWorkspaceDataUpdated: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('workspace-data-updated', subscription);
        return () => ipcRenderer.removeListener('workspace-data-updated', subscription);
    },
    
    onEnvironmentsStructureChanged: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('environments-structure-changed', subscription);
        return () => ipcRenderer.removeListener('environments-structure-changed', subscription);
    },
    
    onWsConnectionStatusChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('ws-connection-status-changed', subscription);
        return () => ipcRenderer.removeListener('ws-connection-status-changed', subscription);
    },
    
    // Team workspace invite processing
    onProcessTeamWorkspaceInvite: (callback) => {
        const subscription = (event, inviteData) => callback(inviteData);
        ipcRenderer.on('process-team-workspace-invite', subscription);
        return () => ipcRenderer.removeListener('process-team-workspace-invite', subscription);
    },
    
    onShowErrorMessage: (callback) => {
        const subscription = (event, errorData) => callback(errorData);
        ipcRenderer.on('show-error-message', subscription);
        return () => ipcRenderer.removeListener('show-error-message', subscription);
    },
    
    // Generate invite links for team workspaces
    generateTeamWorkspaceInvite: (workspaceData) => ipcRenderer.invoke('generate-team-workspace-invite', workspaceData),
    
    // Generate environment config links
    generateEnvironmentConfigLink: (environmentData) => ipcRenderer.invoke('generate-environment-config-link', environmentData),
    
    // Environment config import processing
    onProcessEnvironmentConfigImport: (callback) => {
        console.log('=== REGISTERING ENVIRONMENT IMPORT LISTENER ===');
        const subscription = (event, envData) => {
            console.log('=== PRELOAD: RECEIVED ENVIRONMENT IMPORT EVENT ===');
            console.log('Event:', event);
            console.log('Data:', envData);
            callback(envData);
        };
        ipcRenderer.on('process-environment-config-import', subscription);
        console.log('Environment import listener registered successfully');
        return () => {
            console.log('Removing environment import listener');
            ipcRenderer.removeListener('process-environment-config-import', subscription);
        };
    }
};

module.exports = workspaceAPI;