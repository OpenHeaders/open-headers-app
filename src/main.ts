// Electron main process
import electron from 'electron';
import type { BrowserWindow as BrowserWindowType, IpcMainInvokeEvent, IpcMainEvent, MenuItemConstructorOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import mainLogger from './utils/mainLogger';
import { errorMessage } from './types/common';

const { app, ipcMain, Menu, shell } = electron;
const { createLogger } = mainLogger;

// Core modules
import appLifecycle from './main/modules/app/lifecycle';
import windowManager from './main/modules/window/windowManager';
import trayManager from './main/modules/tray/trayManager';
import networkHandlers from './main/modules/network/networkHandlers';
import autoUpdater from './main/modules/updater/autoUpdater';
import protocolHandler from './main/modules/protocol/protocolHandler';
import globalShortcuts from './main/modules/shortcuts/globalShortcuts';

// IPC handlers
import fileHandlers from './main/modules/ipc/handlers/fileHandlers';
import storageHandlers from './main/modules/ipc/handlers/storageHandlers';
import settingsHandlers from './main/modules/ipc/handlers/settingsHandlers';
import systemHandlers from './main/modules/ipc/handlers/systemHandlers';
import httpHandlers from './main/modules/ipc/handlers/httpHandlers';
import recordingHandlers from './main/modules/ipc/handlers/recordingHandlers';
import proxyHandlers from './main/modules/ipc/handlers/proxyHandlers';
import workspaceHandlers from './main/modules/ipc/handlers/workspaceHandlers';
import gitHandlers from './main/modules/ipc/handlers/gitHandlers';

const log = createLogger('Main');

let mainWindow: BrowserWindowType | null = null;

// Windows focus helper is initialized and will handle focus enhancement automatically

// Allow E2E tests to use an isolated userData dir so the single-instance lock
// doesn't conflict with a running dev/prod instance. This must happen BEFORE
// requestSingleInstanceLock() because Electron scopes the lock to userData.
if (process.env.ELECTRON_USER_DATA_DIR) {
    app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

// Ensure only one instance runs at a time
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    log.info('Another instance is already running, quitting...');
    app.quit();
} else {
    log.info('Got single instance lock, continuing with app startup');
    log.info('App starting with args:', process.argv);
    log.info('App executable path:', process.execPath);
    log.info('Platform:', process.platform);
    log.info('Process default app:', process.defaultApp);

    // Log all arguments individually for better debugging
    process.argv.forEach((arg, index) => {
        log.info(`  argv[${index}]: "${arg}"`);
    });

    app.setName('OpenHeaders');
    app.commandLine.appendSwitch('use-system-ca-store');

    protocolHandler.setupProtocol();
    protocolHandler.setupProtocolHandlers();

    // Handle dock icon visibility early for macOS
    if (process.platform === 'darwin') {
        appLifecycle.setupEarlyDockVisibility().catch((err: Error) =>
            log.error('Failed to setup early dock visibility:', err)
        );
    }

    // Setup all IPC communication handlers
    function setupIPC() {
        // File operations
        ipcMain.handle('openFileDialog', fileHandlers.handleOpenFileDialog);
        ipcMain.handle('saveFileDialog', fileHandlers.handleSaveFileDialog);
        ipcMain.handle('readFile', fileHandlers.handleReadFile);
        ipcMain.handle('writeFile', fileHandlers.handleWriteFile);
        ipcMain.handle('watchFile', fileHandlers.handleWatchFile);
        ipcMain.handle('unwatchFile', fileHandlers.handleUnwatchFile);
        ipcMain.handle('openRecordFile', fileHandlers.handleOpenRecordFile);
        ipcMain.handle('getResourcePath', fileHandlers.handleGetResourcePath);
        ipcMain.handle('getEnvVariable', fileHandlers.handleGetEnvVariable);
        ipcMain.handle('getAppPath', fileHandlers.handleGetAppPath);

        // Storage
        ipcMain.handle('saveToStorage', storageHandlers.handleSaveToStorage);
        ipcMain.handle('loadFromStorage', storageHandlers.handleLoadFromStorage);
        ipcMain.handle('deleteFromStorage', storageHandlers.handleDeleteFromStorage);
        ipcMain.handle('deleteDirectory', storageHandlers.handleDeleteDirectory);

        // Settings
        ipcMain.handle('saveSettings', settingsHandlers.handleSaveSettings);
        ipcMain.handle('getSettings', settingsHandlers.handleGetSettings);
        ipcMain.handle('setAutoLaunch', settingsHandlers.handleSetAutoLaunch);
        ipcMain.handle('openExternal', settingsHandlers.handleOpenExternal);

        // System
        ipcMain.handle('getSystemTimezone', systemHandlers.handleGetSystemTimezone);
        ipcMain.handle('checkScreenRecordingPermission', systemHandlers.handleCheckScreenRecordingPermission);
        ipcMain.handle('requestScreenRecordingPermission', systemHandlers.handleRequestScreenRecordingPermission);
        ipcMain.handle('getAppVersion', () => app.getVersion());
        ipcMain.handle('showItemInFolder', systemHandlers.handleShowItemInFolder.bind(systemHandlers));
        ipcMain.handle('openAppPath', systemHandlers.handleOpenAppPath.bind(systemHandlers));

        // Global shortcuts
        ipcMain.handle('disableRecordingHotkey', () => globalShortcuts.disableHotkey());
        ipcMain.handle('enableRecordingHotkey', () => globalShortcuts.enableHotkey());

        // Network
        ipcMain.handle('checkNetworkConnectivity', networkHandlers.checkNetworkConnectivity);
        ipcMain.handle('getNetworkState', networkHandlers.getNetworkState);
        ipcMain.handle('forceNetworkCheck', networkHandlers.forceNetworkCheck);
        ipcMain.handle('getSystemState', networkHandlers.getSystemState);
        ipcMain.handle('makeHttpRequest', httpHandlers.handleMakeHttpRequest);

        // Recording
        ipcMain.handle('loadRecordings', recordingHandlers.handleLoadRecordings);
        ipcMain.handle('loadRecording', recordingHandlers.handleLoadRecording);
        ipcMain.handle('saveRecording', recordingHandlers.handleSaveRecording);
        ipcMain.handle('saveUploadedRecording', recordingHandlers.handleSaveUploadedRecording);
        ipcMain.handle('deleteRecording', recordingHandlers.handleDeleteRecording);
        ipcMain.handle('downloadRecording', recordingHandlers.handleDownloadRecording);
        ipcMain.handle('updateRecordingMetadata', recordingHandlers.handleUpdateRecordingMetadata);

        // Proxy
        ipcMain.handle('proxy-start', proxyHandlers.handleProxyStart);
        ipcMain.handle('proxy-stop', proxyHandlers.handleProxyStop);
        ipcMain.handle('proxy-status', proxyHandlers.handleProxyStatus);
        ipcMain.handle('proxy-get-rules', proxyHandlers.handleProxyGetRules);
        ipcMain.handle('proxy-save-rule', proxyHandlers.handleProxySaveRule);
        ipcMain.handle('proxy-delete-rule', proxyHandlers.handleProxyDeleteRule);
        ipcMain.handle('proxy-clear-cache', proxyHandlers.handleProxyClearCache);
        ipcMain.handle('proxy-get-cache-stats', proxyHandlers.handleProxyGetCacheStats);
        ipcMain.handle('proxy-get-cache-entries', proxyHandlers.handleProxyGetCacheEntries);
        ipcMain.handle('proxy-set-cache-enabled', proxyHandlers.handleProxySetCacheEnabled);
        ipcMain.handle('proxy-update-header-rules', proxyHandlers.handleProxyUpdateHeaderRules);
        ipcMain.handle('proxyClearRules', proxyHandlers.handleProxyClearRules);
        ipcMain.handle('proxy-set-strict-ssl', proxyHandlers.handleProxySetStrictSSL);
        ipcMain.handle('proxy-add-trusted-certificate', proxyHandlers.handleProxyAddTrustedCertificate);
        ipcMain.handle('proxy-remove-trusted-certificate', proxyHandlers.handleProxyRemoveTrustedCertificate);
        ipcMain.handle('proxy-add-certificate-exception', proxyHandlers.handleProxyAddCertificateException);
        ipcMain.handle('proxy-remove-certificate-exception', proxyHandlers.handleProxyRemoveCertificateException);
        ipcMain.handle('proxy-get-certificate-info', proxyHandlers.handleProxyGetCertificateInfo);

        // WebSocket
        ipcMain.handle('ws-get-connection-status', workspaceHandlers.handleWsGetConnectionStatus.bind(workspaceHandlers));
        ipcMain.handle('ws-check-cert-trust', workspaceHandlers.handleWsCheckCertTrust.bind(workspaceHandlers));
        ipcMain.handle('ws-trust-cert', workspaceHandlers.handleWsTrustCert.bind(workspaceHandlers));
        ipcMain.handle('ws-untrust-cert', workspaceHandlers.handleWsUntrustCert.bind(workspaceHandlers));

        // Git
        ipcMain.handle('testGitConnection', gitHandlers.handleTestGitConnection);
        ipcMain.handle('getGitStatus', gitHandlers.handleGetGitStatus);
        ipcMain.handle('installGit', gitHandlers.handleInstallGit);
        ipcMain.handle('syncGitWorkspace', gitHandlers.handleSyncGitWorkspace);
        ipcMain.handle('cleanupGitRepository', gitHandlers.handleCleanupGitRepository);
        ipcMain.handle('commitConfiguration', gitHandlers.handleCommitConfiguration);
        ipcMain.handle('createBranch', gitHandlers.handleCreateBranch);
        ipcMain.handle('checkWritePermissions', gitHandlers.handleCheckWritePermissions);

        // CLI API
        ipcMain.handle('cli-api-status', () => {
            const cliApiService = appLifecycle.getCliApiService();
            if (!cliApiService) return { running: false, port: 59213, discoveryPath: '', token: '', startedAt: null, totalRequests: 0 };
            return cliApiService.getStatus();
        });
        ipcMain.handle('cli-api-start', async (_event: IpcMainInvokeEvent, port: number) => {
            const cliApiService = appLifecycle.getCliApiService();
            if (!cliApiService) return { success: false, error: 'CLI API service not available' };
            try {
                if (port) cliApiService.port = Number(port);
                await cliApiService.start();
                return { success: true, port: cliApiService.port };
            } catch (err: unknown) {
                return { success: false, error: errorMessage(err) };
            }
        });
        ipcMain.handle('cli-api-stop', async () => {
            const cliApiService = appLifecycle.getCliApiService();
            if (!cliApiService) return { success: false, error: 'CLI API service not available' };
            try {
                await cliApiService.stop();
                return { success: true };
            } catch (err: unknown) {
                return { success: false, error: errorMessage(err) };
            }
        });
        ipcMain.handle('cli-api-get-logs', () => {
            const cliApiService = appLifecycle.getCliApiService();
            if (!cliApiService) return [];
            return cliApiService.getLogs();
        });
        ipcMain.handle('cli-api-clear-logs', () => {
            const cliApiService = appLifecycle.getCliApiService();
            if (cliApiService) cliApiService.clearLogs();
            return { success: true };
        });
        ipcMain.handle('cli-api-regenerate-token', async () => {
            const cliApiService = appLifecycle.getCliApiService();
            if (!cliApiService) return { success: false, error: 'CLI API service not available' };
            try {
                const token = await cliApiService.regenerateToken();
                return { success: true, token };
            } catch (err: unknown) {
                return { success: false, error: errorMessage(err) };
            }
        });

        // Workspace
        ipcMain.handle('deleteWorkspaceFolder', workspaceHandlers.handleDeleteWorkspaceFolder.bind(workspaceHandlers));
        ipcMain.handle('workspace-test-connection', workspaceHandlers.handleWorkspaceTestConnection.bind(workspaceHandlers));
        ipcMain.handle('workspace-sync', workspaceHandlers.handleWorkspaceSync.bind(workspaceHandlers));
        ipcMain.handle('workspace-sync-all', workspaceHandlers.handleWorkspaceSyncAll.bind(workspaceHandlers));
        ipcMain.handle('workspace-get-sync-status', workspaceHandlers.handleWorkspaceGetSyncStatus.bind(workspaceHandlers));
        ipcMain.handle('workspace-auto-sync-enabled', workspaceHandlers.handleWorkspaceAutoSyncEnabled.bind(workspaceHandlers));
        ipcMain.handle('workspace-open-folder', workspaceHandlers.handleWorkspaceOpenFolder.bind(workspaceHandlers));
        ipcMain.handle('services-health-check', workspaceHandlers.handleServicesHealthCheck.bind(workspaceHandlers));
        ipcMain.handle('initializeWorkspaceSync', workspaceHandlers.handleInitializeWorkspaceSync.bind(workspaceHandlers));
        ipcMain.handle('deleteWorkspace', workspaceHandlers.handleDeleteWorkspace.bind(workspaceHandlers));
        ipcMain.handle('generate-team-workspace-invite', workspaceHandlers.handleGenerateTeamWorkspaceInvite.bind(workspaceHandlers));
        ipcMain.handle('generate-environment-config-link', workspaceHandlers.handleGenerateEnvironmentConfigLink.bind(workspaceHandlers));

        // Updates
        ipcMain.on('check-for-updates', autoUpdater.handleManualUpdateCheck.bind(autoUpdater));
        ipcMain.on('install-update', autoUpdater.installUpdate.bind(autoUpdater));

        // Window management
        ipcMain.on('showMainWindow', () => windowManager.showWindow());
        ipcMain.on('hideMainWindow', () => windowManager.hideWindow());
        ipcMain.on('minimizeWindow', () => windowManager.minimizeWindow());
        ipcMain.on('maximizeWindow', () => windowManager.maximizeWindow());
        ipcMain.on('closeWindow', () => windowManager.closeWindow());
        ipcMain.on('quitApp', () => {
            appLifecycle.setQuitting(true);
            windowManager.sendToWindow('quitApp');
            app.quit();
        });
        ipcMain.on('restartApp', () => {
            if (!autoUpdater.updateDownloaded) {
                app.relaunch();
            }
            app.quit();
        });

        // Renderer ready signal
        ipcMain.on('renderer-ready', () => {
            log.info('Renderer signaled that it is ready');
            protocolHandler.setRendererReady();
        });

        // Runtime updates
        ipcMain.on('updateWebSocketSources', async (_event: IpcMainEvent, sources: Array<{ sourceId?: string; sourceContent?: string | null }>) => {
            const webSocketService = (await import('./services/websocket/ws-service')).default;
            log.info(`Main: Received updateWebSocketSources with ${sources?.length || 0} sources`);
            if (sources && sources.length > 0) {
                log.info(`Main: Sources with content: ${sources.filter((s) => s.sourceContent).length}`);
                sources.forEach((source) => {
                    log.info(`  Main: Source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
                });
            }
            webSocketService.updateSources(sources);
        });

        ipcMain.on('proxy-update-source', async (_event: IpcMainEvent, sourceId: string, value: string) => {
            const proxyService = (await import('./services/proxy/ProxyService')).default;
            proxyService.updateSource(sourceId, value);
        });

        ipcMain.on('proxy-update-sources', async (_event: IpcMainEvent, sources: Array<{ sourceId?: string; sourceContent?: string | null }>) => {
            const proxyService = (await import('./services/proxy/ProxyService')).default;
            if (Array.isArray(sources)) {
                proxyService.updateSources(sources);
            }
        });

        // Workspace events
        ipcMain.on('workspace-switched', workspaceHandlers.handleWorkspaceSwitched.bind(workspaceHandlers));
        ipcMain.on('workspace-updated', workspaceHandlers.handleWorkspaceUpdated.bind(workspaceHandlers));

        // Environment events - notify WebSocket service when environments change
        ipcMain.on('environment-switched', async (_event: IpcMainEvent, data: { variables?: Record<string, string> }) => {
            const proxyService = (await import('./services/proxy/ProxyService')).default;
            log.info('Environment switched, notifying proxy service');
            // Update proxy service with new environment variables
            if (data && data.variables) {
                proxyService.updateEnvironmentVariables(data.variables);
            }

            // Re-load sources since they might have environment-dependent values
            try {
                // Get current workspace
                const workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
                const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                const { activeWorkspaceId } = JSON.parse(workspacesData);

                if (activeWorkspaceId) {
                    const sourcesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'sources.json');
                    const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                    const sources = JSON.parse(sourcesData);
                    if (Array.isArray(sources)) {
                        proxyService.updateSources(sources);
                        log.info(`Re-loaded ${sources.length} sources after environment switch`);
                    }
                }
            } catch (error: unknown) {
                log.warn('Could not re-load sources after environment switch:', errorMessage(error));
            }

            // Rules re-broadcast is handled by ws-environment-handler's IPC listener
        });

        ipcMain.on('environment-variables-changed', async (_event: IpcMainEvent, data: { variables?: Record<string, string> }) => {
            const proxyService = (await import('./services/proxy/ProxyService')).default;
            log.info('Environment variables changed, notifying proxy service');
            // Update proxy service with new environment variables
            if (data && data.variables) {
                proxyService.updateEnvironmentVariables(data.variables);
            }
            // Rules re-broadcast is handled by ws-environment-handler's IPC listener
        });
    }

    // Initialize app when Electron is ready
    app.whenReady().then(async () => {
        await appLifecycle.initializeApp();

        await proxyHandlers.autoStartProxy();

        setupIPC();

        mainWindow = windowManager.createWindow();

        // Store window reference for protocol handler
        protocolHandler.setMainWindow(mainWindow!);

        // Pass window reference to CLI API service for renderer notifications
        const cliApiService = appLifecycle.getCliApiService();
        if (cliApiService && mainWindow) {
            cliApiService.setMainWindow(mainWindow);
        }

        trayManager.createTray();

        // Custom application menu — applied on ALL platforms.
        // Controls which keyboard shortcuts are available (no Reload, no DevTools).
        // On Windows/Linux the menu bar is hidden (autoHideMenuBar) but shortcuts still work.
        const isMac = process.platform === 'darwin';

        const openSettings = () => {
            windowManager.showWindow();
            setTimeout(() => {
                windowManager.sendToWindow('navigate-to', { tab: 'settings' });
            }, 300);
        };

        const openUpdateCheck = () => {
            windowManager.showWindow();
            setTimeout(() => {
                windowManager.sendToWindow('trigger-update-check');
            }, 300);
        };

        const appMenuTemplate = [
            // macOS app menu (About, Check for Updates, Settings, Services, Hide, Quit)
            ...(isMac ? [{
                label: app.getName(),
                submenu: [
                    { label: `About ${app.getName()}`, click: () => app.showAboutPanel() },
                    { label: 'Check for Updates...', click: openUpdateCheck },
                    { type: 'separator' },
                    { label: 'Settings...', accelerator: 'Cmd+,', click: openSettings },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            }] : []),
            // File menu
            {
                label: 'File',
                submenu: [
                    ...(!isMac ? [
                        { label: 'Settings', accelerator: 'Ctrl+,', click: openSettings },
                        { label: 'Check for Updates...', click: openUpdateCheck },
                        { type: 'separator' },
                    ] : []),
                    isMac ? { role: 'close' } : { role: 'quit' }
                ]
            },
            // Edit menu (curated — no Substitutions, Speech, Writing Tools, etc.)
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'selectAll' }
                ]
            },
            // View menu (no Reload, Force Reload, or DevTools)
            {
                label: 'View',
                submenu: [
                    { role: 'resetZoom', label: 'Actual Size' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            // Window menu (standard)
            { role: 'windowMenu' },
            // Help menu
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'Documentation',
                        click: () => shell.openExternal('https://openheaders.io')
                    },
                    {
                        label: 'Report an Issue',
                        click: () => shell.openExternal('https://github.com/OpenHeaders/open-headers-app/issues')
                    }
                ]
            }
        ];
        Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate as MenuItemConstructorOptions[]));

        await networkHandlers.initializeNetworkService();
        networkHandlers.setupNativeMonitoring();

        autoUpdater.setupAutoUpdater();

        // Initialize global shortcuts
        await globalShortcuts.initialize(app);

        const { AppStateMachine } = await import('./services/core/AppStateMachine');
        const proxyService = (await import('./services/proxy/ProxyService')).default;
        const webSocketService = (await import('./services/websocket/ws-service')).default;

        AppStateMachine.serversReady({
            proxy: proxyService.getStatus(),
            websocket: webSocketService.getConnectionStatus()
        });

        log.info('Application initialization complete. State:', AppStateMachine.getStateSummary());

        // macOS: Show window when dock icon clicked
        app.on('activate', () => {
            if (windowManager.getAllWindows().length === 0) {
                mainWindow = windowManager.createWindow();
                protocolHandler.setMainWindow(mainWindow!);
                const cliApi = appLifecycle.getCliApiService();
                if (cliApi && mainWindow) cliApi.setMainWindow(mainWindow);
            } else {
                windowManager.showWindow();
            }
        });
    });

    // Windows/Linux: Quit when all windows closed
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    // macOS open-url is handled by protocolHandler.setupProtocolHandlers()
    // Windows protocol URLs arrive via second-instance or command line args below

    // Handle protocol URLs passed as command line arguments on first launch
    let protocolUrl: string | null = null;

    // Try multiple methods to find the protocol URL
    for (const arg of process.argv) {
        // Direct protocol URL
        if (arg.startsWith('openheaders://')) {
            protocolUrl = arg;
            break;
        }
        // URL without protocol prefix (Windows sometimes strips it)
        if (arg.includes('open?')) {
            if (!arg.startsWith('openheaders://')) {
                protocolUrl = 'openheaders://' + arg;
            } else {
                protocolUrl = arg;
            }
            break;
        }
        // Check if it's a base64 encoded parameter (Windows edge case)
        if (arg.match(/^[A-Za-z0-9+/]+=*$/) && arg.length > 50) {
            try {
                const decoded = atob(arg);
                const parsed = JSON.parse(decoded);

                // Check for unified format
                if (parsed.action && parsed.version && parsed.data) {
                    log.info('Found base64 encoded unified payload, reconstructing URL');
                    protocolUrl = `openheaders://open?payload=${arg}`;
                    break;
                }
            } catch (e) {
                // Not a valid base64 JSON, continue
            }
        }
    }

    if (protocolUrl) {
        log.info('Found protocol URL in initial argv:', protocolUrl);

        // Validate the URL first
        const validation = protocolHandler.validateProtocolUrl(protocolUrl);
        if (!validation.valid) {
            log.error('Invalid protocol URL in initial argv:', validation.error);
            app.whenReady().then(() => {
                setTimeout(() => {
                    protocolHandler.handleProtocolError(validation.error!);
                }, 1000);
            });
        } else {
            app.whenReady().then(() => {
                // On Windows, delay protocol handling to ensure window is ready and can be focused
                const protocolDelay = process.platform === 'win32' ? 2000 : 1000;
                setTimeout(() => {
                    protocolHandler.handleProtocolUrl(protocolUrl!);
                }, protocolDelay);
            });
        }
    } else {
        log.info('No protocol URL found in initial argv');
    }

    app.on('before-quit', (event) => {
        // If cleanup already done (e.g., installUpdate called beforeQuit explicitly),
        // let the quit proceed without blocking.
        if (appLifecycle.isCleanupDone()) return;

        // Prevent default quit — Electron doesn't await async handlers,
        // so we hold the quit until servers are properly closed.
        event.preventDefault();

        globalShortcuts.cleanup();
        appLifecycle.beforeQuit().then(() => {
            // Servers are closed, ports released.
            // If an update was downloaded, install it now (after cleanup).
            if (autoUpdater.updateDownloaded) {
                autoUpdater.installUpdate();
                // installUpdate calls quitAndInstall → app.exit, so we're done.
                return;
            }
            // No update — just exit.
            app.exit(0);
        }).catch((err: Error) => {
            log.error('Cleanup failed during quit, forcing exit:', err);
            app.exit(1);
        });
    });
}

export { app, mainWindow };
