// main.js - Electron main process with improved auto-launch window hiding
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const chokidar = require('chokidar');
const AutoLaunch = require('auto-launch');
const webSocketService = require('./services/ws-service');

// Initialize electron-log ONCE at the top level
const log = require('electron-log');
log.transports.file.level = 'info';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.info('App starting with args:', process.argv);
log.info('App executable path:', process.execPath);

// Globals
let mainWindow;
const fileWatchers = new Map();
const { autoUpdater } = require('electron-updater');
let tray = null;
let isQuitting = false;

// Store app launch arguments for debugging and auto-launch detection
const appLaunchArgs = {
    argv: process.argv,
    startMinimized: process.argv.includes('--hidden') || process.argv.includes('--minimize') || process.argv.includes('/hidden'),
    isAutoLaunch: false
};

// Fix for Electron 18+ where app.getPath('appData') could return /Application Support/open-headers-app
// instead of /Application Support/Open Headers
app.setName('OpenHeaders');

// Add logging to help with debugging
function logToFile(message) {
    try {
        // Use our central log instance instead of writing directly to file
        log.info(message);
    } catch (err) {
        // Silent fail if logging fails
        console.error('Logging failed:', err);
    }
}

function setupAutoUpdater() {
    // Use the existing log object instead of creating a new one
    autoUpdater.logger = log;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = false;

    // Log important details about the app
    log.info(`App version: ${app.getVersion()}`);
    log.info(`Electron version: ${process.versions.electron}`);
    log.info(`Chrome version: ${process.versions.chrome}`);
    log.info(`Node version: ${process.versions.node}`);
    log.info(`Platform: ${process.platform}`);
    log.info(`Arch: ${process.arch}`);

    // Force updates in development mode for testing
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        log.info('Development mode detected, forcing update checks');
        autoUpdater.forceDevUpdateConfig = true;
    }

    // Try to get and log the feed URL
    try {
        const updateURL = autoUpdater.getFeedURL();
        log.info('Initial update feed URL:', updateURL || 'Not set yet');
    } catch (e) {
        log.info('Feed URL not available yet');
    }

    // Event listeners for update process
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        try {
            const updateURL = autoUpdater.getFeedURL();
            log.info('Using update feed URL:', updateURL);
        } catch (e) {
            log.error('Error getting feed URL:', e);
        }
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info);
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available:', info);
        if (mainWindow) {
            mainWindow.webContents.send('update-not-available', info);
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
        log.info(logMessage);

        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info);
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater:', err);

        // Better logging for specific signature errors
        if (err.message.includes('code signature')) {
            log.error('Code signature validation error details:', {
                message: err.message,
                code: err.code,
                errno: err.errno
            });
        }

        if (mainWindow) {
            mainWindow.webContents.send('update-error', err.message);
        }
    });


    // Check for updates on startup (with delay to allow app to load fully)
    setTimeout(() => {
        log.info('Performing initial update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in initial update check:', err);
            });
    }, 3000);

    // Set up periodic update checks (every 6 hours)
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    setInterval(() => {
        log.info('Performing periodic update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in periodic update check:', err);
            });
    }, CHECK_INTERVAL);
}

// Enhanced auto-launch detection function
function detectAutoLaunch() {
    // Check login settings (works best on macOS)
    const loginSettings = app.getLoginItemSettings();

    // Log the detection process
    log.info('Detecting auto-launch:', {
        loginSettings,
        argv: process.argv,
        startMinimized: appLaunchArgs.startMinimized
    });

    // Check specific platform detection methods
    if (process.platform === 'darwin') {
        // macOS detection
        return loginSettings.wasOpenedAtLogin || loginSettings.wasOpenedAsHidden;
    } else if (process.platform === 'win32') {
        // Windows detection - more lenient checking
        return appLaunchArgs.startMinimized ||
            process.argv.includes('--autostart') ||
            process.execPath.toLowerCase().includes('\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\startup') ||
            loginSettings.wasOpenedAtLogin;
    } else {
        // Linux detection - check for common autostart arguments
        return appLaunchArgs.startMinimized ||
            process.argv.includes('--autostart') ||
            process.argv.some(arg => arg.includes('autostart')) ||
            loginSettings.wasOpenedAtLogin;
    }
}

// Handle dock visibility early for macOS
if (process.platform === 'darwin') {
    log.info('Checking early dock visibility settings');
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');

    try {
        if (fs.existsSync(settingsPath)) {
            const settingsData = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);

            // Set dock visibility based on settings
            if (settings.showDockIcon === false) {
                log.info('Hiding dock icon at startup based on settings');
                app.dock.hide();
            } else if (settings.showDockIcon === true && !app.dock.isVisible()) {
                log.info('Showing dock icon at startup based on settings');
                app.dock.show();
            }
        }
    } catch (err) {
        log.error('Error applying early dock visibility settings:', err);
        // Default to showing dock icon on error
    }
}

// Create the browser window
function createWindow() {
    // CRUCIAL CHANGE: Always create window hidden first, then decide to show it later
    mainWindow = new BrowserWindow({
        width: 1050,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        },
        show: false // IMPORTANT: Always start hidden regardless of settings
    });

    // Set CSP header
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
                ]
            }
        });
    });

    // Detect auto-launch
    appLaunchArgs.isAutoLaunch = detectAutoLaunch();
    log.info('Auto-launch detection result:', appLaunchArgs.isAutoLaunch);

    // Show window when it's ready to avoid flashing
    mainWindow.once('ready-to-show', () => {
        // Check settings for auto-hide
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        try {
            if (fs.existsSync(settingsPath)) {
                const settingsData = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);

                // IMPORTANT: Make sure hideOnLaunch is properly boolean-typed
                const hideOnLaunch = Boolean(settings.hideOnLaunch);
                const isAutoLaunch = appLaunchArgs.isAutoLaunch;

                log.info('App launch details:', {
                    hideOnLaunch: hideOnLaunch,
                    isAutoLaunch: isAutoLaunch,
                    argv: process.argv,
                    loginItemSettings: app.getLoginItemSettings()
                });

                // Only hide window if both hideOnLaunch is enabled AND this is an auto-launch
                const shouldHideWindow = hideOnLaunch && isAutoLaunch;

                if (!shouldHideWindow) {
                    log.info('Showing window on startup (manual launch detected)');
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    log.info('Keeping window hidden on startup (auto-launch with hide setting enabled)');
                    // The window is already hidden (show: false in BrowserWindow constructor)
                }
            } else {
                // No settings file exists, show by default
                log.info('No settings file, showing window by default');
                mainWindow.show();
            }
        } catch (err) {
            log.error('Error loading settings:', err);
            // Show window on error as fallback
            mainWindow.show();
        }
    });

    // Load the frontend
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Handle window close
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
        return true;
    });

    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Debug only: open DevTools in development mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// Create the tray icon and associated context menu
function createTray() {
    // Don't create tray if it already exists
    if (tray) return;

    // Load the settings
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let settings = {
        showStatusBarIcon: true, // Default to true
        showDockIcon: true
    };

    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            const loadedSettings = JSON.parse(data);
            settings = { ...settings, ...loadedSettings };
        }
    } catch (err) {
        log.error('Error loading settings for tray:', err);
    }

    // Check if the tray should be shown
    if (!settings.showStatusBarIcon) return;

    // Determine correct icon path based on platform and app packaging
    let iconPath;

    try {
        // Define possible icon locations in order of priority
        const iconLocations = [];

        // Based on webpack.config.js and package.json, images are copied to specific locations
        if (app.isPackaged) {
            // For packaged app, check extraResources and asarUnpack locations first
            iconLocations.push(
                // From asarUnpack in package.json
                path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'src', 'renderer', 'images', 'icon32.png'),
                path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'src', 'renderer', 'images', 'icon16.png'),
                // From extraResources in package.json
                path.join(process.resourcesPath, 'build', 'icon32.png'),
                path.join(process.resourcesPath, 'build', 'icon16.png'),
                // From webpack copy to dist-webpack
                path.join(app.getAppPath(), 'renderer', 'images', 'icon32.png'),
                path.join(app.getAppPath(), 'renderer', 'images', 'icon16.png')
            );
        } else {
            // For development
            iconLocations.push(
                // From src directory
                path.join(__dirname, '..', 'src', 'renderer', 'images', 'icon32.png'),
                path.join(__dirname, '..', 'src', 'renderer', 'images', 'icon16.png'),
                // From webpack output
                path.join(__dirname, 'renderer', 'images', 'icon32.png'),
                path.join(__dirname, 'renderer', 'images', 'icon16.png')
            );
        }

        // Add fallback locations for both dev and prod
        iconLocations.push(
            path.join(app.getAppPath(), '..', 'build', 'icon32.png'),
            path.join(app.getAppPath(), '..', 'build', 'icon16.png'),
            path.join(app.getAppPath(), '..', 'build', 'icon.png')
        );

        // Find the first icon that exists
        for (const location of iconLocations) {
            log.info('Checking icon at:', location);
            if (fs.existsSync(location)) {
                iconPath = location;
                log.info('Found tray icon at:', iconPath);
                break;
            }
        }

        if (!iconPath) {
            log.warn('No suitable icon found, using fallback path');
            iconPath = path.join(app.getAppPath(), '..', 'build', 'icon16.png');
        }
    } catch (error) {
        log.error('Error determining tray icon path:', error);
        iconPath = path.join(app.getAppPath(), '..', 'build', 'icon.png');
    }

    log.info('Using tray icon path:', iconPath);

    try {
        // Create a native image from the icon with proper resizing
        const { nativeImage } = require('electron');
        let trayIcon = nativeImage.createFromPath(iconPath);

        // Resize properly for the platform
        let resizedIcon;
        if (process.platform === 'darwin') {
            // macOS typically needs 16x16 for menu bar
            resizedIcon = trayIcon.resize({ width: 16, height: 16 });
            // For Retina displays
            if (trayIcon.getSize().width >= 32) {
                resizedIcon.setTemplateImage(true);
            }
        } else if (process.platform === 'win32') {
            // Windows typically looks better with 16x16 tray icons
            resizedIcon = trayIcon.resize({ width: 16, height: 16 });
        } else {
            // Linux - also use 16x16
            resizedIcon = trayIcon.resize({ width: 16, height: 16 });
        }

        // Create the tray with the properly sized icon
        tray = new Tray(resizedIcon);

        // Set proper tooltip
        tray.setToolTip('Open Headers');

        // Create context menu
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show Open Headers',
                click: () => {
                    if (mainWindow) {
                        if (mainWindow.isMinimized()) mainWindow.restore();
                        mainWindow.show();
                        mainWindow.focus();
                        mainWindow.webContents.send('showApp');
                    }
                }
            },
            {
                label: 'Hide Open Headers',
                click: () => {
                    if (mainWindow) {
                        mainWindow.hide();
                        mainWindow.webContents.send('hideApp');
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true;
                    if (mainWindow) mainWindow.webContents.send('quitApp');
                    app.quit();
                }
            }
        ]);

        // Set the context menu
        tray.setContextMenu(contextMenu);

        // MODIFIED: On macOS, only show context menu on click
        if (process.platform === 'darwin') {
            // Just let the default behavior show the context menu
            // No direct click handler to show the window
            log.info('macOS tray setup: clicking will only show the menu');
        } else {
            // For Windows and Linux, show app on double-click
            tray.on('double-click', () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    if (!mainWindow.isVisible()) mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('showApp');
                }
            });
        }

        log.info('Tray icon created successfully');
    } catch (error) {
        log.error('Failed to create tray icon:', error);
        // Create a fallback tray with empty icon as last resort
        try {
            const emptyIcon = require('electron').nativeImage.createEmpty();
            tray = new Tray(emptyIcon);
            tray.setToolTip('Open Headers');

            // Set basic context menu for fallback
            const basicMenu = Menu.buildFromTemplate([
                {
                    label: 'Show App',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    }
                },
                {
                    label: 'Quit',
                    click: () => {
                        isQuitting = true;
                        app.quit();
                    }
                }
            ]);
            tray.setContextMenu(basicMenu);
        } catch (fallbackError) {
            log.error('Failed to create basic tray icon:', fallbackError);
        }
    }
}

function updateTray(settings) {
    if (!settings) return;

    log.info('Updating tray with settings:', settings.showStatusBarIcon, 'and dock:', settings.showDockIcon);

    // PART 1: Handle status bar icon (tray)
    // -----------------------------------------
    // If tray exists but should be hidden, destroy it
    if (tray && !settings.showStatusBarIcon) {
        tray.destroy();
        tray = null;
        log.info('Status bar icon destroyed');
    }

    // If tray doesn't exist but should be shown, create it
    if (!tray && settings.showStatusBarIcon) {
        createTray();
        log.info('Status bar icon created');
    }

    // PART 2: Handle dock icon on macOS (separate from tray handling)
    // --------------------------------------------------------------
    // Store whether the window was visible before updating dock
    const wasWindowVisible = mainWindow && mainWindow.isVisible();

    // Update dock visibility on macOS
    if (process.platform === 'darwin') {
        if (settings.showDockIcon && !app.dock.isVisible()) {
            log.info('Showing dock icon');
            app.dock.show();
        } else if (!settings.showDockIcon && app.dock.isVisible()) {
            log.info('Hiding dock icon');
            app.dock.hide();

            // Critical fix: Ensure window stays visible after hiding dock icon
            if (mainWindow && wasWindowVisible) {
                // Small delay to let the dock hide operation complete
                setTimeout(() => {
                    if (mainWindow) {
                        // Show and focus the window to bring it to front
                        mainWindow.show();
                        mainWindow.focus();
                        log.info('Restoring window visibility after hiding dock icon');
                    }
                }, 100);
            }
        }
    }
}

function initializeWebSocket() {
    log.info('Initializing WebSocket service with both WS and WSS support...');

    // Initialize with both WS and WSS support
    webSocketService.initialize({
        wsPort: 59210,   // Regular WebSocket port
        wssPort: 59211   // Secure WebSocket port for Firefox
    });

    log.info('WebSocket services initialized on ports 59210 (WS) and 59211 (WSS)');
}

// App is ready
app.whenReady().then(() => {
    // Log app startup information to help with debugging
    log.info(`App started at ${new Date().toISOString()}`);
    log.info(`Process argv: ${JSON.stringify(process.argv)}`);
    log.info(`App version: ${app.getVersion()}`);
    log.info(`Platform: ${process.platform}`);
    log.info(`Executable path: ${process.execPath}`);

    createWindow();
    createTray();

    // Initialize WebSocket service
    initializeWebSocket();

    setupIPC();

    // Set up auto-updater
    setupAutoUpdater();

    // Handle macOS dock icon clicks
    app.on('activate', () => {
        // If there are no windows, create a new one
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        // If window exists but is hidden or minimized, show and focus it
        else if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            if (!mainWindow.isVisible()) {
                mainWindow.show();
            }
            mainWindow.focus();
            // Notify the renderer process
            mainWindow.webContents.send('showApp');
            log.info('Window restored after dock icon click');
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle app quit
app.on('before-quit', () => {
    isQuitting = true;

    // Clean up file watchers
    for (const watcher of fileWatchers.values()) {
        watcher.close();
    }

    // Close WebSocket server if initialized
    if (webSocketService) {
        webSocketService.close();
    }
});

// Set up IPC communication channels
function setupIPC() {
    // File operations
    ipcMain.handle('openFileDialog', handleOpenFileDialog);
    ipcMain.handle('saveFileDialog', handleSaveFileDialog);
    ipcMain.handle('readFile', handleReadFile);
    ipcMain.handle('writeFile', handleWriteFile);
    ipcMain.handle('watchFile', handleWatchFile);
    ipcMain.handle('unwatchFile', handleUnwatchFile);

    ipcMain.on('updateWebSocketSources', (event, sources) => {
        // Initialize WebSocket if needed (lazy loading)
        if (!webSocketService) {
            initializeWebSocket();
        }
        webSocketService.updateSources(sources);
    });

    // Add update-related IPC handlers
    ipcMain.on('check-for-updates', (event) => {
        log.info('Manual update check requested');
        try {
            autoUpdater.checkForUpdates();
        } catch (err) {
            log.error('Error checking for updates:', err);
            event.reply('update-error', err.message);
        }
    });

    // And for install handler:
    ipcMain.on('install-update', () => {
        log.info('Update installation requested');
        try {
            // Force application to close and install the update
            // Parameters: isSilent (false = show dialog), isForceRunAfter (true = restart app after update)
            autoUpdater.quitAndInstall(false, true);
        } catch (error) {
            log.error('Failed to install update:', error);
            // Try fallback approach if the standard method fails
            try {
                log.info('Attempting fallback update installation method');
                // Force quit and install with different parameters
                autoUpdater.quitAndInstall();
            } catch (fallbackError) {
                log.error('Fallback installation method also failed:', fallbackError);
            }
        }
    });

    // Environment variable operations
    ipcMain.handle('getEnvVariable', handleGetEnvVariable);

    // Storage operations
    ipcMain.handle('saveToStorage', handleSaveToStorage);
    ipcMain.handle('loadFromStorage', handleLoadFromStorage);

    // HTTP operations
    ipcMain.handle('makeHttpRequest', handleMakeHttpRequest);

    // Application settings
    ipcMain.handle('getAppPath', handleGetAppPath);
    ipcMain.handle('saveSettings', handleSaveSettings);
    ipcMain.handle('getSettings', handleGetSettings);

    // System integration
    ipcMain.handle('setAutoLaunch', handleSetAutoLaunch);

    // Window management events
    ipcMain.on('showMainWindow', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('showApp');
        }
    });

    ipcMain.on('hideMainWindow', () => {
        if (mainWindow) {
            mainWindow.hide();
            mainWindow.webContents.send('hideApp');
        }
    });

    ipcMain.on('quitApp', () => {
        isQuitting = true;
        if (mainWindow) mainWindow.webContents.send('quitApp');
        app.quit();
    });

    ipcMain.handle('getAppVersion', () => {
        return app.getVersion();
    });

    ipcMain.handle('openExternal', async (_, url) => {
        try {
            // Validate URL to prevent security issues
            const validUrl = new URL(url);
            // Only allow https links to trusted domains
            if (validUrl.protocol !== 'https:') {
                log.warn(`Blocked attempt to open non-HTTPS URL: ${url}`);
                return { success: false, error: 'Only HTTPS URLs are allowed' };
            }

            // Allow GitHub, Chrome Web Store, Microsoft Edge Add-ons, and Mozilla Add-ons
            const allowedDomains = [
                'github.com',
                'chromewebstore.google.com',
                'microsoftedge.microsoft.com',
                'addons.mozilla.org'
            ];

            const isAllowed = allowedDomains.some(domain =>
                validUrl.hostname === domain || validUrl.hostname.endsWith(`.${domain}`)
            );

            if (!isAllowed) {
                log.warn(`Blocked attempt to open URL to untrusted domain: ${validUrl.hostname}`);
                return { success: false, error: 'Only trusted domains are allowed' };
            }

            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            log.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });
}

// IPC Handlers - use log for all errors
async function handleOpenFileDialog() {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile']
        });
        return result.canceled ? null : result.filePaths[0];
    } catch (error) {
        log.error('Error in open file dialog:', error);
        throw error;
    }
}

async function handleSaveFileDialog(_, options = {}) {
    try {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result.canceled ? null : result.filePath;
    } catch (error) {
        log.error('Error in save file dialog:', error);
        throw error;
    }
}

async function handleReadFile(_, filePath) {
    try {
        return fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        log.error('Error reading file:', error);
        throw error;
    }
}

async function handleWriteFile(_, filePath, content) {
    try {
        return fs.promises.writeFile(filePath, content, 'utf8');
    } catch (error) {
        log.error('Error writing file:', error);
        throw error;
    }
}

async function handleWatchFile(_, sourceId, filePath) {
    try {
        // Read file initially
        const content = await fs.promises.readFile(filePath, 'utf8');

        // Set up watcher if not already watching
        if (!fileWatchers.has(filePath)) {
            const watcher = chokidar.watch(filePath, {
                persistent: true,
                usePolling: true,
                interval: 300
            });

            watcher.on('change', async (changedPath) => {
                try {
                    const newContent = await fs.promises.readFile(changedPath, 'utf8');
                    if (mainWindow) {
                        mainWindow.webContents.send('fileChanged', sourceId, newContent);
                    }
                } catch (err) {
                    log.error('Error reading changed file:', err);
                }
            });

            fileWatchers.set(filePath, watcher);
            log.info(`File watch set up for ${filePath}`);
        }

        return content;
    } catch (err) {
        log.error('Error setting up file watch:', err);
        throw err;
    }
}

async function handleUnwatchFile(_, filePath) {
    try {
        if (fileWatchers.has(filePath)) {
            const watcher = fileWatchers.get(filePath);
            await watcher.close();
            fileWatchers.delete(filePath);
            log.info(`File watch removed for ${filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        log.error('Error unwatching file:', error);
        throw error;
    }
}

function handleGetEnvVariable(_, name) {
    try {
        return process.env[name] || `Environment variable '${name}' is not set`;
    } catch (error) {
        log.error('Error getting environment variable:', error);
        throw error;
    }
}

async function handleSaveToStorage(_, filename, content) {
    try {
        const storagePath = path.join(app.getPath('userData'), filename);
        log.info(`Saving to storage: ${storagePath}`);
        return fs.promises.writeFile(storagePath, content, 'utf8');
    } catch (error) {
        log.error('Error saving to storage:', error);
        throw error;
    }
}

async function handleLoadFromStorage(_, filename) {
    try {
        const storagePath = path.join(app.getPath('userData'), filename);
        log.info(`Loading from storage: ${storagePath}`);
        return await fs.promises.readFile(storagePath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info(`Storage file not found: ${filename}`);
            return null; // File doesn't exist yet
        }
        log.error('Error loading from storage:', err);
        throw err;
    }
}

function handleGetAppPath() {
    return app.getPath('userData');
}

async function handleMakeHttpRequest(_, url, method, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            // Process URL and query parameters
            const parsedUrl = new URL(url);

            // Add query parameters
            if (options.queryParams) {
                Object.entries(options.queryParams).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        parsedUrl.searchParams.append(key, value);
                    }
                });
            }

            // Prepare request options
            const requestOptions = {
                method: method || 'GET',
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                headers: {
                    'User-Agent': 'OpenHeaders/1.0',
                    ...options.headers
                },
                timeout: 10000 // 10 seconds timeout
            };

            // Prepare request body if needed
            let requestBody = null;
            if (['POST', 'PUT', 'PATCH'].includes(method) && options.body) {
                if (options.contentType === 'application/json') {
                    requestBody = JSON.stringify(options.body);
                    requestOptions.headers['Content-Type'] = 'application/json';
                } else if (options.contentType === 'application/x-www-form-urlencoded') {
                    requestBody = querystring.stringify(options.body);
                    requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }

                if (requestBody) {
                    requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
                }
            }

            log.debug(`Making HTTP ${method} request to ${url}`);

            // Make the request
            const requester = parsedUrl.protocol === 'https:' ? https : http;
            const req = requester.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        // Create headers object from the raw headers to preserve case
                        const preservedHeaders = {};
                        const rawHeaders = res.rawHeaders;

                        // rawHeaders is an array with alternating key, value pairs
                        for (let i = 0; i < rawHeaders.length; i += 2) {
                            const headerName = rawHeaders[i];
                            const headerValue = rawHeaders[i + 1];
                            preservedHeaders[headerName] = headerValue;
                        }

                        // Format response
                        const response = {
                            statusCode: res.statusCode,
                            headers: preservedHeaders,
                            body: data
                        };

                        log.debug(`HTTP response received: ${res.statusCode}`);
                        resolve(JSON.stringify(response));
                    } catch (err) {
                        log.error('Failed to process response:', err);
                        reject(new Error(`Failed to process response: ${err.message}`));
                    }
                });
            });

            // Handle errors
            req.on('error', (error) => {
                log.error('HTTP request error:', error);
                reject(error);
            });

            // Handle timeout
            req.on('timeout', () => {
                req.destroy();
                log.error(`Request timed out after ${requestOptions.timeout}ms`);
                reject(new Error(`Request timed out after ${requestOptions.timeout}ms`));
            });

            // Send body if present
            if (requestBody) {
                req.write(requestBody);
            }

            req.end();
        } catch (error) {
            log.error('Error making HTTP request:', error);
            reject(error);
        }
    });
}

async function handleSaveSettings(_, settings) {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');

        // Log the settings being saved
        log.info(`Saving settings: ${JSON.stringify(settings)}`);

        // Important: Ensure hideOnLaunch is properly boolean-typed
        if (settings.hasOwnProperty('hideOnLaunch')) {
            settings.hideOnLaunch = Boolean(settings.hideOnLaunch);
            log.info(`Normalized hideOnLaunch setting to: ${settings.hideOnLaunch}`);
        }

        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Apply settings
        updateTray(settings);

        return { success: true };
    } catch (err) {
        log.error('Error saving settings:', err);
        return { success: false, message: err.message };
    }
}

async function handleGetSettings() {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const data = await fs.promises.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(data);

            // Log the retrieved settings
            log.info(`Retrieved settings: ${JSON.stringify(settings)}`);

            return settings;
        } else {
            // Default settings
            const defaultSettings = {
                launchAtLogin: false,
                hideOnLaunch: false,
                showDockIcon: true,
                showStatusBarIcon: true
            };

            // Create settings file
            await fs.promises.writeFile(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
            log.info('Created default settings file');
            return defaultSettings;
        }
    } catch (err) {
        log.error('Error getting settings:', err);
        throw err;
    }
}

async function handleSetAutoLaunch(_, enable) {
    try {
        // Platform-specific args configuration
        let args = ['--hidden']; // Default for all platforms

        // Add platform-specific args
        if (process.platform === 'win32') {
            args = ['--hidden', '--autostart']; // Windows needs more flags
        } else if (process.platform === 'linux') {
            args = ['--hidden', '--autostart']; // Linux needs more flags
        }

        // Log auto-launch configuration
        log.info(`Setting auto-launch to: ${enable} with args: ${args.join(' ')}`);

        const autoLauncher = new AutoLaunch({
            name: 'OpenHeaders',
            path: app.getPath('exe'),
            args: args,
            isHidden: true // Important for Windows
        });

        if (enable) {
            await autoLauncher.enable();
            log.info(`Auto launch enabled with args: ${args.join(' ')}`);
        } else {
            await autoLauncher.disable();
            log.info('Auto launch disabled');
        }

        return { success: true };
    } catch (err) {
        log.error('Error setting auto launch:', err);
        return { success: false, message: err.message };
    }
}

module.exports = { app, mainWindow };