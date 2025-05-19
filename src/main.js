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
let updateCheckInProgress = false;
let updateDownloadInProgress = false;
let updateDownloaded = false;

// Store app launch arguments for debugging and auto-launch detection
const appLaunchArgs = {
    argv: process.argv,
    startMinimized: process.argv.includes('--hidden') || process.argv.includes('--minimize') || process.argv.includes('/hidden'),
    isAutoLaunch: false
};

// Fix for Electron 18+ where app.getPath('appData') could return /Application Support/open-headers-app
// instead of /Application Support/Open Headers
app.setName('OpenHeaders');
// Enable use of system certificate store
// This doesn't affect the WSS server which uses its own certificates
app.commandLine.appendSwitch('use-system-ca-store');

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
    // Define state tracking variables for update process
    global.updateCheckInProgress = false;
    global.updateDownloadInProgress = false;
    global.updateDownloaded = false;

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

    log.info(`[DEBUG] Initial update states:
      updateCheckInProgress = ${global.updateCheckInProgress}
      updateDownloadInProgress = ${global.updateDownloadInProgress}
      updateDownloaded = ${global.updateDownloaded}`);

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

    // Network error retry configuration
    let networkErrorRetryTimer = null;
    const NETWORK_RETRY_INTERVAL = 15 * 60 * 1000; // 15 minutes

    // Event listeners for update process
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        try {
            const updateURL = autoUpdater.getFeedURL();
            log.info('Using update feed URL:', updateURL);
        } catch (e) {
            log.error('Error getting feed URL:', e);
        }

        // Set the checking state
        global.updateCheckInProgress = true;
        log.info(`[DEBUG] Set updateCheckInProgress = true`);
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`[DEBUG] Update available: version=${info.version}, tag=${info.tag}`);
        // We're now checking and downloading
        global.updateCheckInProgress = false;
        global.updateDownloadInProgress = true;
        log.info(`[DEBUG] Set updateCheckInProgress = false, updateDownloadInProgress = true`);

        if (mainWindow) {
            log.info(`[DEBUG] Sending update-available event to renderer`);
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info(`[DEBUG] Update not available, current version up to date`);
        // Reset checking state
        global.updateCheckInProgress = false;
        log.info(`[DEBUG] Set updateCheckInProgress = false`);

        if (mainWindow) {
            log.info(`[DEBUG] Sending update-not-available event to renderer`);
            mainWindow.webContents.send('update-not-available', info);

            // Also send a clear notification event as a safeguard
            log.info('[DEBUG] Sending clear-update-checking-notification event to renderer');
            mainWindow.webContents.send('clear-update-checking-notification');
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
        log.info(logMessage);

        // Ensure download state is set
        global.updateDownloadInProgress = true;

        // Every 10% progress, log a debug message
        if (Math.round(progressObj.percent) % 10 === 0) {
            log.info(`[DEBUG] Download progress at ${Math.round(progressObj.percent)}%`);
        }

        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('[DEBUG] Update downloaded, marking as ready to install');
        log.info(`[DEBUG] Downloaded version: ${info.version}, tag: ${info.tag}, path: ${info.path}`);

        // Update is downloaded and ready to install
        global.updateDownloadInProgress = false;
        global.updateDownloaded = true;
        log.info(`[DEBUG] Set updateDownloadInProgress = false, updateDownloaded = true`);

        if (mainWindow) {
            log.info(`[DEBUG] Sending update-downloaded event to renderer`);
            mainWindow.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater:', err);
        log.info(`[DEBUG] Auto-updater error: ${err.message}`);

        // Reset all states on error
        global.updateCheckInProgress = false;
        global.updateDownloadInProgress = false;
        log.info(`[DEBUG] Reset update states due to error`);

        // Always send clear notification event on error
        if (mainWindow) {
            log.info('[DEBUG] Sending clear-update-checking-notification event to renderer');
            mainWindow.webContents.send('clear-update-checking-notification');
        }

        // Handle network errors with a shorter retry time
        const isNetworkError = err.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
            err.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
            err.message.includes('net::ERR_CONNECTION_REFUSED');

        if (isNetworkError) {
            log.info(`[DEBUG] Network error during update check, will retry in 15 minutes`);

            // Clear any existing retry timer
            if (networkErrorRetryTimer) {
                clearTimeout(networkErrorRetryTimer);
            }

            // Set a shorter retry timer for network errors (15 minutes)
            networkErrorRetryTimer = setTimeout(() => {
                if (!global.updateCheckInProgress && !global.updateDownloadInProgress) {
                    log.info('[DEBUG] Retrying update check after network error...');
                    autoUpdater.checkForUpdates();
                }
                networkErrorRetryTimer = null;
            }, NETWORK_RETRY_INTERVAL);

            // Also destroy any existing checking notification
            if (mainWindow) {
                mainWindow.webContents.send('clear-update-checking-notification');
            }
        }

        // Only send non-network errors to renderer
        if (!isNetworkError && mainWindow) {
            log.info(`[DEBUG] Sending update-error event to renderer`);
            mainWindow.webContents.send('update-error', err.message);
        }

        // Better logging for specific signature errors
        if (err.message.includes('code signature')) {
            log.error('Code signature validation error details:', {
                message: err.message,
                code: err.code,
                errno: err.errno
            });
        }
    });

    // Check for updates on startup (with delay to allow app to load fully)
    setTimeout(() => {
        log.info('[DEBUG] Performing initial update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in initial update check:', err);
                log.info(`[DEBUG] Initial update check failed: ${err.message}`);
            });
    }, 3000);

    // Set up periodic update checks (every 6 hours)
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    setInterval(() => {
        // Check if we're already in the process of checking for updates
        if (global.updateCheckInProgress || global.updateDownloadInProgress) {
            log.info('[DEBUG] Skipping periodic update check - another check/download already in progress');
            return;
        }

        log.info('[DEBUG] Performing periodic update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in periodic update check:', err);
                log.info(`[DEBUG] Periodic update check failed: ${err.message}`);

                // Even if the check fails, we'll try again at the next interval
                // No need to show error to user for routine background checks
                global.updateCheckInProgress = false;
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
function updateTray(settings) {
    if (!settings) return;

    // Explicitly convert to boolean values to avoid type coercion issues
    const showStatusBarIcon = Boolean(settings.showStatusBarIcon);
    const showDockIcon = Boolean(settings.showDockIcon);

    log.info('Updating tray with settings:',
        'showStatusBarIcon =', showStatusBarIcon,
        'showDockIcon =', showDockIcon);

    // PART 1: Handle status bar icon (tray)
    // -----------------------------------------
    // If tray exists but should be hidden, destroy it
    if (tray && !showStatusBarIcon) {
        try {
            tray.destroy();
            tray = null;
            log.info('Status bar icon destroyed');
        } catch (error) {
            log.error('Error destroying tray:', error);
            // Try to force cleanup
            tray = null;
        }
    }

    // If tray doesn't exist but should be shown, create it
    if (!tray && showStatusBarIcon) {
        try {
            createTray();
            log.info('Status bar icon created');
        } catch (error) {
            log.error('Error creating tray:', error);
        }
    }

    // PART 2: Handle dock icon on macOS (separate from tray handling)
    // --------------------------------------------------------------
    // Store whether the window was visible before updating dock
    const wasWindowVisible = mainWindow && mainWindow.isVisible();

    // Update dock visibility on macOS
    if (process.platform === 'darwin') {
        if (showDockIcon && !app.dock.isVisible()) {
            log.info('Showing dock icon');
            app.dock.show();
        } else if (!showDockIcon && app.dock.isVisible()) {
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

function createTray() {
    // Don't create tray if it already exists
    if (tray) return;

    try {
        // Create a native image from the icon with proper resizing
        const { nativeImage } = require('electron');
        let trayIcon = null;

        // Define possible icon locations in priority order specifically for macOS Resources directory
        const iconLocations = [
            // First check icon files we know exist from your paste.txt
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon128.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon.png'),
            path.join(process.resourcesPath, 'icon128.png'),
            path.join(process.resourcesPath, 'icon.png'),

            // Then check in images subdirectory
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon16.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon32.png'),
            path.join(process.resourcesPath, 'images', 'icon16.png'),
            path.join(process.resourcesPath, 'images', 'icon32.png'),

            // Add any other possible locations
            path.join(app.getAppPath(), 'renderer', 'images', 'icon16.png'),
            path.join(__dirname, 'renderer', 'images', 'icon16.png')
        ];

        // Try each location in order
        for (const location of iconLocations) {
            log.info('Checking icon at:', location);
            if (fs.existsSync(location)) {
                trayIcon = nativeImage.createFromPath(location);
                log.info('Found tray icon at:', location);
                break;
            }
        }

        // If no icon found, create a basic icon as fallback
        if (!trayIcon) {
            log.warn('No icon file found, creating basic icon');

            // Create a minimal 16x16 template icon for macOS
            // This is a simple square icon data URL that will work as a tray icon
            const iconDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAADxJREFUOBFjYBgFAx0BRkZGRkZLS8v/UH4DA8EAZGZlZP7/r6SkBNeHywBCimEuIKSYKAOIUjwaDcQlIQBu+xIQiOn5+QAAAABJRU5ErkJggg==';

            trayIcon = nativeImage.createFromDataURL(iconDataURL);

            // For macOS, make it a template icon
            if (process.platform === 'darwin') {
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
                trayIcon.setTemplateImage(true);
            }
        } else {
            // Resize properly for the platform
            if (process.platform === 'darwin') {
                // For macOS, resize to 16x16 and make it a template icon
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
                trayIcon.setTemplateImage(true);
            } else if (process.platform === 'win32') {
                // Windows typically looks better with 16x16 tray icons
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
            } else {
                // Linux - also use 16x16
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
            }
        }

        // Create the tray with the icon
        tray = new Tray(trayIcon);

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

        // Platform-specific behavior
        if (process.platform === 'darwin') {
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
            log.info('Created fallback tray with empty icon');
        } catch (fallbackError) {
            log.error('Failed to create basic tray icon:', fallbackError);
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
app.whenReady().then(async () => {
    // Log app startup information to help with debugging
    log.info(`App started at ${new Date().toISOString()}`);
    log.info(`Process argv: ${JSON.stringify(process.argv)}`);
    log.info(`App version: ${app.getVersion()}`);
    log.info(`Platform: ${process.platform}`);
    log.info(`Executable path: ${process.execPath}`);

    // Setup first run configuration - added for default auto-launch and hide
    await setupFirstRun();

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

// Add this new function to handle first run setup
async function setupFirstRun() {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        const isFirstRun = !fs.existsSync(settingsPath);

        if (isFirstRun) {
            log.info('First run detected, creating default settings with auto-launch enabled');

            // Create default settings with auto-launch and hide on start enabled
            const defaultSettings = {
                launchAtLogin: true,
                hideOnLaunch: true,
                showDockIcon: true,
                showStatusBarIcon: true
            };

            // Save default settings
            await fs.promises.writeFile(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
            log.info('Created default settings file with auto-launch and hide enabled');

            // Set up auto-launch for the application
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
                // Continue application startup even if auto-launch setup fails
            }

            // Flag for the createWindow function to know this is first run
            // but don't keep the window hidden on the very first run
            global.isFirstRun = true;
        }
    } catch (err) {
        log.error('Error during first run setup:', err);
        // Continue with startup even if there was an error
    }
}

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
    ipcMain.on('check-for-updates', (event, isManual) => {
        log.info(`[DEBUG] ${isManual ? 'Manual' : 'Automatic'} update check requested via IPC`);
        log.info(`[DEBUG] Current states: 
      updateCheckInProgress = ${global.updateCheckInProgress}
      updateDownloadInProgress = ${global.updateDownloadInProgress}
      updateDownloaded = ${global.updateDownloaded}`);

        // First check if an update is already downloaded and ready
        if (global.updateDownloaded) {
            log.info('[DEBUG] Update already downloaded, notifying client to show install prompt');
            if (mainWindow) {
                // Check if this was a manual check (passed from renderer)
                const isManualCheck = event.sender === mainWindow.webContents;

                // Send event with a flag indicating it was a manual check
                mainWindow.webContents.send('update-already-downloaded', {
                    isManual: isManualCheck
                });
            }
            return;
        }

        // Skip if already checking or downloading
        if (global.updateCheckInProgress || global.updateDownloadInProgress) {
            log.info(`[DEBUG] Update check/download already in progress, skipping duplicate request
          updateCheckInProgress=${global.updateCheckInProgress}, 
          updateDownloadInProgress=${global.updateDownloadInProgress}`);

            // Notify renderer that we're already checking
            if (mainWindow) {
                log.info('[DEBUG] Sending update-check-already-in-progress event to renderer');
                mainWindow.webContents.send('update-check-already-in-progress');
            }
            return;
        }

        global.updateCheckInProgress = true;
        log.info('[DEBUG] Set updateCheckInProgress = true');

        try {
            log.info('[DEBUG] Calling autoUpdater.checkForUpdates()');
            autoUpdater.checkForUpdates()
                .then(() => {
                    log.info('[DEBUG] autoUpdater.checkForUpdates() completed successfully');
                })
                .catch(error => {
                    log.error('[DEBUG] autoUpdater.checkForUpdates() failed:', error);

                    // IMPORTANT: Reset check state on error and notify client
                    log.info('[DEBUG] Resetting updateCheckInProgress = false due to error');
                    global.updateCheckInProgress = false;

                    // Send clear notification event
                    if (mainWindow) {
                        log.info('[DEBUG] Sending clear-update-checking-notification event to renderer');
                        mainWindow.webContents.send('clear-update-checking-notification');
                    }

                    // Send error event if it was a manual check
                    if (isManual && mainWindow) {
                        log.info('[DEBUG] Sending update-error event to renderer');
                        mainWindow.webContents.send('update-error', error.message || 'Update check failed');
                    }
                })
                .finally(() => {
                    // Reset flag when check is complete (successful or not)
                    setTimeout(() => {
                        log.info('[DEBUG] Checking if updateCheckInProgress needs reset');
                        if (global.updateCheckInProgress) {
                            global.updateCheckInProgress = false;
                            log.info('[DEBUG] Reset updateCheckInProgress = false after timeout');

                            // Also send clear notification event as a safeguard
                            if (mainWindow) {
                                log.info('[DEBUG] Sending clear-update-checking-notification event to renderer');
                                mainWindow.webContents.send('clear-update-checking-notification');
                            }
                        }
                    }, 10000); // 10 second timeout as a failsafe
                });
        } catch (err) {
            global.updateCheckInProgress = false;
            log.error('[DEBUG] Error calling checkForUpdates:', err);

            // Send clear notification event
            if (mainWindow) {
                log.info('[DEBUG] Sending clear-update-checking-notification event to renderer');
                mainWindow.webContents.send('clear-update-checking-notification');
            }

            if (isManual) {
                event.reply('update-error', err.message);
            }
        }
    });

    // And for install handler:
    ipcMain.on('install-update', () => {
        log.info('[DEBUG] Update installation requested with force');
        isQuitting = true; // Set to true to allow the app to close
        global.updateDownloaded = false; // Reset the state
        log.info('[DEBUG] Set isQuitting = true, updateDownloaded = false');

        try {
            // Signal that we want to restart after update
            autoUpdater.autoInstallOnAppQuit = true;
            log.info('[DEBUG] Set autoUpdater.autoInstallOnAppQuit = true');

            // Force quit with updated options
            log.info('[DEBUG] Calling autoUpdater.quitAndInstall(false, true)');
            autoUpdater.quitAndInstall(false, true);

            // Backup approach: If autoUpdater's quitAndInstall doesn't work,
            // force the app to quit after a short delay
            setTimeout(() => {
                log.info('[DEBUG] Forcing application quit for update...');
                app.exit(0);
            }, 1000);
        } catch (error) {
            log.error('[DEBUG] Failed to install update:', error);
            global.updateDownloaded = true; // Reset back since install failed
            log.info('[DEBUG] Reset updateDownloaded = true due to install failure');

            // Show error dialog
            if (mainWindow) {
                log.info('[DEBUG] Showing error dialog for failed update installation');
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: 'Update Error',
                    message: 'Failed to install update',
                    detail: error.message || 'Unknown error',
                    buttons: ['OK']
                });
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
    // Configure enhanced retry parameters
    const MAX_RETRIES = 4;  // Increased from 2 to 4 maximum retries
    const INITIAL_RETRY_DELAY = 1000;  // Increased initial delay to 1 second
    const MAX_RETRY_DELAY = 10000;  // Maximum delay of 10 seconds

    // Function to perform the actual request with exponential backoff retry logic
    const performRequest = async (retryCount = 0) => {
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

                // Get requestId from options if available, or generate a new one
                const requestId = (options.connectionOptions && options.connectionOptions.requestId) ||
                    (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

                // Prepare request options with improved defaults
                const requestOptions = {
                    method: method || 'GET',
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    headers: {
                        'User-Agent': `OpenHeaders/${app.getVersion()}`,
                        ...options.headers
                    },
                    timeout: options.connectionOptions?.timeout || 15000, // Use provided timeout or default to 15s

                    // Configure keepAlive settings if provided
                    agent: null // Will be set below
                };

                // Create a keepAlive agent (better connection handling)
                const isSecure = parsedUrl.protocol === 'https:';
                const Agent = isSecure ? require('https').Agent : require('http').Agent;

                requestOptions.agent = new Agent({
                    keepAlive: options.connectionOptions?.keepAlive !== false,
                    keepAliveMsecs: 5000,
                    maxSockets: 8,
                    timeout: options.connectionOptions?.timeout || 15000,
                    // This ensures Node.js uses the OS cert store
                    // when the use-system-ca-store switch is enabled
                    ca: undefined
                });

                // Prepare request body if needed
                let requestBody = null;
                if (['POST', 'PUT', 'PATCH'].includes(method) && options.body) {
                    // Set Content-Type header
                    if (options.contentType) {
                        requestOptions.headers['Content-Type'] = options.contentType;
                    }

                    // Determine how to handle the body based on contentType
                    if (options.contentType === 'application/x-www-form-urlencoded') {
                        requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';

                        // Process the form data based on its format
                        if (typeof options.body === 'string') {
                            // Format 1: Standard "key=value&key2=value2" format
                            if (options.body.includes('=') && options.body.includes('&')) {
                                requestBody = options.body;
                            }
                            // Format 2: Line-separated "key=value\nkey2=value2" format
                            else if (options.body.includes('=') && options.body.includes('\n')) {
                                requestBody = options.body.split('\n')
                                    .filter(line => line.trim() !== '' && line.includes('='))
                                    .join('&');
                            }
                            // Format 3 & 4: Colon-separated formats
                            else if (options.body.includes(':')) {
                                // Convert to object first
                                const formData = {};

                                // Split by lines
                                const lines = options.body.split('\n')

                                lines.forEach(line => {
                                    line = line.trim();
                                    if (line === '') return;

                                    // Handle key:"value" format (with quotes)
                                    if (line.includes(':"')) {
                                        const colonPos = line.indexOf(':');
                                        const key = line.substring(0, colonPos).trim();
                                        // Extract value between quotes
                                        const value = line.substring(colonPos + 2, line.lastIndexOf('"'));
                                        formData[key] = value;
                                    }
                                    // Handle key:value format (without quotes)
                                    else if (line.includes(':')) {
                                        const parts = line.split(':');
                                        if (parts.length >= 2) {
                                            const key = parts[0].trim();
                                            const value = parts.slice(1).join(':').trim();
                                            formData[key] = value;
                                        }
                                    }
                                });

                                // Use the querystring module to properly encode the form data
                                requestBody = querystring.stringify(formData);
                            }
                            // Any other string format - try as-is
                            else {
                                requestBody = options.body;
                            }
                        }
                        // Handle object format
                        else if (typeof options.body === 'object') {
                            requestBody = querystring.stringify(options.body);
                        }
                        // Fallback for any other type
                        else {
                            requestBody = String(options.body);
                        }
                    }
                    else if (options.contentType === 'application/json') {
                        if (typeof options.body === 'string') {
                            try {
                                // Try to parse as JSON to validate
                                JSON.parse(options.body);
                                requestBody = options.body;
                            } catch (e) {
                                // If not valid JSON, stringify it
                                requestBody = JSON.stringify(options.body);
                            }
                        } else {
                            requestBody = JSON.stringify(options.body);
                        }
                        requestOptions.headers['Content-Type'] = 'application/json';
                    }
                    else {
                        requestBody = typeof options.body === 'string'
                            ? options.body
                            : JSON.stringify(options.body);
                        requestOptions.headers['Content-Type'] = options.contentType || 'text/plain';
                    }

                    if (requestBody) {
                        requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
                    }
                }

                // Choose HTTP/HTTPS requester based on protocol
                const requester = parsedUrl.protocol === 'https:' ? https : http;

                log.info(`[${requestId}] Making HTTP ${method} request to ${parsedUrl.href} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

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

                            log.info(`[${requestId}] HTTP response received: ${res.statusCode}`);

                            // Check for server errors (5xx) that might benefit from a retry
                            if (res.statusCode >= 500 && retryCount < MAX_RETRIES) {
                                log.info(`[${requestId}] Server error ${res.statusCode} received, will retry`);

                                // Calculate delay with exponential backoff and jitter
                                const delay = Math.min(
                                    INITIAL_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                                    MAX_RETRY_DELAY
                                );

                                log.info(`[${requestId}] Retrying in ${Math.round(delay)}ms`);

                                // Wait and retry
                                setTimeout(() => {
                                    performRequest(retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, delay);
                            } else {
                                resolve(JSON.stringify(response));
                            }
                        } catch (err) {
                            log.error(`[${requestId}] Failed to process response:`, err);
                            reject(new Error(`Failed to process response: ${err.message}`));
                        }
                    });
                });

                // ENHANCED ERROR HANDLING with exponential backoff
                req.on('error', (error) => {
                    log.error(`[${requestId}] HTTP request error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);

                    if (error.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
                        error.code === 'CERT_SIGNATURE_FAILURE' ||
                        error.code === 'ERR_CERT_AUTHORITY_INVALID' ||
                        error.message.includes('certificate')) {

                        // Log detailed certificate error info
                        log.error(`[${requestId}] Certificate validation error: ${error.message}`);
                        log.error(`[${requestId}] Host: ${parsedUrl.hostname}, Protocol: ${parsedUrl.protocol}`);
                        log.error(`[${requestId}] Using system certificate store: true`);

                        // Include stack in development logs
                        if (process.env.NODE_ENV === 'development') {
                            log.error(`[${requestId}] Stack: ${error.stack}`);
                        }
                    }

                    // Check if we should retry (expanded list of retryable errors)
                    const isRetryableError = error.code === 'ECONNRESET' ||
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNREFUSED' ||
                        error.code === 'ENOTFOUND' ||
                        error.code === 'ECONNABORTED' ||
                        error.code === 'ENETUNREACH' ||
                        error.code === 'EHOSTUNREACH';

                    if (isRetryableError && retryCount < MAX_RETRIES) {
                        // Calculate delay with exponential backoff and jitter
                        const delay = Math.min(
                            INITIAL_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                            MAX_RETRY_DELAY
                        );

                        log.info(`[${requestId}] Retrying due to ${error.code} in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                        // Wait and retry
                        setTimeout(() => {
                            performRequest(retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    } else {
                        // Max retries reached or non-retryable error
                        log.error(`[${requestId}] Error ${error.code} not retryable or max retries reached`);
                        reject(error);
                    }
                });

                // Enhanced timeout handling with exponential backoff
                req.on('timeout', () => {
                    req.destroy();
                    log.error(`[${requestId}] Request timed out after ${requestOptions.timeout}ms`);

                    // Check if we should retry
                    if (retryCount < MAX_RETRIES) {
                        // Calculate delay with exponential backoff and jitter
                        const delay = Math.min(
                            INITIAL_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                            MAX_RETRY_DELAY
                        );

                        log.info(`[${requestId}] Retrying after timeout in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                        // Wait and retry
                        setTimeout(() => {
                            performRequest(retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    } else {
                        // Max retries reached
                        log.error(`[${requestId}] Max retries reached for timeout`);
                        reject(new Error(`Request timed out after ${requestOptions.timeout}ms and ${MAX_RETRIES} retries`));
                    }
                });

                // Add specific ECONNRESET handling for typical network interruptions
                req.on('socket', (socket) => {
                    socket.on('error', (error) => {
                        if (error.code === 'ECONNRESET') {
                            log.info(`[${requestId}] Socket ECONNRESET detected at the socket level`);
                            // The 'error' event on req will still be triggered
                        }
                    });
                });

                // Send body if present
                if (requestBody) {
                    req.write(requestBody);
                }

                req.end();
            } catch (error) {
                log.error('Error preparing HTTP request:', error);
                reject(error);
            }
        });
    };

    // Start the request process with retry capability
    return performRequest();
}

async function handleSaveSettings(_, settings) {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');

        // Log the settings being saved
        log.info(`Saving settings: ${JSON.stringify(settings)}`);

        // Important: Ensure ALL boolean settings are properly typed
        if (settings.hasOwnProperty('hideOnLaunch')) {
            settings.hideOnLaunch = Boolean(settings.hideOnLaunch);
        }

        // Add explicit type conversion for tray settings
        if (settings.hasOwnProperty('showStatusBarIcon')) {
            settings.showStatusBarIcon = Boolean(settings.showStatusBarIcon);
        }

        if (settings.hasOwnProperty('showDockIcon')) {
            settings.showDockIcon = Boolean(settings.showDockIcon);
        }

        if (settings.hasOwnProperty('launchAtLogin')) {
            settings.launchAtLogin = Boolean(settings.launchAtLogin);
        }

        log.info(`Normalized settings: ${JSON.stringify(settings)}`);

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
                launchAtLogin: true,
                hideOnLaunch: true,
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

        // Get all relevant app naming properties
        const appName = app.getName(); // app name from package.json name field
        const productName = app.name; // should match productName from package.json
        const execPath = app.getPath('exe'); // executable path

        // Log auto-launch configuration and app naming details
        log.info(`Setting auto-launch to: ${enable} with args: ${args.join(' ')}`);
        log.info(`App details: name=${appName}, productName=${productName}, execPath=${execPath}`);

        const autoLauncher = new AutoLaunch({
            name: appName, // Use app name from running instance
            path: execPath,
            args: args,
            isHidden: true // Important for Windows
        });

        if (enable) {
            await autoLauncher.enable();
            log.info(`Auto launch enabled for ${appName} with args: ${args.join(' ')}`);
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