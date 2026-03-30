import path from 'node:path';
import type { BrowserWindowConstructorOptions, BrowserWindow as BrowserWindowType, WebContents } from 'electron';
import electron from 'electron';
import type { AppSettings } from '../../../types/settings';
import mainLogger from '../../../utils/mainLogger';
import appLifecycle from '../app/lifecycle';
import windowsFocusHelper from '../utils/windowsFocus';
import { consumeRestartHiddenFlag } from './restartFlag';

const { BrowserWindow, shell, app } = electron;
const { createLogger } = mainLogger;
const log = createLogger('WindowManager');

class WindowManager {
  mainWindow: BrowserWindowType | null;
  appLaunchArgs: {
    argv: string[];
    startMinimized: boolean;
    isAutoLaunch: boolean;
  };
  private _launchedByProtocol = false;

  constructor() {
    this.mainWindow = null;
    this.appLaunchArgs = {
      argv: process.argv,
      startMinimized:
        process.argv.includes('--hidden') || process.argv.includes('--minimize') || process.argv.includes('/hidden'),
      isAutoLaunch: false,
    };
  }

  /**
   * Mark that the app was launched (or activated) by a protocol URL
   * that requires user interaction. Forces the window to show regardless
   * of hideOnLaunch / isAutoLaunch settings.
   */
  setLaunchedByProtocol() {
    this._launchedByProtocol = true;
  }

  createWindow(settings?: AppSettings) {
    // Create window hidden to prevent flash during startup configuration
    // Platform-specific window configuration
    const windowConfig: BrowserWindowConstructorOptions = {
      width: 1350,
      height: 800,
      minWidth: 680,
      minHeight: 440,
      center: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        devTools: !app.isPackaged,
      },
      show: false,
      autoHideMenuBar: true,
      resizable: true,
      minimizable: true,
      maximizable: true,
      closable: true,
    };

    if (process.platform === 'darwin') {
      // macOS: Use native traffic lights, hidden title bar
      windowConfig.titleBarStyle = 'hiddenInset';
      windowConfig.frame = true;
    } else {
      // Windows/Linux: Completely frameless with custom controls
      windowConfig.frame = false;
    }

    this.mainWindow = new BrowserWindow(windowConfig);

    // In dev mode, electron-vite serves renderer via its dev server
    // Only trust ELECTRON_RENDERER_URL when not packaged to prevent env injection attacks
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer', 'index.html'));
    }

    // Setup other configurations after loading starts
    this.setupCSP();
    this.detectAutoLaunch();
    this.setupWindowEvents(settings);

    // Development mode DevTools — auto-open only when unpackaged with --dev flag
    if (!app.isPackaged && process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    return this.mainWindow;
  }

  setupCSP() {
    // Electron-optimized Content Security Policy with local development support
    this.mainWindow!.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' http: https: data: blob: file: http://localhost:*; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: http://localhost:*; " +
              "style-src 'self' 'unsafe-inline' http: https: http://localhost:*; " +
              "style-src-elem 'self' 'unsafe-inline' http: https: http://localhost:*; " +
              "img-src 'self' data: blob: http: https: http://localhost:*; " +
              "font-src 'self' data: http: https: http://localhost:*; " +
              "connect-src 'self' http: https: ws: wss: file: http://localhost:*; " +
              "media-src 'self' blob: http: https: http://localhost:*; " +
              "frame-src 'self' http: https: http://localhost:*;",
          ],
        },
      });
    });
  }

  detectAutoLaunch() {
    const loginSettings = app.getLoginItemSettings();

    log.info(
      `Detecting auto-launch: openAtLogin=${loginSettings.openAtLogin}, wasOpenedAtLogin=${loginSettings.wasOpenedAtLogin}, startMinimized=${this.appLaunchArgs.startMinimized}`,
    );

    // Cross-platform auto-launch detection with OS-specific heuristics
    if (process.platform === 'darwin') {
      this.appLaunchArgs.isAutoLaunch =
        loginSettings.wasOpenedAtLogin || loginSettings.wasOpenedAsHidden || this.appLaunchArgs.startMinimized;
    } else if (process.platform === 'win32') {
      this.appLaunchArgs.isAutoLaunch =
        this.appLaunchArgs.startMinimized ||
        process.argv.includes('--autostart') ||
        process.execPath
          .toLowerCase()
          .includes('\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\startup') ||
        loginSettings.wasOpenedAtLogin;
    } else {
      this.appLaunchArgs.isAutoLaunch =
        this.appLaunchArgs.startMinimized ||
        process.argv.includes('--autostart') ||
        process.argv.some((arg) => arg.includes('autostart')) ||
        loginSettings.wasOpenedAtLogin;
    }

    log.info('Auto-launch detection result:', this.appLaunchArgs.isAutoLaunch);
  }

  setupWindowEvents(settings?: AppSettings) {
    // Smart window visibility based on launch context and user settings
    this.mainWindow!.once('ready-to-show', () => {
      const hideOnLaunch = Boolean(settings?.hideOnLaunch);
      const isAutoLaunch = this.appLaunchArgs.isAutoLaunch;
      const isUpdateRestart = consumeRestartHiddenFlag();
      const launchedByProtocol = this._launchedByProtocol;

      log.info(
        `App launch details: hideOnLaunch=${hideOnLaunch}, isAutoLaunch=${isAutoLaunch}, isUpdateRestart=${isUpdateRestart}, launchedByProtocol=${launchedByProtocol}`,
      );

      // Hide window for auto-launches or update/app restarts when user has
      // enabled the setting, but ALWAYS show when launched by a protocol URL
      // (user clicked a link that requires interaction — invite, env import, etc.)
      const shouldHideWindow = hideOnLaunch && (isAutoLaunch || isUpdateRestart) && !launchedByProtocol;

      if (!shouldHideWindow) {
        log.info(
          launchedByProtocol
            ? 'Showing window on startup (launched by protocol URL)'
            : 'Showing window on startup (manual launch detected)',
        );
        windowsFocusHelper.focusWindow(this.mainWindow!);
      } else {
        log.info(
          isUpdateRestart
            ? 'Keeping window hidden on startup (update restart with hide setting enabled)'
            : 'Keeping window hidden on startup (auto-launch with hide setting enabled)',
        );
      }

      // Reset the flag after the first show decision
      this._launchedByProtocol = false;

      // Apply dock visibility AFTER window is shown/hidden
      if (process.platform === 'darwin' && settings) {
        setTimeout(async () => {
          const trayManager = (await import('../tray/trayManager')).default;
          trayManager.updateTray(settings);
          log.info('Applied dock visibility setting after window ready');
        }, 100);
      }
    });

    // Hide to system tray instead of closing unless app is quitting
    this.mainWindow!.on('close', (event: Electron.Event) => {
      if (!appLifecycle.isQuittingApp()) {
        event.preventDefault();
        this.mainWindow!.hide();
        return false;
      }
      return true;
    });

    // Block navigation away from the app — prevents renderer compromise
    // from escalating to arbitrary URL loading with preload context
    this.mainWindow!.webContents.on('will-navigate', (event: Electron.Event, navigationUrl: string) => {
      const parsedUrl = new URL(navigationUrl);
      // Allow dev server navigation only when not packaged
      const isDevServer =
        !app.isPackaged &&
        process.env.ELECTRON_RENDERER_URL &&
        parsedUrl.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
      if (parsedUrl.protocol !== 'file:' && !isDevServer) {
        event.preventDefault();
        log.warn('Blocked navigation to non-file URL:', navigationUrl);
      }
    });

    // Whitelist permissions — only allow what the app actually needs
    this.mainWindow!.webContents.session.setPermissionRequestHandler(
      (_webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
        const allowedPermissions = ['media', 'display-capture', 'screen'];
        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          log.warn('Denied permission request:', permission);
          callback(false);
        }
      },
    );

    // Redirect external links to default browser
    this.mainWindow!.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      shell.openExternal(url).catch((err: Error) => {
        log.error('Failed to open external link:', err);
      });
      return { action: 'deny' };
    });
  }

  getMainWindow(): BrowserWindowType | null {
    return this.mainWindow;
  }

  showWindow() {
    if (this.mainWindow) {
      windowsFocusHelper.focusWindow(this.mainWindow!);

      this.mainWindow.webContents.send('showApp');
    }
  }

  hideWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      this.mainWindow.webContents.send('hideApp');
    }
  }

  sendToWindow(channel: string, ...args: unknown[]) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  getAllWindows() {
    return BrowserWindow.getAllWindows();
  }

  // Window control methods for frameless window
  minimizeWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.minimize();
    }
  }

  maximizeWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow.maximize();
      }
    }
  }

  closeWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
  }
}

const windowManager = new WindowManager();

export { WindowManager };
export default windowManager;
