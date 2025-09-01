const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../../utils/mainLogger');
const atomicWriter = require('../../../utils/atomicFileWriter');
const { AppStateMachine } = require('../../../services/core/AppStateMachine');
const serviceRegistry = require('../../../services/core/ServiceRegistry');
const GitSyncService = require('../../../services/workspace/git/GitSyncService');
const WorkspaceSettingsService = require('../../../services/workspace/WorkspaceSettingsService');
const WorkspaceSyncScheduler = require('../../../services/workspace/WorkspaceSyncScheduler');
const networkService = require('../../../services/network/NetworkService');
const proxyService = require('../../../services/proxy/ProxyService');
const webSocketService = require('../../../services/websocket/ws-service');
const videoExportManager = require('../../../services/video/video-export-manager');

const log = createLogger('AppLifecycle');

class AppLifecycle {
    constructor() {
        this.isQuitting = false;
        this.fileWatchers = new Map();
        this.services = new Map(); // Replace global variables with instance storage
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
        AppStateMachine.settingsReady();
        await this.initializeServices();
    }

    async initializeServices() {
        try {
            // Create services and store them in instance map
            const gitSyncService = new GitSyncService();
            const workspaceSettingsService = new WorkspaceSettingsService();
            const workspaceSyncScheduler = new WorkspaceSyncScheduler(gitSyncService, workspaceSettingsService, networkService);
            
            // Store services in instance map for later access
            this.services.set('gitSyncService', gitSyncService);
            this.services.set('workspaceSettingsService', workspaceSettingsService);
            this.services.set('workspaceSyncScheduler', workspaceSyncScheduler);
            
            // Initialize workspace settings first (dependency)
            await workspaceSettingsService.initialize();

            // Register services with proper dependency order
            serviceRegistry.register('networkService', networkService, []);
            serviceRegistry.register('proxyService', proxyService, []);
            serviceRegistry.register('gitSyncService', gitSyncService, []);
            serviceRegistry.register('workspaceSettingsService', workspaceSettingsService, []);
            serviceRegistry.register('workspaceSyncScheduler', workspaceSyncScheduler, ['gitSyncService', 'workspaceSettingsService', 'networkService']);
            serviceRegistry.register('webSocketService', webSocketService, []);
            serviceRegistry.register('videoExportManager', videoExportManager, []);
            
            await serviceRegistry.initializeAll();
            log.info('All services initialized successfully');
            
            AppStateMachine.servicesReady(serviceRegistry.getAllServices());

            // Initialize workspace sync scheduler after all services are ready
            await workspaceSyncScheduler.initialize();
            
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
            let isFirstRun;
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
                    recordingHotkey: 'CommandOrControl+Shift+E'
                };

                await atomicWriter.writeJson(settingsPath, defaultSettings, { pretty: true });
                log.info('Created default settings file with auto-launch and hide enabled');
                const AutoLaunch = require('auto-launch');
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

                global.isFirstRun = true;
            }
        } catch (err) {
            log.error('Error during first run setup:', err);
        }
    }

    async beforeQuit() {
        this.isQuitting = true;
        AppStateMachine.shutdown();

        for (const watcher of this.fileWatchers.values()) {
            watcher.close();
        }

        const workspaceSyncScheduler = this.services.get('workspaceSyncScheduler');
        if (workspaceSyncScheduler) {
            try {
                await workspaceSyncScheduler.shutdown();
                log.info('Workspace sync scheduler shut down');
            } catch (error) {
                log.error('Error shutting down sync scheduler:', error);
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

    getGitSyncService() {
        return this.services.get('gitSyncService');
    }

    getWorkspaceSettingsService() {
        return this.services.get('workspaceSettingsService');
    }

    getWorkspaceSyncScheduler() {
        return this.services.get('workspaceSyncScheduler');
    }

    isQuittingApp() {
        return this.isQuitting;
    }

    setQuitting(value) {
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

                if (process.platform === 'darwin') {
                    if (settings.showDockIcon === false) {
                        log.info('Hiding dock icon at startup based on settings');
                        app.dock.hide();
                    } else if (settings.showDockIcon === true && !app.dock.isVisible()) {
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

module.exports = new AppLifecycle();