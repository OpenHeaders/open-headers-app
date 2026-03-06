/**
 * CliSetupHandler - Business logic for CLI API endpoints
 *
 * Handles:
 * - joinWorkspace: test connection → create workspace → sync → activate → switch services
 * - importEnvironment: write env vars to active workspace's environments.json → notify renderer
 *
 * Reuses existing main-process services via appLifecycle.
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { app } = require('electron');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');
const appLifecycle = require('../../main/modules/app/lifecycle');
const proxyService = require('../proxy/ProxyService');
const webSocketService = require('../websocket/ws-service');

const log = createLogger('CliSetup');

class CliSetupHandler {
    constructor() {
        this.mainWindow = null;
    }

    setMainWindow(window) {
        this.mainWindow = window;
    }

    // ── Workspace Join ─────────────────────────────────────────────────

    /**
     * Join a team workspace: test connection → create → sync → activate → switch services
     *
     * @param {object} data - Workspace config from onboarding bundle
     * @param {string} data.workspaceName
     * @param {string} data.repoUrl
     * @param {string} data.branch
     * @param {string} data.configPath
     * @param {string} data.authType
     * @param {object} data.authData
     * @param {string} data.inviterName
     * @param {string} data.inviteId
     * @returns {Promise<{success: boolean, workspaceId?: string, error?: string}>}
     */
    async joinWorkspace(data) {
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
            // Normalize auth data to canonical format (mirrors renderer's prepareAuthData)
            const normalizedAuthType = authType || 'none';
            const normalizedAuthData = this._normalizeAuthData(normalizedAuthType, authData);

            // 1. Test git connection
            log.info(`Testing connection to ${repoUrl} (branch: ${branch || 'main'})`);
            const connectionResult = await gitSyncService.testConnection({
                url: repoUrl,
                branch: branch || 'main',
                path: configPath || 'config/open-headers.json',
                authType: normalizedAuthType,
                authData: normalizedAuthData,
                onProgress: () => {} // No UI progress for CLI
            });

            if (!connectionResult.success) {
                return { success: false, error: `Connection test failed: ${connectionResult.message || connectionResult.error || 'Unknown error'}` };
            }
            log.info('Connection test passed');

            // 2. Generate workspace ID and unique name
            const workspaceId = `team-${crypto.randomBytes(8).toString('hex')}`;
            const baseName = workspaceName || 'Team Workspace';
            const uniqueName = await this._generateUniqueWorkspaceName(baseName, workspaceSettingsService);

            // 3. Create workspace entry (with inviteMetadata, matching UI flow)
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

            // 4. Initial sync
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
                // Continue anyway — workspace is created, sync can be retried
            }

            // 5. Set as active workspace
            const settings = await workspaceSettingsService.getSettings();
            settings.activeWorkspaceId = workspaceId;
            await workspaceSettingsService.saveSettings(settings);

            // 6. Switch proxy and WebSocket services
            try {
                await proxyService.switchWorkspace(workspaceId);
                log.info('Proxy service switched to new workspace');
            } catch (err) {
                log.warn('Failed to switch proxy service:', err.message);
            }

            try {
                await webSocketService.onWorkspaceSwitch(workspaceId);
                log.info('WebSocket service switched to new workspace');
            } catch (err) {
                log.warn('Failed to switch WebSocket service:', err.message);
            }

            // 7. Notify sync scheduler
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                try {
                    await workspaceSyncScheduler.onWorkspaceSwitch(workspaceId);
                    log.info('Sync scheduler switched to new workspace');
                } catch (err) {
                    log.warn('Failed to switch sync scheduler:', err.message);
                }
            }

            // 8. Load workspace data into services (same as handleWorkspaceSwitched)
            await this._loadWorkspaceIntoServices(workspaceId);

            // 9. Notify renderer to reload workspace list and switch to the new workspace
            // Uses 'cli-workspace-joined' — a dedicated event that triggers a full workspace
            // reload in the renderer (workspace-data-updated is filtered to current workspace only)
            this._notifyRenderer('cli-workspace-joined', {
                workspaceId,
                timestamp: Date.now()
            });

            log.info(`Workspace ${workspaceId} joined and activated successfully`);
            return { success: true, workspaceId };
        } catch (err) {
            log.error('Workspace join failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ── Environment Import ─────────────────────────────────────────────

    /**
     * Import environment variables into the active workspace
     *
     * @param {object} data - Environment config (same format as environment-import payload data)
     * @param {string} data.version
     * @param {object} data.environments - { "Default": { "VAR_NAME": { "value": "...", "isSecret": true } } }
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async importEnvironment(data) {
        const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();
        if (!workspaceSettingsService) {
            return { success: false, error: 'Services not ready' };
        }

        if (!data || !data.environments) {
            return { success: false, error: 'Missing environments data' };
        }

        try {
            // Get active workspace
            const settings = await workspaceSettingsService.getSettings();
            const workspaceId = settings.activeWorkspaceId || 'default-personal';

            const envPath = path.join(
                app.getPath('userData'),
                'workspaces',
                workspaceId,
                'environments.json'
            );

            // Read existing environments (may not exist yet)
            let existingData = { environments: { Default: {} }, activeEnvironment: 'Default' };
            try {
                const existing = await atomicWriter.readJson(envPath);
                if (existing) {
                    existingData = existing;
                }
            } catch {
                // File doesn't exist yet — use defaults
            }

            // Merge incoming environments into existing
            for (const [envName, variables] of Object.entries(data.environments)) {
                if (!existingData.environments[envName]) {
                    existingData.environments[envName] = {};
                }
                // Merge variables (incoming overwrites existing)
                Object.assign(existingData.environments[envName], variables);
            }

            // Write back
            await atomicWriter.writeJson(envPath, existingData, { pretty: true });

            const activeEnvName = existingData.activeEnvironment || 'Default';
            const activeVars = existingData.environments[activeEnvName] || {};

            log.info(`Imported ${Object.keys(data.environments).length} environment(s) into workspace ${workspaceId}`);

            // Update proxy service with new environment variables
            try {
                proxyService.updateEnvironmentVariables(activeVars);
            } catch (err) {
                log.warn('Failed to update proxy env vars:', err.message);
            }

            // Notify renderer to refresh environment state
            // Use 'environments-structure-changed' — the event the renderer actually listens to
            // (not 'environment-variables-changed', which is a renderer→main IPC channel with no main→renderer listener)
            this._notifyRenderer('environments-structure-changed', {
                workspaceId,
                timestamp: Date.now()
            });

            return { success: true };
        } catch (err) {
            log.error('Environment import failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Generate a unique workspace name by appending (2), (3), etc.
     * (Mirrors TeamWorkspaceAcceptInviteModal.generateUniqueWorkspaceName)
     */
    async _generateUniqueWorkspaceName(baseName, workspaceSettingsService) {
        const settings = await workspaceSettingsService.getSettings();
        const existingWorkspaces = settings.workspaces || [];
        let counter = 1;
        let name = baseName;

        while (existingWorkspaces.find(w => w.name === name)) {
            counter++;
            name = `${baseName} (${counter})`;
        }

        return name;
    }

    /**
     * Normalize authData to canonical format
     * (Mirrors renderer's prepareAuthData from WorkspaceUtils.js)
     */
    _normalizeAuthData(authType, authData) {
        if (!authType || authType === 'none') return {};
        if (!authData) return {};

        switch (authType) {
            case 'token':
                return {
                    token: authData.token || '',
                    tokenType: authData.tokenType || 'auto'
                };
            case 'ssh-key':
                return {
                    sshKey: authData.sshKey || '',
                    sshPassphrase: authData.sshPassphrase || undefined
                };
            case 'basic':
                return {
                    username: authData.username || '',
                    password: authData.password || ''
                };
            default:
                return authData;
        }
    }

    /**
     * Load workspace env vars, sources, and rules into proxy/WS services
     * (Mirrors workspaceHandlers.handleWorkspaceSwitched logic)
     */
    async _loadWorkspaceIntoServices(workspaceId) {
        const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);

        // Load environment variables
        try {
            const envPath = path.join(workspacePath, 'environments.json');
            const envData = await fs.readFile(envPath, 'utf8');
            const { environments, activeEnvironment } = JSON.parse(envData);
            const activeVars = environments[activeEnvironment] || {};
            proxyService.updateEnvironmentVariables(activeVars);
            log.info(`Loaded ${Object.keys(activeVars).length} env vars for proxy`);
        } catch {
            proxyService.updateEnvironmentVariables({});
        }

        // Load sources
        try {
            const sourcesPath = path.join(workspacePath, 'sources.json');
            const sourcesData = await fs.readFile(sourcesPath, 'utf8');
            const sources = JSON.parse(sourcesData);
            if (Array.isArray(sources)) {
                proxyService.updateSources(sources);
                log.info(`Loaded ${sources.length} sources for proxy`);
            }
        } catch {
            // No sources yet — expected for fresh workspaces
        }

        // Load header rules
        try {
            const rulesPath = path.join(workspacePath, 'rules.json');
            const rulesData = await fs.readFile(rulesPath, 'utf8');
            const rulesStorage = JSON.parse(rulesData);
            if (rulesStorage.rules && rulesStorage.rules.header) {
                proxyService.updateHeaderRules(rulesStorage.rules.header);
                log.info(`Loaded ${rulesStorage.rules.header.length} header rules for proxy`);
            }
        } catch {
            // No rules yet — expected for fresh workspaces
        }
    }

    /**
     * Send event to renderer (if window is available)
     */
    _notifyRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

module.exports = CliSetupHandler;
