import electron from 'electron';
import path from 'path';
import fs from 'fs';
import mainLogger from '../../../utils/mainLogger';
import { errorMessage } from '../../../types/common';
import atomicWriter from '../../../utils/atomicFileWriter';
import { AppStateMachine } from '../../../services/core/AppStateMachine';
import serviceRegistry from '../../../services/core/ServiceRegistry';
import GitSyncService from '../../../services/workspace/git/GitSyncService';
import WorkspaceSettingsService from '../../../services/workspace/WorkspaceSettingsService';
import WorkspaceSyncScheduler from '../../../services/workspace/WorkspaceSyncScheduler';
import networkService from '../../../services/network/NetworkService';
import proxyService from '../../../services/proxy/ProxyService';
import webSocketService from '../../../services/websocket/ws-service';
import type { CliApiService } from '../../../services/cli/CliApiService';
import '../../../services/video/video-export-manager'; // Side-effect: registers IPC handlers in constructor

const { app } = electron;
const { createLogger } = mainLogger;
const log = createLogger('AppLifecycle');

class AppLifecycle {
    isQuitting: boolean;
    _cleanupDone: boolean;
    fileWatchers: Map<string, fs.FSWatcher>;
    private _gitSyncService: GitSyncService | null = null;
    private _workspaceSettingsService: WorkspaceSettingsService | null = null;
    private _workspaceSyncScheduler: WorkspaceSyncScheduler | null = null;
    private _cliApiService: CliApiService | null = null;

    constructor() {
        this.isQuitting = false;
        this._cleanupDone = false;
        this.fileWatchers = new Map();
    }

    async initializeApp() {
        await AppStateMachine.initialize();

        log.info(`App started at ${new Date().toISOString()}`);
        log.info(`Process argv: ${JSON.stringify(process.argv)}`);
        log.info(`App version: ${app.getVersion()}`);
        log.info(`Platform: ${process.platform}`);
        log.info(`Executable path: ${process.execPath}`);

        AppStateMachine.settingsLoaded({});
        await this.setupFirstRun();
        await this.applyStartupLogLevel();
        AppStateMachine.settingsReady();
        await this.initializeServices();
    }

    async initializeServices() {
        try {
            // Create services and store them in instance map
            const gitSyncService = new GitSyncService();
            const workspaceSettingsService = new WorkspaceSettingsService();
            // WorkspaceSyncScheduler declares its own GitSyncService interface; structurally compatible at runtime
            const workspaceSyncScheduler = new WorkspaceSyncScheduler(
                gitSyncService as ConstructorParameters<typeof WorkspaceSyncScheduler>[0],
                workspaceSettingsService as ConstructorParameters<typeof WorkspaceSyncScheduler>[1],
                networkService
            );

            // Store services for later access
            this._gitSyncService = gitSyncService;
            this._workspaceSettingsService = workspaceSettingsService;
            this._workspaceSyncScheduler = workspaceSyncScheduler;

            // Register services with proper dependency order
            serviceRegistry.register('networkService', networkService, []);
            serviceRegistry.register('proxyService', proxyService, []);
            serviceRegistry.register('gitSyncService', gitSyncService, []);
            serviceRegistry.register('workspaceSettingsService', workspaceSettingsService, []);
            serviceRegistry.register('workspaceSyncScheduler', workspaceSyncScheduler, ['gitSyncService', 'workspaceSettingsService', 'networkService']);
            serviceRegistry.register('webSocketService', webSocketService, []);

            await serviceRegistry.initializeAll();
            log.info('All services initialized successfully');

            AppStateMachine.servicesReady(serviceRegistry.getAllServices());

            const workspacesData = await workspaceSettingsService.loadWorkspacesData();
            const activeWorkspaceId = workspacesData.activeWorkspaceId || 'default-personal';

            log.info(`Initial workspace: ${activeWorkspaceId}`);

            // Initialize proxy service with current workspace
            try {
                await proxyService.switchWorkspace(activeWorkspaceId);
                log.info(`Proxy service initialized with workspace: ${activeWorkspaceId}`);
            } catch (error) {
                log.error('Failed to initialize proxy service workspace:', error);
            }

            await workspaceSyncScheduler.onWorkspaceSwitch(activeWorkspaceId);

            // Start CLI API server (non-blocking — app works without it)
            // Lazy require to avoid circular dependency (CliSetupHandler requires lifecycle)
            try {
                const { CliApiService } = await import('../../../services/cli/CliApiService');
                const { CliSetupHandler } = await import('../../../services/cli/CliSetupHandler');
                const cliApiService = new CliApiService();
                const cliSetupHandler = new CliSetupHandler();
                cliApiService.setSetupHandler(cliSetupHandler);
                this._cliApiService = cliApiService;
                await cliApiService.start();
            } catch (error: unknown) {
                log.warn('CLI API server failed to start (non-critical):', errorMessage(error));
            }
        } catch (error) {
            log.error('Failed to initialize services:', error);
            throw error; // Re-throw to indicate critical failure
        }
    }

    getSettingsPath() {
        return path.join(app.getPath('userData'), 'settings.json');
    }

    async setupFirstRun() {
        try {
            const settingsPath = this.getSettingsPath();

            // Use async file operations
            let isFirstRun: boolean;
            try {
                await fs.promises.access(settingsPath);
                isFirstRun = false;
            } catch (error) {
                isFirstRun = true;
            }

            if (isFirstRun) {
                log.info('First run detected, creating default settings with auto-launch enabled');

                const defaultSettings = {
                    launchAtLogin: true,
                    hideOnLaunch: true,
                    showDockIcon: true,
                    showStatusBarIcon: true,
                    theme: 'auto',
                    autoStartProxy: true,
                    proxyCacheEnabled: true,
                    autoHighlightTableEntries: false,
                    autoScrollTableEntries: false,
                    compactMode: false,
                    tutorialMode: true,
                    developerMode: false,
                    videoRecording: false,
                    videoQuality: 'high',
                    recordingHotkey: 'CommandOrControl+Shift+E',
                    logLevel: 'info'
                };

                await atomicWriter.writeJson(settingsPath, defaultSettings, { pretty: true });
                log.info('Created default settings file with auto-launch and hide enabled');
                const AutoLaunch = (await import('auto-launch')).default;
                try {
                    const args = process.platform === 'win32' ?
                        ['--hidden', '--autostart'] :
                        ['--hidden'];

                    const autoLauncher = new AutoLaunch({
                        name: app.getName(),
                        path: app.getPath('exe'),
                        args: args,
                        isHidden: true
                    });

                    await autoLauncher.enable();
                    log.info('Auto-launch enabled for first-time user');
                } catch (autoLaunchError) {
                    log.error('Error setting up auto-launch for first-time user:', autoLaunchError);
                }

                (globalThis as typeof globalThis & { isFirstRun?: boolean }).isFirstRun = true;
            }
        } catch (err) {
            log.error('Error during first run setup:', err);
        }
    }

    async applyStartupLogLevel() {
        try {
            const settingsPath = this.getSettingsPath();
            const data = await fs.promises.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            if (settings.logLevel) {
                const { setGlobalLogLevel } = await import('../../../utils/mainLogger');
                setGlobalLogLevel(settings.logLevel);
                log.info(`Applied log level from settings: ${settings.logLevel}`);
            }
        } catch (err) {
            // Ignore - will use default log level
        }
    }

    async beforeQuit() {
        if (this._cleanupDone) return; // Prevent double cleanup (installUpdate + before-quit event)
        this._cleanupDone = true;
        this.isQuitting = true;
        AppStateMachine.shutdown();

        // Wrap cleanup in a timeout to prevent hanging on exit
        // (e.g., a service.stop() waiting for connections that never drain)
        await Promise.race([
            this._performCleanup(),
            new Promise<void>(resolve => setTimeout(() => {
                log.warn('Shutdown cleanup timed out after 5s, proceeding with exit');
                resolve();
            }, 5000))
        ]);
    }

    /**
     * Perform actual cleanup of all services and resources
     * @private
     */
    async _performCleanup() {
        for (const watcher of this.fileWatchers.values()) {
            try { watcher.close(); } catch (e) { /* ignore */ }
        }

        // Stop CLI API server first (fast, deletes cli.json)
        const cliApiService = this.getCliApiService();
        if (cliApiService) {
            try {
                await cliApiService.stop();
            } catch (error: unknown) {
                log.warn('Error stopping CLI API server:', errorMessage(error));
            }
        }

        try {
            await serviceRegistry.shutdownAll();
            log.info('All services shut down successfully');
            AppStateMachine.terminate();
        } catch (error) {
            log.error('Error shutting down services:', error);
            AppStateMachine.error(error);
        }
    }

    getGitSyncService(): GitSyncService | null {
        return this._gitSyncService;
    }

    getWorkspaceSettingsService(): WorkspaceSettingsService | null {
        return this._workspaceSettingsService;
    }

    getWorkspaceSyncScheduler(): WorkspaceSyncScheduler | null {
        return this._workspaceSyncScheduler;
    }

    getCliApiService(): CliApiService | null {
        return this._cliApiService;
    }

    isCleanupDone() {
        return this._cleanupDone;
    }

    isQuittingApp() {
        return this.isQuitting;
    }

    setQuitting(value: boolean) {
        this.isQuitting = value;
    }

    getFileWatchers() {
        return this.fileWatchers;
    }

    async setupEarlyDockVisibility() {
        log.info('Checking early dock visibility settings');
        const settingsPath = this.getSettingsPath();

        try {
            try {
                await fs.promises.access(settingsPath);
                const settingsData = await fs.promises.readFile(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);

                if (process.platform === 'darwin' && app.dock) {
                    if (settings.showDockIcon === false) {
                        log.info('Hiding dock icon at startup based on settings');
                        app.dock.hide();
                    } else {
                        log.info('Showing dock icon at startup based on settings');
                        await app.dock.show();
                    }
                }
            } catch (accessError) {
                log.debug('Settings file does not exist, skipping dock visibility setup');
            }
        } catch (err) {
            log.error('Error applying early dock visibility settings:', err);
        }
    }
}

const appLifecycle = new AppLifecycle();
export { AppLifecycle };
export default appLifecycle;
