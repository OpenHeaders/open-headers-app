import crypto from 'crypto';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import mainLogger from '../../utils/mainLogger';
import type { InferOutput } from 'valibot';
import { errorMessage } from '../../types/common';
import type { AuthType } from '../../types/workspace';
import type { JoinWorkspaceDataSchema, EnvironmentImportDataSchema } from '../../validation/cli-schemas';

const VALID_AUTH_TYPES = new Set<string>(['none', 'token', 'ssh', 'ssh-key', 'basic']);
function toAuthType(value: string | undefined): AuthType {
    return VALID_AUTH_TYPES.has(value || '') ? (value as AuthType) : 'none';
}
const { createLogger } = mainLogger;
// Lazy-loaded to avoid circular dependencies at startup
const getLazyDeps = async () => ({
    appLifecycle: (await import('../../main/modules/app/lifecycle')).default,
});

const log = createLogger('CliSetup');

export type JoinWorkspaceData = InferOutput<typeof JoinWorkspaceDataSchema>;
type EnvironmentImportData = InferOutput<typeof EnvironmentImportDataSchema>;

class CliSetupHandler {
    mainWindow: BrowserWindowType | null = null;

    setMainWindow(window: BrowserWindowType): void {
        this.mainWindow = window;
    }

    /**
     * Join a team workspace via CLI.
     *
     * Thin I/O adapter: validates input, tests git connection, syncs the repo,
     * then delegates all state management to WorkspaceStateService.onCliWorkspaceCreated.
     */
    async joinWorkspace(data: JoinWorkspaceData): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
        const { appLifecycle } = await getLazyDeps();
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

            // 1. Test git connection (CLI-specific I/O)
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

            // 2. Generate workspace ID + unique name (CLI-specific)
            const workspaceId = `team-${crypto.randomBytes(8).toString('hex')}`;
            const baseName = workspaceName || 'Team Workspace';
            const uniqueName = await this._generateUniqueWorkspaceName(baseName, workspaceSettingsService);

            // 3. Git sync (I/O — clone repo + read config)
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

            // 4. Delegate all state management to WorkspaceStateService
            const workspaceStateService = (await import('../workspace/WorkspaceStateService')).default;
            await workspaceStateService.onCliWorkspaceCreated({
                workspaceId,
                workspaceConfig: {
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
                },
                syncData: syncResult.success ? syncResult.data ?? null : null
            });

            this._notifyRenderer('cli-workspace-joined', { workspaceId, timestamp: Date.now() });

            log.info(`Workspace ${workspaceId} joined and activated successfully`);
            return { success: true, workspaceId };
        } catch (err: unknown) {
            log.error('Workspace join failed:', err);
            return { success: false, error: errorMessage(err) };
        }
    }

    /**
     * Import environment variables via CLI.
     *
     * Delegates entirely to WorkspaceStateService.importEnvironments which
     * merges incoming data into in-memory state, persists to disk, updates
     * envResolver + proxy, re-evaluates source dependencies, and activates/fetches
     * ready sources.
     */
    async importEnvironment(data: EnvironmentImportData): Promise<{ success: boolean; error?: string }> {
        if (!data || !data.environments) {
            return { success: false, error: 'Missing environments data' };
        }

        try {
            const workspaceStateService = (await import('../workspace/WorkspaceStateService')).default;
            await workspaceStateService.importEnvironments(data.environments);

            log.info(`Imported ${Object.keys(data.environments).length} environment(s)`);
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
