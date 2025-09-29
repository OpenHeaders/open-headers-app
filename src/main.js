// Electron main process
const { app, ipcMain } = require('electron');
const { createLogger } = require('./utils/mainLogger');

// Core modules
const appLifecycle = require('./main/modules/app/lifecycle');
const windowManager = require('./main/modules/window/windowManager');
const splashWindow = require('./main/modules/window/splashWindow');
const trayManager = require('./main/modules/tray/trayManager');
const networkHandlers = require('./main/modules/network/networkHandlers');
const autoUpdater = require('./main/modules/updater/autoUpdater');
const protocolHandler = require('./main/modules/protocol/protocolHandler');
const globalShortcuts = require('./main/modules/shortcuts/globalShortcuts');

// IPC handlers
const fileHandlers = require('./main/modules/ipc/handlers/fileHandlers');
const storageHandlers = require('./main/modules/ipc/handlers/storageHandlers');
const settingsHandlers = require('./main/modules/ipc/handlers/settingsHandlers');
const systemHandlers = require('./main/modules/ipc/handlers/systemHandlers');
const httpHandlers = require('./main/modules/ipc/handlers/httpHandlers');
const recordingHandlers = require('./main/modules/ipc/handlers/recordingHandlers');
const proxyHandlers = require('./main/modules/ipc/handlers/proxyHandlers');
const workspaceHandlers = require('./main/modules/ipc/handlers/workspaceHandlers');
const gitHandlers = require('./main/modules/ipc/handlers/gitHandlers');

const log = createLogger('Main');

let mainWindow = null;

// Windows focus helper is initialized and will handle focus enhancement automatically

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
        appLifecycle.setupEarlyDockVisibility().catch(err => 
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
        
        // Global shortcuts
        const globalShortcuts = require('./main/modules/shortcuts/globalShortcuts');
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
        
        // Git
        ipcMain.handle('testGitConnection', gitHandlers.handleTestGitConnection);
        ipcMain.handle('getGitStatus', gitHandlers.handleGetGitStatus);
        ipcMain.handle('installGit', gitHandlers.handleInstallGit);
        ipcMain.handle('syncGitWorkspace', gitHandlers.handleSyncGitWorkspace);
        ipcMain.handle('cleanupGitRepository', gitHandlers.handleCleanupGitRepository);
        ipcMain.handle('commitConfiguration', gitHandlers.handleCommitConfiguration);
        ipcMain.handle('createBranch', gitHandlers.handleCreateBranch);
        ipcMain.handle('checkWritePermissions', gitHandlers.handleCheckWritePermissions);
        
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
            app.relaunch();
            app.quit();
        });
        
        // Renderer ready signal
        ipcMain.on('renderer-ready', () => {
            log.info('Renderer signaled that it is ready');
            protocolHandler.setRendererReady();
        });
        
        // Runtime updates
        ipcMain.on('updateWebSocketSources', (event, sources) => {
            const webSocketService = require('./services/websocket/ws-service');
            log.info(`Main: Received updateWebSocketSources with ${sources?.length || 0} sources`);
            if (sources && sources.length > 0) {
                log.info(`Main: Sources with content: ${sources.filter(s => s.sourceContent).length}`);
                sources.forEach(source => {
                    log.info(`  Main: Source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
                });
            }
            webSocketService.updateSources(sources);
        });
        
        ipcMain.on('proxy-update-source', (_, sourceId, value) => {
            const proxyService = require('./services/proxy/ProxyService');
            proxyService.updateSource(sourceId, value);
        });
        
        ipcMain.on('proxy-update-sources', (_, sources) => {
            const proxyService = require('./services/proxy/ProxyService');
            if (Array.isArray(sources)) {
                proxyService.updateSources(sources);
            }
        });
        
        // Workspace events
        ipcMain.on('workspace-switched', workspaceHandlers.handleWorkspaceSwitched.bind(workspaceHandlers));
        ipcMain.on('workspace-updated', workspaceHandlers.handleWorkspaceUpdated.bind(workspaceHandlers));
        
        // Environment events - notify WebSocket service when environments change
        ipcMain.on('environment-switched', async (event, data) => {
            const webSocketService = require('./services/websocket/ws-service');
            const proxyService = require('./services/proxy/ProxyService');
            log.info('Environment switched, notifying services to re-broadcast rules');
            // Update proxy service with new environment variables
            if (data && data.variables) {
                proxyService.updateEnvironmentVariables(data.variables);
            }
            
            // Re-load sources since they might have environment-dependent values
            try {
                const fs = require('fs').promises;
                const path = require('path');
                const { app } = require('electron');
                
                // Get current workspace
                const workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
                const workspacesData = await fs.readFile(workspacesPath, 'utf8');
                const { activeWorkspaceId } = JSON.parse(workspacesData);
                
                if (activeWorkspaceId) {
                    const sourcesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'sources.json');
                    const sourcesData = await fs.readFile(sourcesPath, 'utf8');
                    const sources = JSON.parse(sourcesData);
                    if (Array.isArray(sources)) {
                        proxyService.updateSources(sources);
                        log.info(`Re-loaded ${sources.length} sources after environment switch`);
                    }
                }
            } catch (error) {
                log.warn('Could not re-load sources after environment switch:', error.message);
            }
            
            // The WebSocket service will re-broadcast rules with updated environment variables
            webSocketService._broadcastRules();
        });
        
        ipcMain.on('environment-variables-changed', (event, data) => {
            const webSocketService = require('./services/websocket/ws-service');
            const proxyService = require('./services/proxy/ProxyService');
            log.info('Environment variables changed, notifying services to re-broadcast rules');
            // Update proxy service with new environment variables
            if (data && data.variables) {
                proxyService.updateEnvironmentVariables(data.variables);
            }
            // The WebSocket service will re-broadcast rules with updated environment variables
            webSocketService._broadcastRules();
        });
    }

    // Initialize app when Electron is ready
    app.whenReady().then(async () => {
        // Show splash screen immediately
        splashWindow.show();
        
        await appLifecycle.initializeApp();
        
        await proxyHandlers.autoStartProxy();
        
        setupIPC();
        
        mainWindow = windowManager.createWindow();
        
        // Handle splash screen after window loads
        mainWindow.webContents.once('did-finish-load', () => {
            // Close splash screen after main window is ready
            setTimeout(() => {
                if (splashWindow.isVisible()) {
                    splashWindow.close();
                }
            }, 500);
        });
        
        // Store window reference for protocol handler
        protocolHandler.setMainWindow(mainWindow);
        
        trayManager.createTray();
        
        await networkHandlers.initializeNetworkService();
        networkHandlers.setupNativeMonitoring();
        
        autoUpdater.setupAutoUpdater();
        
        // Initialize global shortcuts
        await globalShortcuts.initialize(app);
        
        const { AppStateMachine } = require('./services/core/AppStateMachine');
        const proxyService = require('./services/proxy/ProxyService');
        const webSocketService = require('./services/websocket/ws-service');
        
        AppStateMachine.serversReady({
            proxy: proxyService.getStatus(),
            websocket: webSocketService.getConnectionStatus()
        });
        
        log.info('Application initialization complete. State:', AppStateMachine.getStateSummary());

        // macOS: Show window when dock icon clicked
        app.on('activate', () => {
            if (windowManager.getAllWindows().length === 0) {
                mainWindow = windowManager.createWindow();
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
    
    // Handle protocol when app is not running (Windows)
    app.on('open-url', (event, url) => {
        event.preventDefault();
        log.info('Received open-url event:', url);
        protocolHandler.handleProtocolUrl(url);
    });

    // Handle protocol URLs passed as command line arguments on first launch
    let protocolUrl = null;
    
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
                    protocolHandler.handleProtocolError(validation.error);
                }, 1000);
            });
        } else {
            app.whenReady().then(() => {
                // On Windows, delay protocol handling to ensure window is ready and can be focused
                const protocolDelay = process.platform === 'win32' ? 2000 : 1000;
                setTimeout(() => {
                    protocolHandler.handleProtocolUrl(protocolUrl);
                }, protocolDelay);
            });
        }
    } else {
        log.info('No protocol URL found in initial argv');
    }

    app.on('before-quit', async () => {
        globalShortcuts.cleanup();
        await appLifecycle.beforeQuit();
    });
}

module.exports = { app, mainWindow };