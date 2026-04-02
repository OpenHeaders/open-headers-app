// Electron main process — phased startup for fast window display

import type { Source } from '@openheaders/core';
import { errorMessage } from '@openheaders/core';
import type {
  BrowserWindow as BrowserWindowType,
  IpcMainEvent,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
} from 'electron';
import electron from 'electron';
import settingsCache from './services/core/SettingsCache';
import mainLogger from './utils/mainLogger';

const { app, ipcMain, Menu, shell } = electron;
const { createLogger } = mainLogger;

// Only import modules needed before app.whenReady()
import protocolHandler from './main/modules/protocol/protocolHandler';
import { writeRestartHiddenFlag } from './main/modules/window/restartFlag';

const log = createLogger('Main');

let mainWindow: BrowserWindowType | null = null;

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
  log.info(`App starting with ${process.argv.length} arg(s): ${process.argv.join(' ')}`);
  log.info(`App executable path: ${process.execPath}`);
  log.info(`Platform: ${process.platform}`);

  app.setName('OpenHeaders');
  app.commandLine.appendSwitch('use-system-ca-store');

  protocolHandler.setupProtocol();
  protocolHandler.setupProtocolHandlers();

  app.whenReady().then(async () => {
    const settings = await phaseA_loadSettings();
    const modules = await phaseB_createWindow(settings);
    phaseC_backgroundInit(modules);
    registerAppEventHandlers(modules);
  });

  // ─── PHASE A: Critical path (before window) ─────────────────────────
  // Load settings ONCE, apply log level, dock visibility, register startup IPC.
  // Everything the renderer needs at module-load time is prepared here.

  async function phaseA_loadSettings() {
    const settings = await settingsCache.load();

    log.info(`App started at ${new Date().toISOString()}`);
    log.info(`App version: ${app.getVersion()}`);

    if (settings.logLevel) {
      const { setGlobalLogLevel } = await import('./utils/mainLogger');
      setGlobalLogLevel(settings.logLevel);
    }

    if (process.platform === 'darwin' && app.dock) {
      if (!settings.showDockIcon) {
        app.dock.hide();
      } else {
        app.dock.show().catch(() => {});
      }
    }

    if (settingsCache.isFirstRun()) {
      (globalThis as typeof globalThis & { isFirstRun?: boolean }).isFirstRun = true;
    }

    // Synchronous IPC: provides settings to preload script instantly (no async round-trip).
    // Must be registered BEFORE window creation so the preload can call it.
    ipcMain.on('get-startup-data', (event) => {
      event.returnValue = {
        settings: settingsCache.get(),
        platform: process.platform,
        version: app.getVersion(),
        isPackaged: app.isPackaged,
      };
    });

    return settings;
  }

  // ─── PHASE B: Window + IPC (user sees the app shell) ────────────────
  // Import modules, register IPC handlers, create window + tray.
  // The renderer loads HTML/JS and renders the themed shell immediately
  // using window.startupData (no async IPC needed for first paint).

  async function phaseB_createWindow(settings: Awaited<ReturnType<typeof settingsCache.load>>) {
    const [
      windowManager,
      trayManager,
      appLifecycle,
      globalShortcuts,
      autoUpdater,
      networkHandlers,
      fileHandlers,
      storageHandlers,
      settingsHandlers,
      systemHandlers,
      httpRequestHandlers,
      recordingHandlers,
      proxyHandlers,
      workspaceHandlers,
      gitHandlers,
    ] = await Promise.all([
      import('./main/modules/window/windowManager').then((m) => m.default),
      import('./main/modules/tray/trayManager').then((m) => m.default),
      import('./main/modules/app/lifecycle').then((m) => m.default),
      import('./main/modules/shortcuts/globalShortcuts').then((m) => m.default),
      import('./main/modules/updater/autoUpdater').then((m) => m.default),
      import('./main/modules/network/networkHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/fileHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/storageHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/settingsHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/systemHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/httpRequestHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/recordingHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/proxyHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/workspaceHandlers').then((m) => m.default),
      import('./main/modules/ipc/handlers/gitHandlers').then((m) => m.default),
    ]);

    setupIPC(
      fileHandlers,
      storageHandlers,
      settingsHandlers,
      systemHandlers,
      httpRequestHandlers,
      recordingHandlers,
      proxyHandlers,
      workspaceHandlers,
      gitHandlers,
      appLifecycle,
      autoUpdater,
      globalShortcuts,
      networkHandlers,
      windowManager,
      protocolHandler,
    );

    // If a protocol URL arrived before the window was created, ensure the
    // window is shown regardless of hideOnLaunch / isAutoLaunch settings.
    // Covers: macOS open-url (pendingInvite) and Windows/Linux argv (protocolUrl).
    if (protocolHandler.pendingInvite || protocolHandler.pendingEnvironmentImport || protocolUrl) {
      windowManager.setLaunchedByProtocol();
    }

    mainWindow = windowManager.createWindow(settings);
    protocolHandler.setMainWindow(mainWindow!);

    trayManager.createTray();
    setupMenu(windowManager);

    return {
      windowManager,
      trayManager,
      appLifecycle,
      globalShortcuts,
      autoUpdater,
      networkHandlers,
      proxyHandlers,
    };
  }

  // ─── PHASE C: Background services (non-blocking) ────────────────────
  // Services initialize in the background. The renderer shows skeletons
  // until workspace data is loaded via IPC.

  function phaseC_backgroundInit(modules: Awaited<ReturnType<typeof phaseB_createWindow>>) {
    const { appLifecycle, proxyHandlers, networkHandlers, autoUpdater, globalShortcuts } = modules;

    const run = async () => {
      await appLifecycle.initializeApp();
      await proxyHandlers.autoStartProxy();

      const cliApiService = appLifecycle.getCliApiService();
      if (cliApiService && mainWindow) cliApiService.setMainWindow(mainWindow);

      await networkHandlers.initializeNetworkService();
      networkHandlers.setupNativeMonitoring();

      autoUpdater.setupAutoUpdater();
      await globalShortcuts.initialize(app);

      const { AppStateMachine } = await import('./services/core/AppStateMachine');
      const proxyService = (await import('./services/proxy/ProxyService')).default;
      const webSocketService = (await import('./services/websocket/ws-service')).default;

      AppStateMachine.serversReady({
        proxy: proxyService.getStatus(),
        websocket: webSocketService.getConnectionStatus(),
      });

      log.info('Application initialization complete. State:', AppStateMachine.getStateSummary());

      // First-run auto-launch setup — deferred to Phase C so it never
      // blocks window creation. Not inherently slow, but on first launch
      // macOS Gatekeeper/XProtect scans unsigned apps (10-30s) which
      // delays the entire main thread; keeping Phase A minimal ensures
      // the window appears as soon as the OS releases the process.
      if (settingsCache.isFirstRun()) {
        log.info('First run detected, enabling auto-launch');
        try {
          const AutoLaunch = (await import('auto-launch')).default;
          const args = process.platform === 'win32' ? ['--hidden', '--autostart'] : ['--hidden'];
          const autoLauncher = new AutoLaunch({
            name: app.getName(),
            path: app.getPath('exe'),
            args,
            isHidden: true,
          });
          await autoLauncher.enable();
          log.info('Auto-launch enabled for first-time user');
        } catch (autoLaunchError) {
          log.error('Error setting up auto-launch:', autoLaunchError);
        }
      }
    };

    // Fire and forget — do not block the window
    run().catch((err: Error) => log.error('Background init error:', err));
  }

  // ─── App event handlers ─────────────────────────────────────────────

  function registerAppEventHandlers(modules: Awaited<ReturnType<typeof phaseB_createWindow>>) {
    const { windowManager, trayManager, appLifecycle, globalShortcuts, autoUpdater } = modules;

    // macOS: Show window when dock icon clicked
    app.on('activate', () => {
      if (windowManager.getAllWindows().length === 0) {
        mainWindow = windowManager.createWindow(settingsCache.get());
        protocolHandler.setMainWindow(mainWindow!);
        const cliApi = appLifecycle.getCliApiService();
        if (cliApi && mainWindow) cliApi.setMainWindow(mainWindow);
      } else {
        windowManager.showWindow();
      }
    });

    app.on('before-quit', (event) => {
      if (appLifecycle.isCleanupDone()) return;

      event.preventDefault();
      globalShortcuts.cleanup();
      autoUpdater.shutdown();
      trayManager.destroy();
      appLifecycle
        .beforeQuit()
        .then(() => {
          if (autoUpdater.updateDownloaded) {
            autoUpdater.installUpdate();
            return;
          }
          app.exit(0);
        })
        .catch((err: Error) => {
          log.error('Cleanup failed during quit, forcing exit:', err);
          app.exit(1);
        });
    });
  }

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

  for (const arg of process.argv) {
    if (arg.startsWith('openheaders://')) {
      protocolUrl = arg;
      break;
    }
    if (arg.includes('open?')) {
      protocolUrl = arg.startsWith('openheaders://') ? arg : `openheaders://${arg}`;
      break;
    }
    if (arg.match(/^[A-Za-z0-9+/]+=*$/) && arg.length > 50) {
      try {
        const decoded = atob(arg);
        const parsed = JSON.parse(decoded);
        if (parsed.action && parsed.version && parsed.data) {
          log.info('Found base64 encoded unified payload, reconstructing URL');
          protocolUrl = `openheaders://open?payload=${arg}`;
          break;
        }
      } catch {
        // Not a valid base64 JSON, continue
      }
    }
  }

  if (protocolUrl) {
    log.info('Found protocol URL in initial argv:', protocolUrl);
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
        const protocolDelay = process.platform === 'win32' ? 2000 : 1000;
        setTimeout(() => {
          protocolHandler.handleProtocolUrl(protocolUrl!);
        }, protocolDelay);
      });
    }
  } else {
    log.info('No protocol URL found in initial argv');
  }
}

// ─── IPC Registration ───────────────────────────────────────────────────────

function setupIPC(
  fileHandlers: typeof import('./main/modules/ipc/handlers/fileHandlers').default,
  storageHandlers: typeof import('./main/modules/ipc/handlers/storageHandlers').default,
  settingsHandlers: typeof import('./main/modules/ipc/handlers/settingsHandlers').default,
  systemHandlers: typeof import('./main/modules/ipc/handlers/systemHandlers').default,
  httpRequestHandlers: typeof import('./main/modules/ipc/handlers/httpRequestHandlers').default,
  recordingHandlers: typeof import('./main/modules/ipc/handlers/recordingHandlers').default,
  proxyHandlers: typeof import('./main/modules/ipc/handlers/proxyHandlers').default,
  workspaceHandlers: typeof import('./main/modules/ipc/handlers/workspaceHandlers').default,
  gitHandlers: typeof import('./main/modules/ipc/handlers/gitHandlers').default,
  appLifecycle: typeof import('./main/modules/app/lifecycle').default,
  autoUpdater: typeof import('./main/modules/updater/autoUpdater').default,
  globalShortcuts: typeof import('./main/modules/shortcuts/globalShortcuts').default,
  networkHandlers: typeof import('./main/modules/network/networkHandlers').default,
  windowManager: typeof import('./main/modules/window/windowManager').default,
  protocolHandler: typeof import('./main/modules/protocol/protocolHandler').default,
) {
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

  // HTTP request execution (main-process owned)
  ipcMain.handle('http:execute-request', httpRequestHandlers.handleExecuteRequest);
  ipcMain.handle('http:get-totp-cooldown', httpRequestHandlers.handleGetTotpCooldown);
  ipcMain.handle('http:generate-totp-preview', httpRequestHandlers.handleGenerateTotpPreview);

  // Source refresh (main-process owned)
  void import('./main/modules/ipc/handlers/sourceRefreshHandlers').then(({ default: sourceRefreshHandlers }) => {
    ipcMain.handle('source-refresh:manual', sourceRefreshHandlers.handleManualRefresh);
    ipcMain.handle('source-refresh:update-source', sourceRefreshHandlers.handleUpdateSource);
    ipcMain.handle('source-refresh:get-status', sourceRefreshHandlers.handleGetStatus);
    ipcMain.handle('source-refresh:get-time-until', sourceRefreshHandlers.handleGetTimeUntil);
  });

  // Workspace state (main-process owned)
  void import('./main/modules/ipc/handlers/workspaceStateHandlers').then(({ registerWorkspaceStateHandlers }) => {
    registerWorkspaceStateHandlers();
  });

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

  // CLI API
  ipcMain.handle('cli-api-status', () => {
    const cliApiService = appLifecycle.getCliApiService();
    if (!cliApiService)
      return { running: false, port: 59213, discoveryPath: '', token: '', startedAt: null, totalRequests: 0 };
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
  ipcMain.handle(
    'workspace-auto-sync-enabled',
    workspaceHandlers.handleWorkspaceAutoSyncEnabled.bind(workspaceHandlers),
  );
  ipcMain.handle('workspace-open-folder', workspaceHandlers.handleWorkspaceOpenFolder.bind(workspaceHandlers));
  ipcMain.handle('services-health-check', workspaceHandlers.handleServicesHealthCheck.bind(workspaceHandlers));
  ipcMain.handle('initializeWorkspaceSync', workspaceHandlers.handleInitializeWorkspaceSync.bind(workspaceHandlers));
  ipcMain.handle(
    'generate-team-workspace-invite',
    workspaceHandlers.handleGenerateTeamWorkspaceInvite.bind(workspaceHandlers),
  );
  ipcMain.handle(
    'generate-environment-config-link',
    workspaceHandlers.handleGenerateEnvironmentConfigLink.bind(workspaceHandlers),
  );

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
    // Preserve hidden state across restart.
    // writeRestartHiddenFlag is sync (fs.writeFileSync) so it completes
    // before app.quit() tears down the process.
    const mw = windowManager.getMainWindow();
    if (!mw?.isVisible()) {
      writeRestartHiddenFlag();
    }
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

  // Runtime updates — proxy source updates are still used by some direct callers
  ipcMain.on('proxy-update-source', async (_event: IpcMainEvent, sourceId: string, value: string) => {
    const proxyService = (await import('./services/proxy/ProxyService')).default;
    proxyService.updateSource(sourceId, value);
  });

  ipcMain.on('proxy-update-sources', async (_event: IpcMainEvent, sources: Source[]) => {
    const proxyService = (await import('./services/proxy/ProxyService')).default;
    if (Array.isArray(sources)) {
      proxyService.updateSources(sources);
    }
  });

  // Environment events — main process (WorkspaceStateService) now owns all environment
  // state directly. No IPC listeners needed — CRUD operations come through
  // workspace-state:* IPC handlers registered in workspaceStateHandlers.ts.
}

// ─── Application Menu ───────────────────────────────────────────────────────

function setupMenu(windowManager: typeof import('./main/modules/window/windowManager').default) {
  const isMac = process.platform === 'darwin';

  const openSettings = () => {
    windowManager.showWindow();
    windowManager.sendToWindow('navigate-to', { tab: 'settings' });
  };

  const openUpdateCheck = () => {
    windowManager.showWindow();
    windowManager.sendToWindow('trigger-update-check');
  };

  const appMenuTemplate = [
    ...(isMac
      ? [
          {
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
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        ...(!isMac
          ? [
              { label: 'Settings', accelerator: 'Ctrl+,', click: openSettings },
              { label: 'Check for Updates...', click: openUpdateCheck },
              { type: 'separator' },
            ]
          : []),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged
          ? [
              { type: 'separator' as const },
              { role: 'toggleDevTools' as const },
              { role: 'reload' as const },
              { role: 'forceReload' as const },
            ]
          : []),
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://openheaders.io') },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/OpenHeaders/open-headers-app/issues'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate as MenuItemConstructorOptions[]));
}

export { app, mainWindow };
