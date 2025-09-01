const { BrowserWindow, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../../utils/mainLogger');
const windowsFocusHelper = require('../utils/windowsFocus');

const log = createLogger('WindowManager');

class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.appLaunchArgs = {
            argv: process.argv,
            startMinimized: process.argv.includes('--hidden') || process.argv.includes('--minimize') || process.argv.includes('/hidden'),
            isAutoLaunch: false
        };
    }

    createWindow() {
        // Create window hidden to prevent flash during startup configuration
        // Platform-specific window configuration
        const windowConfig = {
            width: 1350,
            height: 800,
            center: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true,
                webviewTag: false,
                allowRunningInsecureContent: false
            },
            show: false,
            autoHideMenuBar: true,
            resizable: true,
            minimizable: true,
            maximizable: true,
            closable: true
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

        // Load file immediately to start rendering faster
        this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

        // Setup other configurations after loading starts
        this.setupCSP();
        this.detectAutoLaunch();
        this.setupWindowEvents();

        // Development mode DevTools
        if (process.argv.includes('--dev')) {
            this.mainWindow.webContents.openDevTools();
        }

        return this.mainWindow;
    }

    setupCSP() {
        // Electron-optimized Content Security Policy with local development support
        this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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
                        "frame-src 'self' http: https: http://localhost:*;"
                    ]
                }
            });
        });
    }

    detectAutoLaunch() {
        const loginSettings = app.getLoginItemSettings();

        log.info('Detecting auto-launch:', {
            loginSettings,
            argv: process.argv,
            startMinimized: this.appLaunchArgs.startMinimized
        });

        // Cross-platform auto-launch detection with OS-specific heuristics
        if (process.platform === 'darwin') {
            this.appLaunchArgs.isAutoLaunch = loginSettings.wasOpenedAtLogin || loginSettings.wasOpenedAsHidden;
        } else if (process.platform === 'win32') {
            this.appLaunchArgs.isAutoLaunch = this.appLaunchArgs.startMinimized ||
                process.argv.includes('--autostart') ||
                process.execPath.toLowerCase().includes('\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\startup') ||
                loginSettings.wasOpenedAtLogin;
        } else {
            this.appLaunchArgs.isAutoLaunch = this.appLaunchArgs.startMinimized ||
                process.argv.includes('--autostart') ||
                process.argv.some(arg => arg.includes('autostart')) ||
                loginSettings.wasOpenedAtLogin;
        }

        log.info('Auto-launch detection result:', this.appLaunchArgs.isAutoLaunch);
    }

    setupWindowEvents() {
        // Smart window visibility based on launch context and user settings
        this.mainWindow.once('ready-to-show', () => {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            try {
                if (fs.existsSync(settingsPath)) {
                    const settingsData = fs.readFileSync(settingsPath, 'utf8');
                    const settings = JSON.parse(settingsData);

                    const hideOnLaunch = Boolean(settings.hideOnLaunch);
                    const isAutoLaunch = this.appLaunchArgs.isAutoLaunch;

                    log.info('App launch details:', {
                        hideOnLaunch,
                        isAutoLaunch,
                        argv: process.argv,
                        loginItemSettings: app.getLoginItemSettings()
                    });

                    // Hide window only for auto-launches when user has enabled the setting
                    const shouldHideWindow = hideOnLaunch && isAutoLaunch;

                    if (!shouldHideWindow) {
                        log.info('Showing window on startup (manual launch detected)');
                        // Use the enhanced focus helper for consistent Windows behavior
                        windowsFocusHelper.focusWindow(this.mainWindow);
                    } else {
                        log.info('Keeping window hidden on startup (auto-launch with hide setting enabled)');
                    }
                } else {
                    log.info('No settings file, showing window by default');
                    // Use the enhanced focus helper for consistent Windows behavior
                    windowsFocusHelper.focusWindow(this.mainWindow);
                }
            } catch (err) {
                log.error('Error loading settings:', err);
                // Use the enhanced focus helper for consistent Windows behavior
                windowsFocusHelper.focusWindow(this.mainWindow);
            }
        });

        // Hide to system tray instead of closing unless app is quitting
        this.mainWindow.on('close', (event) => {
            const appLifecycle = require('../app/lifecycle');
            if (!appLifecycle.isQuittingApp()) {
                event.preventDefault();
                this.mainWindow.hide();
                return false;
            }
            return true;
        });

        // Redirect external links to default browser
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url).catch(err => {
                log.error('Failed to open external link:', err);
            });
            return { action: 'deny' };
        });
    }

    getMainWindow() {
        return this.mainWindow;
    }

    showWindow() {
        if (this.mainWindow) {
            windowsFocusHelper.focusWindow(this.mainWindow);
            
            this.mainWindow.webContents.send('showApp');
        }
    }

    hideWindow() {
        if (this.mainWindow) {
            this.mainWindow.hide();
            this.mainWindow.webContents.send('hideApp');
        }
    }

    sendToWindow(channel, ...args) {
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

module.exports = new WindowManager();