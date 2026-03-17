import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';

const { app } = electron;
const { createLogger } = mainLogger;
const fsPromises = fs.promises;

// Lazy-loaded to avoid circular dependencies at startup
const getLazyDeps = () => ({
    appLifecycle: require('../../main/modules/app/lifecycle'),
    proxyService: require('../proxy/ProxyService').proxyService || require('../proxy/ProxyService').default || require('../proxy/ProxyService'),
    webSocketService: require('../websocket/ws-service'),
});

const log = createLogger('CliSetup');

export interface JoinWorkspaceData {
    workspaceName?: string;
    repoUrl: string;
    branch?: string;
    configPath?: string;
    authType?: string;
    authData?: Record<string, any>;
    inviterName?: string;
    inviteId?: string;
}

export interface NormalizedAuthData {
    token?: string;
    tokenType?: string;
    sshKey?: string;
    sshPassphrase?: string;
    username?: string;
    password?: string;
    [key: string]: any;
}

class CliSetupHandler {
    mainWindow: any = null;

    setMainWindow(window: any): void {
        this.mainWindow = window;
    }

    async joinWorkspace(data: JoinWorkspaceData): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
        const { appLifecycle, proxyService, webSocketService } = getLazyDeps();
        const gitSyncService = appLifecycle.getGitSyncService();
        const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();

        if (!gitSyncService || !workspaceSettingsService) {
            return { success: false, error: 'Services not ready' };
        }

        const { repoUrl, branch, configPath, authType, authData, workspaceName, inviterName } = data;

        if (!repoUrl) {
            return { success: false, error: 'Missing repoUrl' };
        }

        try {
            const normalizedAuthType = authType || 'none';
            const normalizedAuthData = this._normalizeAuthData(normalizedAuthType, authData);

            log.info(`Testing connection to ${repoUrl} (branch: ${branch || 'main'})`);
            const connectionResult = await gitSyncService.testConnection({
                url: repoUrl,
                branch: branch || 'main',
                path: configPath || 'config/open-headers.json',
                authType: normalizedAuthType,
                authData: normalizedAuthData,
                onProgress: () => {}
            });

            if (!connectionResult.success) {
                return { success: false, error: `Connection test failed: ${connectionResult.message || connectionResult.error || 'Unknown error'}` };
            }
            log.info('Connection test passed');

            const workspaceId = `team-${crypto.randomBytes(8).toString('hex')}`;
            const baseName = workspaceName || 'Team Workspace';
            const uniqueName = await this._generateUniqueWorkspaceName(baseName, workspaceSettingsService);

            log.info(`Creating workspace: ${uniqueName} (${workspaceId})`);
            await workspaceSettingsService.addWorkspace({
                id: workspaceId,
                name: uniqueName,
                type: 'git',
                description: inviterName ? `Invited by ${inviterName}` : 'Team workspace',
                gitUrl: repoUrl,
                gitBranch: branch || 'main',
                gitPath: configPath || 'config/open-headers.json',
                authType: normalizedAuthType,
                authData: normalizedAuthData,
                inviteMetadata: {
                    invitedBy: inviterName || null,
                    inviteId: data.inviteId || null,
                    joinedAt: new Date().toISOString()
                }
            });

            log.info(`Syncing workspace ${workspaceId}...`);
            const syncResult = await gitSyncService.syncWorkspace({
                workspaceId,
                url: repoUrl,
                branch: branch || 'main',
                path: configPath || 'config/open-headers.json',
                authType: normalizedAuthType,
                authData: normalizedAuthData
            });

            if (!syncResult.success) {
                log.warn(`Initial sync returned non-success: ${syncResult.error}`);
            }

            const settings = await workspaceSettingsService.getSettings();
            settings.activeWorkspaceId = workspaceId;
            await workspaceSettingsService.saveSettings(settings);

            try {
                await proxyService.switchWorkspace(workspaceId);
                log.info('Proxy service switched to new workspace');
            } catch (err: any) {
                log.warn('Failed to switch proxy service:', err.message);
            }

            try {
                await webSocketService.onWorkspaceSwitch(workspaceId);
                log.info('WebSocket service switched to new workspace');
            } catch (err: any) {
                log.warn('Failed to switch WebSocket service:', err.message);
            }

            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                try {
                    await workspaceSyncScheduler.onWorkspaceSwitch(workspaceId);
                    log.info('Sync scheduler switched to new workspace');
                } catch (err: any) {
                    log.warn('Failed to switch sync scheduler:', err.message);
                }
            }

            await this._loadWorkspaceIntoServices(workspaceId);

            this._notifyRenderer('cli-workspace-joined', { workspaceId, timestamp: Date.now() });

            log.info(`Workspace ${workspaceId} joined and activated successfully`);
            return { success: true, workspaceId };
        } catch (err: any) {
            log.error('Workspace join failed:', err);
            return { success: false, error: err.message };
        }
    }

    async importEnvironment(data: any): Promise<{ success: boolean; error?: string }> {
        const { appLifecycle, proxyService } = getLazyDeps();
        const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();
        if (!workspaceSettingsService) {
            return { success: false, error: 'Services not ready' };
        }

        if (!data || !data.environments) {
            return { success: false, error: 'Missing environments data' };
        }

        try {
            const settings = await workspaceSettingsService.getSettings();
            const workspaceId = settings.activeWorkspaceId || 'default-personal';

            const envPath = path.join(app.getPath('userData'), 'workspaces', workspaceId, 'environments.json');

            let existingData: any = { environments: { Default: {} }, activeEnvironment: 'Default' };
            try {
                const existing = await atomicWriter.readJson(envPath);
                if (existing) existingData = existing;
            } catch { /* File doesn't exist yet */ }

            for (const [envName, variables] of Object.entries(data.environments)) {
                if (!existingData.environments[envName]) {
                    existingData.environments[envName] = {};
                }
                Object.assign(existingData.environments[envName], variables);
            }

            await atomicWriter.writeJson(envPath, existingData, { pretty: true });

            const activeEnvName = existingData.activeEnvironment || 'Default';
            const activeVars = existingData.environments[activeEnvName] || {};

            log.info(`Imported ${Object.keys(data.environments).length} environment(s) into workspace ${workspaceId}`);

            try {
                proxyService.updateEnvironmentVariables(activeVars);
            } catch (err: any) {
                log.warn('Failed to update proxy env vars:', err.message);
            }

            this._notifyRenderer('environments-structure-changed', { workspaceId, timestamp: Date.now() });

            return { success: true };
        } catch (err: any) {
            log.error('Environment import failed:', err);
            return { success: false, error: err.message };
        }
    }

    async _generateUniqueWorkspaceName(baseName: string, workspaceSettingsService: any): Promise<string> {
        const settings = await workspaceSettingsService.getSettings();
        const existingWorkspaces = settings.workspaces || [];
        let counter = 1;
        let name = baseName;

        while (existingWorkspaces.find((w: any) => w.name === name)) {
            counter++;
            name = `${baseName} (${counter})`;
        }

        return name;
    }

    _normalizeAuthData(authType: string, authData?: Record<string, any>): NormalizedAuthData {
        if (!authType || authType === 'none') return {};
        if (!authData) return {};

        switch (authType) {
            case 'token':
                return { token: authData.token || '', tokenType: authData.tokenType || 'auto' };
            case 'ssh-key':
                return { sshKey: authData.sshKey || '', sshPassphrase: authData.sshPassphrase || undefined };
            case 'basic':
                return { username: authData.username || '', password: authData.password || '' };
            default:
                return authData;
        }
    }

    async _loadWorkspaceIntoServices(workspaceId: string): Promise<void> {
        const { proxyService } = getLazyDeps();
        const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);

        try {
            const envPath = path.join(workspacePath, 'environments.json');
            const envData = await fsPromises.readFile(envPath, 'utf8');
            const { environments, activeEnvironment } = JSON.parse(envData);
            const activeVars = environments[activeEnvironment] || {};
            proxyService.updateEnvironmentVariables(activeVars);
            log.info(`Loaded ${Object.keys(activeVars).length} env vars for proxy`);
        } catch {
            proxyService.updateEnvironmentVariables({});
        }

        try {
            const sourcesPath = path.join(workspacePath, 'sources.json');
            const sourcesData = await fsPromises.readFile(sourcesPath, 'utf8');
            const sources = JSON.parse(sourcesData);
            if (Array.isArray(sources)) {
                proxyService.updateSources(sources);
                log.info(`Loaded ${sources.length} sources for proxy`);
            }
        } catch { /* No sources yet */ }

        try {
            const rulesPath = path.join(workspacePath, 'rules.json');
            const rulesData = await fsPromises.readFile(rulesPath, 'utf8');
            const rulesStorage = JSON.parse(rulesData);
            if (rulesStorage.rules && rulesStorage.rules.header) {
                proxyService.updateHeaderRules(rulesStorage.rules.header);
                log.info(`Loaded ${rulesStorage.rules.header.length} header rules for proxy`);
            }
        } catch { /* No rules yet */ }
    }

    _notifyRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

export { CliSetupHandler };
export default CliSetupHandler;
