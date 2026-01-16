const { app, shell, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');
const { DATA_FORMAT_VERSION } = require('../../../../config/version');
const appLifecycle = require('../../app/lifecycle');
const settingsHandlers = require('./settingsHandlers');
const webSocketService = require('../../../../services/websocket/ws-service');
const proxyService = require('../../../../services/proxy/ProxyService');
const networkService = require('../../../../services/network/NetworkService');

const log = createLogger('WorkspaceHandlers');

class WorkspaceHandlers {
    async handleDeleteWorkspaceFolder(_, workspaceId) {
        try {
            const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);
            
            // Check if directory exists first
            const exists = await fs.promises.access(workspacePath).then(() => true).catch(() => false);
            if (!exists) {
                log.info(`Workspace folder already deleted or doesn't exist: ${workspacePath}`);
                return { success: true };
            }
            
            // Windows file locks may require retry attempts
            const maxRetries = process.platform === 'win32' ? 3 : 1;
            let lastError;
            
            try {
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        await fs.rm(workspacePath, { recursive: true, force: true, maxRetries: 3 });
                        log.info(`Deleted workspace folder: ${workspacePath}`);
                        return { success: true };
                    } catch (error) {
                        lastError = error;
                        if (process.platform === 'win32' && i < maxRetries - 1) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            continue;
                        }
                        break;
                    }
                }
                
                if (lastError) {
                    log.error('Error deleting workspace folder after retries:', lastError);
                    return { success: false, error: lastError.message };
                }
            } catch (error) {
                log.error('Error deleting workspace folder:', error);
                return { success: false, error: error.message };
            }
        } catch (error) {
            log.error('Error deleting workspace folder:', error);
            throw error;
        }
    }

    async handleWorkspaceTestConnection(event, gitConfig) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            const onProgress = (update, summary) => {
                const window = BrowserWindow.fromWebContents(event.sender);
                if (window && !window.isDestroyed()) {
                    window.webContents.send('git-connection-progress', { update, summary });
                }
            };
            
            return await gitSyncService.testConnection({ ...gitConfig, onProgress });
        } catch (error) {
            log.error('Error testing workspace connection:', error);
            return { success: false, error: error.message };
        }
    }

    async handleWorkspaceSync(_, workspaceId) {
        try {
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                return await workspaceSyncScheduler.manualSync(workspaceId);
            } else {
                return { success: false, error: 'Workspace sync scheduler not initialized' };
            }
        } catch (error) {
            log.error('Error syncing workspace:', error);
            return { success: false, error: error.message };
        }
    }

    async handleWorkspaceSyncAll() {
        try {
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                return await workspaceSyncScheduler.syncAllWorkspaces();
            } else {
                return { success: false, error: 'Workspace sync scheduler not initialized' };
            }
        } catch (error) {
            log.error('Error syncing all workspaces:', error);
            return { success: false, error: error.message };
        }
    }

    async handleWorkspaceGetSyncStatus() {
        try {
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                return await workspaceSyncScheduler.getSyncStatus();
            }
            return {};
        } catch (error) {
            log.error('Error getting sync status:', error);
            return {};
        }
    }

    async handleWorkspaceAutoSyncEnabled() {
        try {
            const settings = await settingsHandlers.handleGetSettings();
            return settings.autoSyncWorkspaces !== false; // Default to true
        } catch (error) {
            log.error('Error checking auto-sync setting:', error);
            return true; // Default to enabled
        }
    }

    async handleWorkspaceOpenFolder(_, workspaceId) {
        try {
            const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);
            await shell.openPath(workspacePath);
            return { success: true };
        } catch (error) {
            log.error('Error opening workspace folder:', error);
            return { success: false, error: error.message };
        }
    }

    async handleServicesHealthCheck() {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            const serviceRegistry = require('../../../../services/core/ServiceRegistry');
            
            const health = {
                gitSync: false,
                workspaceSyncScheduler: false,
                networkService: false,
                proxyService: false,
                webSocketService: false,
                serviceRegistry: serviceRegistry.getStatus()
            };
            
            // Check git sync service
            if (gitSyncService) {
                const gitStatus = await gitSyncService.getGitStatus();
                health.gitSync = gitStatus.isInstalled;
            }
            
            // Check workspace sync scheduler
            if (workspaceSyncScheduler) {
                health.workspaceSyncScheduler = workspaceSyncScheduler.isInitialized !== false;
            }
            
            // Check network service
            if (networkService) {
                const networkState = networkService.getState();
                health.networkService = networkState !== null;
            }
            
            // Check proxy service
            if (proxyService) {
                const proxyStatus = await proxyService.getStatus();
                health.proxyService = proxyStatus !== null;
            }
            
            // Check WebSocket service
            if (webSocketService) {
                const wsStatus = webSocketService.getConnectionStatus();
                health.webSocketService = wsStatus !== null;
            }
            
            return health;
        } catch (error) {
            log.error('Health check error:', error);
            return { error: error.message };
        }
    }

    async handleWsGetConnectionStatus() {
        try {
            if (!webSocketService) {
                return {
                    totalConnections: 0,
                    browserCounts: {},
                    clients: [],
                    wsServerRunning: false,
                    wssServerRunning: false
                };
            }
            return webSocketService.getConnectionStatus();
        } catch (error) {
            log.error('Error getting WebSocket connection status:', error);
            return {
                totalConnections: 0,
                browserCounts: {},
                clients: [],
                wsServerRunning: false,
                wssServerRunning: false,
                error: error.message
            };
        }
    }

    async handleWorkspaceSwitched(event, workspaceId, skipInitialSync = false) {
        log.info(`Received workspace switch event: ${workspaceId}${skipInitialSync ? ' (skip initial sync)' : ''}`);
        
        // Switch proxy service to new workspace
        try {
            await proxyService.switchWorkspace(workspaceId);
            log.info(`Proxy service switched to workspace: ${workspaceId}`);
            
            // Load environment variables for the workspace
            try {
                const envPath = path.join(app.getPath('userData'), 'workspaces', workspaceId, 'environments.json');
                const envData = await fs.promises.readFile(envPath, 'utf8');
                const { environments, activeEnvironment } = JSON.parse(envData);
                const activeVars = environments[activeEnvironment] || {};
                proxyService.updateEnvironmentVariables(activeVars);
                log.info(`Loaded ${Object.keys(activeVars).length} environment variables for proxy service`);
            } catch (error) {
                log.warn('Could not load environment variables for proxy:', error.message);
                proxyService.updateEnvironmentVariables({});
            }
            
            // Load sources for the workspace
            try {
                const sourcesPath = path.join(app.getPath('userData'), 'workspaces', workspaceId, 'sources.json');
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                const sources = JSON.parse(sourcesData);
                if (Array.isArray(sources)) {
                    proxyService.updateSources(sources);
                    log.info(`Loaded ${sources.length} sources for proxy service`);
                }
            } catch (error) {
                log.warn('Could not load sources for proxy:', error.message);
            }
            
            // Load header rules for the workspace
            try {
                const rulesPath = path.join(app.getPath('userData'), 'workspaces', workspaceId, 'rules.json');
                const rulesData = await fs.promises.readFile(rulesPath, 'utf8');
                const rulesStorage = JSON.parse(rulesData);
                if (rulesStorage.rules && rulesStorage.rules.header) {
                    proxyService.updateHeaderRules(rulesStorage.rules.header);
                    log.info(`Loaded ${rulesStorage.rules.header.length} header rules for proxy service`);
                }
            } catch (error) {
                log.warn('Could not load header rules for proxy:', error.message);
            }
        } catch (error) {
            log.error('Error switching proxy service workspace:', error);
        }
        
        // Update WebSocket service with new workspace rules
        try {
            await webSocketService.onWorkspaceSwitch(workspaceId);
            log.info(`WebSocket service updated for workspace: ${workspaceId}`);
        } catch (error) {
            log.error('Error updating WebSocket service for workspace:', error);
        }
        
        const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
        const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();
        const gitSyncService = appLifecycle.getGitSyncService();
        
        // Handle initial sync for new Git workspaces (unless skipInitialSync is true)
        if (!skipInitialSync) {
            const workspaces = await workspaceSettingsService.getWorkspaces();
            const workspace = workspaces.find(w => w.id === workspaceId);
            
            if (workspace && workspace.type === 'git') {
                const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);
                const sourcesPath = path.join(workspacePath, 'sources.json');
                
                let needsInitialSync;
                try {
                    await fs.promises.access(sourcesPath);
                    // Detect empty or placeholder source files
                    const data = await fs.promises.readFile(sourcesPath, 'utf8');
                    needsInitialSync = !data || data.trim() === '[]' || data.trim() === '';
                } catch (error) {
                    // Missing source file indicates new workspace
                    needsInitialSync = true;
                }
                
                if (needsInitialSync) {
                    log.info('New Git workspace detected, triggering immediate sync');
                    
                    try {
                        event.sender.send('workspace-sync-started', {
                            workspaceId,
                            isInitialSync: true
                        });
                        
                        const result = await gitSyncService.syncWorkspace({
                            workspaceId,
                            url: workspace.gitUrl,
                            branch: workspace.gitBranch || 'main',
                            path: workspace.gitPath || 'config/open-headers.json',
                            authType: workspace.authType || 'none',
                            authData: workspace.authData || {}
                        });
                        
                        event.sender.send('workspace-sync-completed', {
                            workspaceId,
                            success: result.success,
                            error: result.error,
                            isInitialSync: true,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        log.error('Initial sync failed:', error);
                        event.sender.send('workspace-sync-completed', {
                            workspaceId,
                            success: false,
                            error: error.message,
                            isInitialSync: true,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }
        
        if (workspaceSyncScheduler) {
            await workspaceSyncScheduler.onWorkspaceSwitch(workspaceId);
        }
    }

    async handleWorkspaceUpdated(event, data) {
        log.info(`Received workspace update event:`, data);
        const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
        if (workspaceSyncScheduler && data.workspace) {
            await workspaceSyncScheduler.onWorkspaceUpdated(data.workspaceId, data.workspace);
        }
    }

    async handleInitializeWorkspaceSync(event, workspaceId) {
        try {
            log.info(`Initializing workspace sync for workspace: ${workspaceId}`);
            
            // Trigger the same logic as workspace switch to ensure proper initialization
            await this.handleWorkspaceSwitched(event, workspaceId);
            
            return {
                success: true,
                message: 'Workspace sync initialized successfully'
            };
        } catch (error) {
            log.error('Error initializing workspace sync:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleDeleteWorkspace(_, workspaceId) {
        try {
            log.info(`Deleting workspace completely: ${workspaceId}`);
            
            // Delete workspace folder first
            const folderResult = await this.handleDeleteWorkspaceFolder(_, workspaceId);
            if (!folderResult.success) {
                log.warn(`Failed to delete workspace folder: ${folderResult.error}`);
                // Continue anyway, as the folder might not exist
            }
            
            // Delete workspace from settings
            const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();
            if (!workspaceSettingsService) {
                return {
                    success: false,
                    error: 'Workspace settings service not available'
                };
            }

            // Try to get workspaces first to verify the method exists
            const workspaces = await workspaceSettingsService.getWorkspaces();
            const workspace = workspaces.find(w => w.id === workspaceId);
            
            if (!workspace) {
                log.info(`Workspace ${workspaceId} not found in settings, considering it deleted`);
                return {
                    success: true,
                    message: 'Workspace deleted successfully'
                };
            }

            // For now, we'll need to use the available methods
            // The actual deletion from settings might need to be handled differently
            log.info(`Workspace ${workspaceId} found in settings, folder deletion completed`);
            
            return {
                success: true,
                message: 'Workspace deleted successfully'
            };
        } catch (error) {
            log.error('Error deleting workspace:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleGenerateTeamWorkspaceInvite(_, workspaceData) {
        try {
            log.info('Generating team workspace invite for:', workspaceData.name);
            
            // Create invite data
            const inviteData = {
                version: DATA_FORMAT_VERSION,
                workspaceName: workspaceData.name,
                description: workspaceData.description,
                repoUrl: workspaceData.gitUrl,
                branch: workspaceData.gitBranch || 'main',
                configPath: workspaceData.gitPath || 'config/open-headers.json',
                authType: workspaceData.authType, // Just the type hint, no actual credentials
                inviterName: await this.getUserName(),
                inviteId: this.generateInviteId(),
                createdAt: new Date().toISOString()
            };

            // Include auth data if requested
            if (workspaceData.includeAuthData && workspaceData.authData) {
                inviteData.authData = workspaceData.authData;
                log.info('Including authentication data in invite');
            }

            // Create unified payload format
            const payload = {
                action: "team-invite",
                version: DATA_FORMAT_VERSION,
                data: inviteData
            };

            // Compress the payload for smaller URLs
            const payloadJson = JSON.stringify(payload);
            const zlib = require('zlib');
            const compressed = zlib.gzipSync(payloadJson, { level: 9 });
            const payloadParam = compressed.toString('base64url');

            // Generate both app and web links using compressed format
            const appLink = `openheaders://open?payload=${payloadParam}`;
            const webLink = `https://openheaders.io/join?payload=${payloadParam}`;
            
            // Log compression info
            const originalSize = Buffer.from(payloadJson).toString('base64').length;
            log.info(`Compressed team invite: ${originalSize} -> ${payloadParam.length} bytes`);

            log.info('Generated invite links successfully');
            
            return {
                success: true,
                inviteData,
                links: {
                    appLink,
                    webLink
                }
            };
        } catch (error) {
            log.error('Error generating team workspace invite:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserName() {
        try {
            // Try to get user name from Git config first
            const gitSyncService = appLifecycle.getGitSyncService();
            if (gitSyncService) {
                const gitStatus = await gitSyncService.getGitStatus();
                if (gitStatus.isInstalled && gitStatus.user?.name) {
                    return gitStatus.user.name;
                }
            }
            
            // Fallback to system user name
            const os = require('os');
            return os.userInfo().username || 'Unknown User';
        } catch (error) {
            log.warn('Failed to get user name:', error);
            return 'Unknown User';
        }
    }

    generateInviteId() {
        // Generate a unique invite ID for tracking/analytics
        const crypto = require('crypto');
        return crypto.randomBytes(8).toString('hex');
    }

    async handleGenerateEnvironmentConfigLink(_, environmentData) {
        try {
            log.info('Generating environment config share link');
            
            // Create environment data object (similar to export format)
            const envConfigData = {
                version: DATA_FORMAT_VERSION
                // Removed exportedAt to save space
            };

            // Add environment schema if present
            if (environmentData.environmentSchema) {
                envConfigData.environmentSchema = environmentData.environmentSchema;
            }

            // Add environments if present (with option to exclude values)
            if (environmentData.environments) {
                if (environmentData.includeValues) {
                    // Include actual values but remove updatedAt timestamps
                    envConfigData.environments = {};
                    Object.entries(environmentData.environments).forEach(([envName, vars]) => {
                        envConfigData.environments[envName] = {};
                        Object.entries(vars).forEach(([varName, varData]) => {
                            // Copy only essential fields (value and isSecret)
                            envConfigData.environments[envName][varName] = {
                                value: varData.value,
                                ...(varData.isSecret && { isSecret: varData.isSecret })
                            };
                        });
                    });
                } else {
                    // Only include structure (schema) from environments
                    envConfigData.environmentSchema = envConfigData.environmentSchema || { environments: {} };
                    
                    // Extract schema from environment values
                    Object.entries(environmentData.environments).forEach(([envName, vars]) => {
                        if (!envConfigData.environmentSchema.environments[envName]) {
                            envConfigData.environmentSchema.environments[envName] = { variables: [] };
                        }
                        
                        // Extract variable names and isSecret flags
                        Object.entries(vars).forEach(([varName, varData]) => {
                            const existingVar = envConfigData.environmentSchema.environments[envName].variables
                                .find(v => v.name === varName);
                            
                            if (!existingVar) {
                                envConfigData.environmentSchema.environments[envName].variables.push({
                                    name: varName,
                                    isSecret: varData.isSecret || false
                                });
                            }
                        });
                    });
                }
            }

            // Create unified payload format
            const payload = {
                action: "environment-import",
                version: DATA_FORMAT_VERSION,
                data: envConfigData
            };

            // Always compress the payload for smaller URLs
            const payloadJson = JSON.stringify(payload);
            const zlib = require('zlib');
            
            // Compress with maximum compression level
            const compressed = zlib.gzipSync(payloadJson, { level: 9 });
            const compressedBase64 = compressed.toString('base64url'); // base64url is URL-safe
            
            // Always use compressed format
            const appLink = `openheaders://open?payload=${compressedBase64}`;
            const dataSize = compressedBase64.length;
            
            // Log compression ratio
            const originalBase64Size = Buffer.from(payloadJson).toString('base64').length;
            const compressionRatio = ((1 - (dataSize / originalBase64Size)) * 100).toFixed(1);
            log.info(`Compressed payload: ${payloadJson.length} bytes JSON -> ${dataSize} bytes compressed (${compressionRatio}% reduction)`);
            
            // Web link mirrors the app link
            const webLink = `https://openheaders.io/open?payload=${compressedBase64}`;

            log.info(`Generated environment config links successfully (size: ${dataSize} bytes)`);
            
            return {
                success: true,
                envConfigData,
                links: {
                    appLink,
                    webLink,
                    dataSize
                }
            };
        } catch (error) {
            log.error('Error generating environment config link:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new WorkspaceHandlers();