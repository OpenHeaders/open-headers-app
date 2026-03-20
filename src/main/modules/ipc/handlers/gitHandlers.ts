import electron from 'electron';
import mainLogger from '../../../../utils/mainLogger';
import appLifecycle from '../../app/lifecycle';
import type { IpcInvokeEvent, OperationResult } from '../../../../types/common';
import { errorMessage } from '../../../../types/common';
import type { WorkspaceAuthData, AuthType } from '../../../../types/workspace';
import type { ProgressStep } from '../../../../services/workspace/git/utils/GitConnectionProgress';

const { BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('GitHandlers');

import type { ConnectionTestOptions } from '../../../../services/workspace/git/operations/ConnectionTester';
import type { SyncOptions } from '../../../../services/workspace/git/operations/TeamWorkspaceSyncer';

class GitHandlers {
    async handleTestGitConnection(event: IpcInvokeEvent, config: Omit<ConnectionTestOptions, 'onProgress'>) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };

            const onProgress = (update: ProgressStep, summary: ProgressStep[]) => {
                const window = BrowserWindow.fromWebContents(event.sender);
                if (window && !window.isDestroyed()) {
                    window.webContents.send('git-connection-progress', { update, summary });
                }
            };

            return await gitSyncService.testConnection({ ...config, onProgress });
        } catch (error: unknown) {
            log.error('Error testing Git connection:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleGetGitStatus() {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { isInstalled: false, error: 'Git sync service not ready' };
            return await gitSyncService.getGitStatus();
        } catch (error: unknown) {
            log.error('Error getting Git status:', error);
            return { isInstalled: false, error: errorMessage(error) };
        }
    }

    async handleInstallGit(event: IpcInvokeEvent) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };

            const sendProgress = (message: string) => {
                event.sender.send('git-install-progress', { message });
            };

            // Windows uses bundled portable Git
            if (process.platform === 'win32') {
                const status = await gitSyncService.getGitStatus();
                if (status.isInstalled) {
                    return { success: true, message: 'Git is already available' };
                }
                return { success: false, error: 'Portable Git not found. Please reinstall the application.' };
            }

            sendProgress('Checking system requirements...');

            const success = await gitSyncService.installGit(sendProgress);

            if (success) {
                await gitSyncService.initialize();
                return { success: true, message: 'Git installed successfully' };
            } else {
                return { success: false, error: 'Failed to install Git. Please install manually.' };
            }
        } catch (error: unknown) {
            log.error('Error installing Git:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleSyncGitWorkspace(_: IpcInvokeEvent, workspaceId: string) {
        try {
            const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
            const workspaceSettingsService = appLifecycle.getWorkspaceSettingsService();
            const gitSyncService = appLifecycle.getGitSyncService();

            // Prefer sync scheduler for coordinated workspace management
            if (workspaceSyncScheduler) {
                return await workspaceSyncScheduler.manualSync(workspaceId);
            } else if (workspaceSettingsService && gitSyncService) {
                // Direct sync fallback when scheduler unavailable
                const workspaces = await workspaceSettingsService.getWorkspaces();
                const workspace = workspaces.find((w: { id: string }) => w.id === workspaceId);
                if (!workspace) {
                    return { success: false, error: 'Workspace not found' };
                }

                const config: Partial<SyncOptions> = {
                    workspaceId,
                    url: workspace.gitUrl,
                    branch: workspace.gitBranch || 'main',
                    path: workspace.gitPath || 'config/open-headers.json',
                    authType: (workspace.authType || 'none'),
                    authData: workspace.authData ?? {}
                };

                return await gitSyncService.syncWorkspace(config as SyncOptions);
            }
            return { success: false, error: 'Services not ready' };
        } catch (error: unknown) {
            log.error('Error syncing Git workspace:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCleanupGitRepository(_: IpcInvokeEvent, gitUrl: string): Promise<OperationResult> {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };
            await gitSyncService.cleanupRepository(gitUrl);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error cleaning up Git repository:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCommitConfiguration(_event: IpcInvokeEvent, config: { url?: string; branch?: string; path?: string; files?: Record<string, string>; message?: string; authType?: string; authData?: WorkspaceAuthData }) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };

            return await gitSyncService.commitConfiguration(config);
        } catch (error: unknown) {
            log.error('Error committing configuration:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCreateBranch(_: IpcInvokeEvent, config: { repoDir: string; branchName: string; baseBranch?: string }) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };
            return await gitSyncService.createBranch(config);
        } catch (error: unknown) {
            log.error('Error creating branch:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCheckWritePermissions(_: IpcInvokeEvent, config: { url: string; branch?: string; authType?: string; authData?: WorkspaceAuthData }) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };
            return await gitSyncService.checkWritePermissions(config);
        } catch (error: unknown) {
            log.error('Error checking write permissions:', error);
            return { success: false, error: errorMessage(error) };
        }
    }
}

const gitHandlers = new GitHandlers();
export { GitHandlers };
export default gitHandlers;
