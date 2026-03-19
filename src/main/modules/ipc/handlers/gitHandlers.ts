import electron from 'electron';
import mainLogger from '../../../../utils/mainLogger';
import appLifecycle from '../../app/lifecycle';
import type { IpcInvokeEvent, OperationResult } from '../../../../types/common';
import { errorMessage } from '../../../../types/common';

const { BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('GitHandlers');

class GitHandlers {
    async handleTestGitConnection(event: IpcInvokeEvent, config: Record<string, unknown>) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            // Send real-time progress updates to the renderer process
            const onProgress = (update: Record<string, unknown>, summary: Record<string, unknown>) => {
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
            return await gitSyncService.getGitStatus();
        } catch (error: unknown) {
            log.error('Error getting Git status:', error);
            return { isInstalled: false, error: errorMessage(error) };
        }
    }

    async handleInstallGit(event: IpcInvokeEvent) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
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

            // Use auto-installer for macOS/Linux
            const gitAutoInstaller = gitSyncService.gitAutoInstaller;
            gitAutoInstaller.setProgressCallback(sendProgress);

            const success = await gitAutoInstaller.ensureGitInstalled();

            if (success) {
                await gitSyncService.initialize();
                return { success: true, message: 'Git installed successfully' };
            } else {
                return { success: false, error: 'Failed to install Git. Please install manually.' };
            }
        } catch (error: unknown) {
            log.error('Error installing Git:', error);
            return { success: false, error: errorMessage(error) };
        } finally {
            // Clean up progress callback to prevent memory leaks
            const gitSyncService = appLifecycle.getGitSyncService();
            if (gitSyncService && gitSyncService.gitAutoInstaller) {
                gitSyncService.gitAutoInstaller.setProgressCallback(null);
            }
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
            } else {
                // Direct sync fallback when scheduler unavailable
                const workspaces = await workspaceSettingsService.getWorkspaces();
                const workspace = workspaces.find((w: { id: string }) => w.id === workspaceId);
                if (!workspace) {
                    return { success: false, error: 'Workspace not found' };
                }

                const config = {
                    url: workspace.gitUrl,
                    branch: workspace.gitBranch || 'main',
                    path: workspace.gitPath || 'config/open-headers.json',
                    authType: workspace.authType || 'none',
                    authData: workspace.authData || {}
                };

                return await gitSyncService.syncWorkspace(config);
            }
        } catch (error: unknown) {
            log.error('Error syncing Git workspace:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCleanupGitRepository(_: IpcInvokeEvent, gitUrl: string): Promise<OperationResult> {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            await gitSyncService.cleanupRepository(gitUrl);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error cleaning up Git repository:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCommitConfiguration(event: IpcInvokeEvent, config: Record<string, unknown>) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            // Send real-time progress updates to the renderer process
            const onProgress = (update: Record<string, unknown>, summary: Record<string, unknown>) => {
                const window = BrowserWindow.fromWebContents(event.sender);
                if (window && !window.isDestroyed()) {
                    window.webContents.send('git-commit-progress', { update, summary });
                }
            };

            return await gitSyncService.commitConfiguration({ ...config, onProgress });
        } catch (error: unknown) {
            log.error('Error committing configuration:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCreateBranch(_: IpcInvokeEvent, config: Record<string, unknown>) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
            return await gitSyncService.createBranch(config);
        } catch (error: unknown) {
            log.error('Error creating branch:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleCheckWritePermissions(_: IpcInvokeEvent, config: Record<string, unknown>) {
        try {
            const gitSyncService = appLifecycle.getGitSyncService();
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
