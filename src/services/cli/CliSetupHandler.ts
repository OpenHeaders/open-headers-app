import path from 'path';
import crypto from 'crypto';
import electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import type { InferOutput } from 'valibot';
import { errorMessage } from '../../types/common';
import type { EnvironmentsFile } from '../../types/environment';
import type { AuthType } from '../../types/workspace';
import type { JoinWorkspaceDataSchema, EnvironmentImportDataSchema } from '../../validation/cli-schemas';

const VALID_AUTH_TYPES = new Set<string>(['none', 'token', 'ssh', 'ssh-key', 'basic']);
function toAuthType(value: string | undefined): AuthType {
    return VALID_AUTH_TYPES.has(value || '') ? (value as AuthType) : 'none';
}

const { app } = electron;
const { createLogger } = mainLogger;
// Lazy-loaded to avoid circular dependencies at startup
const getLazyDeps = async () => ({
    appLifecycle: (await import('../../main/modules/app/lifecycle')).default,
    proxyService: (await import('../proxy/ProxyService')).default,
    webSocketService: (await import('../websocket/ws-service')).default,
});

const log = createLogger('CliSetup');

export type JoinWorkspaceData = InferOutput<typeof JoinWorkspaceDataSchema>;
type EnvironmentImportData = InferOutput<typeof EnvironmentImportDataSchema>;

class CliSetupHandler {
    mainWindow: BrowserWindowType | null = null;

    setMainWindow(window: BrowserWindowType): void {
        this.mainWindow = window;
    }

    async joinWorkspace(data: JoinWorkspaceData): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
        const { appLifecycle, proxyService, webSocketService } = await getLazyDeps();
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
            const normalizedAuthType = toAuthType(authType);
            const normalizedAuthData = this._normalizeAuthData(normalizedAuthType, authData);

            log.info(`Testing connection to ${repoUrl} (branch: ${branch || 'main'})`);
            const connectionResult = await gitSyncService.testConnection({
                url: repoUrl,
                branch: branch || 'main',
                filePath: configPath || 'config/open-headers.json',
                authType: normalizedAuthType,
                authData: normalizedAuthData,
                onProgress: () => {}
            });

            if (!connectionResult.success) {
                return { success: false, error: `Connection test failed: ${connectionResult.error || 'Unknown error'}` };
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
                workspaceName: uniqueName,
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
            } catch (err: unknown) {
                log.warn('Failed to switch proxy service:', errorMessage(err));
            }

            try {
                await webSocketService.onWorkspaceSwitch(workspaceId);
                log.info('WebSocket service switched to new workspace');
            } catch (err: unknown) {
                log.warn('Failed to switch WebSocket service:', errorMessage(err));
            }

            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            if (workspaceSyncScheduler) {
                try {
                    // Let the scheduler run its normal initial sync (do NOT skipInitialSync).
                    // The scheduler's background performSync will complete AFTER the CLI's
                    // importEnvironment calls populate env values, then broadcast
                    // workspace-data-updated so the renderer reloads with complete data.
                    await workspaceSyncScheduler.onWorkspaceSwitch(workspaceId);
                    log.info('Sync scheduler switched to new workspace');
                } catch (err: unknown) {
                    log.warn('Failed to switch sync scheduler:', errorMessage(err));
                }
            }

            this._notifyRenderer('cli-workspace-joined', { workspaceId, timestamp: Date.now() });

            log.info(`Workspace ${workspaceId} joined and activated successfully`);
            return { success: true, workspaceId };
        } catch (err: unknown) {
            log.error('Workspace join failed:', err);
            return { success: false, error: errorMessage(err) };
        }
    }

    async importEnvironment(data: EnvironmentImportData): Promise<{ success: boolean; error?: string }> {
        const { appLifecycle, proxyService } = await getLazyDeps();
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

            let existingData: EnvironmentsFile = { environments: { Default: {} }, activeEnvironment: 'Default' };
            try {
                const existing = await atomicWriter.readJson(envPath);
                if (existing) existingData = existing as EnvironmentsFile;
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
            } catch (err: unknown) {
                log.warn('Failed to update proxy env vars:', errorMessage(err));
            }

            this._notifyRenderer('environments-structure-changed', { workspaceId, timestamp: Date.now() });

            return { success: true };
        } catch (err: unknown) {
            log.error('Environment import failed:', err);
            return { success: false, error: errorMessage(err) };
        }
    }

    async _generateUniqueWorkspaceName(baseName: string, workspaceSettingsService: { getSettings(): Promise<{ workspaces?: Array<{ name: string }> }> }): Promise<string> {
        const settings = await workspaceSettingsService.getSettings();
        const existingWorkspaces = settings.workspaces || [];
        let counter = 1;
        let name = baseName;

        while (existingWorkspaces.find((w) => w.name === name)) {
            counter++;
            name = `${baseName} (${counter})`;
        }

        return name;
    }

    _normalizeAuthData(authType: string, authData?: JoinWorkspaceData['authData']): NonNullable<JoinWorkspaceData['authData']> {
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

    _notifyRenderer(channel: string, data: { workspaceId?: string; timestamp: number }): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

export { CliSetupHandler };
export type { EnvironmentImportData };
export default CliSetupHandler;
