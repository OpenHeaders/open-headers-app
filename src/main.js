// main.js - Electron main process with improved auto-launch window hiding and enhanced network monitoring
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const { powerMonitor, net } = require('electron');

const path = require('path');
const fs = require('fs');
const querystring = require('querystring');
const chokidar = require('chokidar');
const AutoLaunch = require('auto-launch');
const webSocketService = require('./services/ws-service');
const NetworkMonitor = require('./services/NetworkMonitor');
const networkStateManager = require('./services/NetworkStateManager');

// Initialize standardized logger
const { createLogger } = require('./utils/mainLogger');
const log = createLogger('Main');
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
let networkMonitor = null;

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

// Remove deprecated logToFile function - use logger directly

// Initialize network monitor when app is ready
async function initializeNetworkMonitor() {
    log.info('Initializing enhanced network monitoring...');

    networkMonitor = new NetworkMonitor();

    // Initialize and get initial state
    const initialState = await networkMonitor.initialize();

    // Update centralized network state
    networkStateManager.updateState({
        isOnline: initialState.isOnline,
        networkQuality: initialState.networkQuality,
        vpnActive: initialState.vpnActive,
        interfaces: initialState.networkInterfaces ? Array.from(initialState.networkInterfaces.entries()) : [],
        primaryInterface: initialState.primaryInterface,
        connectionType: initialState.connectionType,
        diagnostics: {
            dnsResolvable: initialState.isOnline, // Match online state
            internetReachable: initialState.isOnline,
            captivePortal: false,
            latency: 0
        }
    }, true); // immediate update

    // Listen to network events
    networkMonitor.on('network-change', (event) => {
        log.info('Network change detected - detailed event data:', {
            type: event.type,
            hasState: !!event.state,
            stateIsOnline: event.state?.isOnline,
            stateConfidence: event.state?.confidence,
            stateNetworkQuality: event.state?.networkQuality,
            checkResult: event.checkResult,
            analysis: event.analysis,
            changes: event.changes?.length || 0
        });

        // Log the full state if present
        if (event.state) {
            log.info('Network change - full state:', {
                isOnline: event.state.isOnline,
                connectionType: event.state.connectionType,
                confidence: event.state.confidence,
                networkQuality: event.state.networkQuality,
                vpnActive: event.state.vpnActive,
                lastCheck: event.state.lastCheck,
                consecutiveFailures: event.state.consecutiveFailures,
                networkInterfaces: event.state.networkInterfaces ? 
                    `Map with ${event.state.networkInterfaces.size} interfaces` : 'undefined'
            });
            
            // Update centralized state
            log.info('Updating NetworkStateManager with new state...');
            networkStateManager.updateState(event.state);
        } else {
            log.warn('Network change event received without state object');
        }

        // State will be broadcast automatically by NetworkStateManager
    });

    networkMonitor.on('status-change', (event) => {
        log.info('Network status change - detailed:', {
            wasOnline: event.wasOnline,
            isOnline: event.isOnline,
            transition: `${event.wasOnline ? 'online' : 'offline'} -> ${event.isOnline ? 'online' : 'offline'}`,
            stateProvided: !!event.state,
            stateDetails: event.state ? {
                confidence: event.state.confidence,
                networkQuality: event.state.networkQuality,
                consecutiveFailures: event.state.consecutiveFailures
            } : null
        });

        log.info('Updating NetworkStateManager with status change...');
        networkStateManager.updateState({
            isOnline: event.isOnline
        });

        // Additional legacy event for backward compatibility
        BrowserWindow.getAllWindows().forEach(window => {
            if (window && !window.isDestroyed()) {
                window.webContents.send('network-state-changed', event.isOnline);
            }
        });
    });

    networkMonitor.on('vpn-change', (event) => {
        log.info('VPN state change:', event.active ? 'connected' : 'disconnected', 
            event.interface ? `(${event.interface})` : '');

        networkStateManager.updateState({
            vpnActive: event.active
        }, true); // Immediate update for VPN state

        // Additional legacy event for backward compatibility
        BrowserWindow.getAllWindows().forEach(window => {
            if (window && !window.isDestroyed()) {
                window.webContents.send('vpn-state-changed', event);
            }
        });
    });

    // Subscribe to state changes from NetworkStateManager
    networkStateManager.on('state-changed', (event) => {
        log.info('NetworkStateManager state changed:', event.changes);
        
        // Send comprehensive network change event
        BrowserWindow.getAllWindows().forEach(window => {
            if (window && !window.isDestroyed()) {
                window.webContents.send('network-change', {
                    type: 'state-sync',
                    state: event.state,
                    changes: event.changes,
                    analysis: networkStateManager.analyzeNetworkChange()
                });
            }
        });
    });

    log.info('Network monitor initialized with state:', networkStateManager.getState());
}

function setupAutoUpdater() {
    // Define state tracking variables for update process
    global.updateCheckInProgress = false;
    global.updateDownloadInProgress = false;
    global.updateDownloaded = false;

    // Configure autoUpdater logging to suppress [debug] logs
    const electronLog = require('electron-log');
    // Create a filtered logger that only logs info level and above
    const filteredLogger = {
        info: (...args) => log.info('[AutoUpdater]', ...args),
        warn: (...args) => log.warn('[AutoUpdater]', ...args),
        error: (...args) => log.error('[AutoUpdater]', ...args),
        debug: () => {} // Suppress debug logs from autoUpdater
    };
    autoUpdater.logger = filteredLogger;
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

    // Initial update states are set above, no need to log them

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
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`Update available: version=${info.version}`);
        // We're now checking and downloading
        global.updateCheckInProgress = false;
        global.updateDownloadInProgress = true;

        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available, current version up to date');
        // Reset checking state
        global.updateCheckInProgress = false;

        if (mainWindow) {
            mainWindow.webContents.send('update-not-available', info);
            mainWindow.webContents.send('clear-update-checking-notification');
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
        log.info(logMessage);

        // Ensure download state is set
        global.updateDownloadInProgress = true;


        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info(`Update downloaded: version ${info.version}`);

        // Update is downloaded and ready to install
        global.updateDownloadInProgress = false;
        global.updateDownloaded = true;

        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater:', err);
        // Reset all states on error
        global.updateCheckInProgress = false;
        global.updateDownloadInProgress = false;

        // Always send clear notification event on error
        if (mainWindow) {
            mainWindow.webContents.send('clear-update-checking-notification');
        }

        // Handle network errors with a shorter retry time
        const isNetworkError = err.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
            err.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
            err.message.includes('net::ERR_CONNECTION_REFUSED');

        if (isNetworkError) {
            log.info('Network error during update check, will retry in 15 minutes');

            // Clear any existing retry timer
            if (networkErrorRetryTimer) {
                clearTimeout(networkErrorRetryTimer);
            }

            // Set a shorter retry timer for network errors (15 minutes)
            networkErrorRetryTimer = setTimeout(() => {
                if (!global.updateCheckInProgress && !global.updateDownloadInProgress) {
                    log.info('Retrying update check after network error...');
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
        log.info('Performing initial update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in initial update check:', err);
                log.error('Initial update check failed:', err);
            });
    }, 3000);

    // Set up periodic update checks (every 6 hours)
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    setInterval(() => {
        // Check if we're already in the process of checking for updates
        if (global.updateCheckInProgress || global.updateDownloadInProgress) {
            log.info('Skipping periodic update check - another check/download already in progress');
            return;
        }

        log.info('Performing periodic update check...');
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
                log.error('Error in periodic update check:', err);
                log.error('Periodic update check failed:', err);

                // Even if the check fails, we'll try again at the next interval
                // No need to show error to user for routine background checks
                global.updateCheckInProgress = false;
            });
    }, CHECK_INTERVAL);
}

// Enhanced native monitoring with network monitor integration
function setupNativeMonitoring() {
    log.info('Setting up native system monitoring...');

    // Power monitoring
    powerMonitor.on('suspend', () => {
        log.info('System is going to sleep');

        // Notify all renderer processes
        BrowserWindow.getAllWindows().forEach(window => {
            if (window && !window.isDestroyed()) {
                window.webContents.send('system-suspend');
            }
        });
    });

    powerMonitor.on('resume', () => {
        log.info('System woke up');

        // Force network check after resume
        if (networkMonitor) {
            setTimeout(async () => {
                const state = await networkMonitor.forceCheck();
                
                // Update centralized network state
                if (state) {
                    networkStateManager.updateState({
                        isOnline: state.isOnline,
                        networkQuality: state.networkQuality,
                        vpnActive: state.vpnActive,
                        interfaces: state.networkInterfaces ? Array.from(state.networkInterfaces.entries()) : [],
                        connectionType: state.connectionType,
                        diagnostics: {
                            dnsResolvable: true,
                            internetReachable: state.isOnline,
                            captivePortal: false,
                            latency: 0
                        }
                    }, true);
                }

                // Notify all renderer processes
                BrowserWindow.getAllWindows().forEach(window => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.send('system-resume');
                        if (state) {
                            window.webContents.send('network-state-changed', state.isOnline);
                        }
                    }
                });
            }, 1000);
        }
    });
}

// Network connectivity check using NetworkMonitor
async function checkNetworkConnectivity() {
    if (networkMonitor) {
        const state = await networkMonitor.forceCheck();
        return state.isOnline;
    }

    // Fallback to centralized network state
    const currentState = networkStateManager.getState();
    return currentState.isOnline;
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
                    "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data:; " +
                    "connect-src 'none';"  // Explicitly block all external connections from renderer
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

    // Initialize network monitoring
    await initializeNetworkMonitor();

    // Register essential IPC handlers before creating window
    // These are needed immediately when the renderer loads
    ipcMain.handle('getAppVersion', () => {
        return app.getVersion();
    });

    ipcMain.handle('getSettings', handleGetSettings);
    ipcMain.handle('saveSettings', handleSaveSettings);
    ipcMain.handle('getSystemTimezone', handleGetSystemTimezone);
    ipcMain.handle('loadFromStorage', handleLoadFromStorage);
    ipcMain.handle('saveToStorage', handleSaveToStorage);
    ipcMain.handle('makeHttpRequest', handleMakeHttpRequest);

    createWindow();
    createTray();

    // Initialize WebSocket service
    initializeWebSocket();

    setupIPC();

    setupNativeMonitoring();

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

    // Clean up network monitor
    if (networkMonitor) {
        networkMonitor.destroy();
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

    // Network connectivity check
    ipcMain.handle('checkNetworkConnectivity', async () => {
        try {
            return await checkNetworkConnectivity();
        } catch (error) {
            log.error('Error checking network connectivity:', error);
            return false;
        }
    });

    // Enhanced network state
    ipcMain.handle('getNetworkState', async () => {
        return networkStateManager.getState();
    });

    // Force network check
    ipcMain.handle('forceNetworkCheck', async () => {
        if (networkMonitor) {
            const state = await networkMonitor.forceCheck();
            // Update centralized state with force check results
            if (state) {
                networkStateManager.updateState({
                    isOnline: state.isOnline,
                    networkQuality: state.networkQuality,
                    vpnActive: state.vpnActive,
                    interfaces: state.networkInterfaces ? Array.from(state.networkInterfaces.entries()) : [],
                    connectionType: state.connectionType,
                    diagnostics: {
                        dnsResolvable: true,
                        internetReachable: state.isOnline,
                        captivePortal: false,
                        latency: 0
                    }
                }, true);
            }
            return networkStateManager.getState();
        }
        return null;
    });

    // Get current system state (updated with network info)
    ipcMain.handle('getSystemState', () => {
        const networkState = networkStateManager.getState();
        return {
            ...networkState,
            powerState: 'active', // Can be enhanced with powerMonitor
            timestamp: Date.now()
        };
    });

    // Get current system timezone - handled by handleGetSystemTimezone
    // Handler already registered in pre-registered handlers section

    ipcMain.on('updateWebSocketSources', (event, sources) => {
        // Initialize WebSocket if needed (lazy loading)
        if (!webSocketService) {
            initializeWebSocket();
        }
        webSocketService.updateSources(sources);
    });

    // Add update-related IPC handlers
    ipcMain.on('check-for-updates', (event, isManual) => {
        log.info(`${isManual ? 'Manual' : 'Automatic'} update check requested via IPC`);

        // First check if an update is already downloaded and ready
        if (global.updateDownloaded) {
            log.info('Update already downloaded, notifying client to show install prompt');
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
            log.info('Update check/download already in progress, skipping duplicate request');

            // Notify renderer that we're already checking
            if (mainWindow) {
                mainWindow.webContents.send('update-check-already-in-progress');
            }
            return;
        }

        global.updateCheckInProgress = true;

        try {
            autoUpdater.checkForUpdates()
                .catch(error => {
                    log.error('autoUpdater.checkForUpdates() failed:', error);

                    // IMPORTANT: Reset check state on error and notify client
                    global.updateCheckInProgress = false;

                    // Send clear notification event
                    if (mainWindow) {
                                    mainWindow.webContents.send('clear-update-checking-notification');
                    }

                    // Send error event if it was a manual check
                    if (isManual && mainWindow) {
                        mainWindow.webContents.send('update-error', error.message || 'Update check failed');
                    }
                })
                .finally(() => {
                    // Reset flag when check is complete (successful or not)
                    setTimeout(() => {
                        if (global.updateCheckInProgress) {
                            global.updateCheckInProgress = false;

                            // Also send clear notification event as a safeguard
                            if (mainWindow) {
                                                    mainWindow.webContents.send('clear-update-checking-notification');
                            }
                        }
                    }, 10000); // 10 second timeout as a failsafe
                });
        } catch (err) {
            global.updateCheckInProgress = false;
            log.error('Error calling checkForUpdates:', err);

            // Send clear notification event
            if (mainWindow) {
                    mainWindow.webContents.send('clear-update-checking-notification');
            }

            if (isManual) {
                event.reply('update-error', err.message);
            }
        }
    });

    // And for install handler:
    ipcMain.on('install-update', () => {
        log.info('Update installation requested');
        isQuitting = true; // Set to true to allow the app to close
        global.updateDownloaded = false; // Reset the state

        try {
            // Signal that we want to restart after update
            autoUpdater.autoInstallOnAppQuit = true;

            // Force quit with updated options
            autoUpdater.quitAndInstall(false, true);

            // Backup approach: If autoUpdater's quitAndInstall doesn't work,
            // force the app to quit after a short delay
            setTimeout(() => {
                log.info('Forcing application quit for update...');
                app.exit(0);
            }, 1000);
        } catch (error) {
            log.error('Failed to install update:', error);
            global.updateDownloaded = true; // Reset back since install failed

            // Show error dialog
            if (mainWindow) {
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

    // Storage operations - already registered before createWindow

    // HTTP operations - handler already registered in pre-registered handlers section

    // Application settings
    ipcMain.handle('getAppPath', handleGetAppPath);
    // The following handlers are already registered before createWindow:
    // getSystemTimezone, saveSettings, getSettings

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

    // getAppVersion handler already registered before createWindow

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

/**
 * Get system timezone directly from OS
 * This bypasses JavaScript's cached timezone information
 */
async function handleGetSystemTimezone() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let timezone = null;
    let method = 'unknown';
    
    try {
        if (process.platform === 'darwin') {
            // macOS: Read timezone from /etc/localtime symlink
            try {
                const { stdout } = await execAsync('readlink /etc/localtime');
                // Handle both /usr/share/zoneinfo and /var/db/timezone/zoneinfo paths
                const match = stdout.trim().match(/zoneinfo\/(.+)$/);
                if (match) {
                    timezone = match[1];
                    method = 'readlink';
                }
            } catch (e) {
                // Silent catch, will try fallback
            }
        } else if (process.platform === 'linux') {
            // Linux: Read /etc/localtime symlink or /etc/timezone
            try {
                const { stdout } = await execAsync('readlink /etc/localtime');
                const match = stdout.trim().match(/zoneinfo\/(.+)$/);
                if (match) {
                    timezone = match[1];
                    method = 'readlink';
                }
            } catch {
                // Fallback to /etc/timezone
                try {
                    const { stdout } = await execAsync('cat /etc/timezone');
                    timezone = stdout.trim();
                    method = 'etc_timezone';
                } catch {
                    // Silent catch
                }
            }
        } else if (process.platform === 'win32') {
            // Windows: Use PowerShell to get timezone
            try {
                const { stdout } = await execAsync('powershell -Command "Get-TimeZone | Select-Object -ExpandProperty Id"');
                // Windows uses different timezone names, need to map to IANA
                timezone = mapWindowsToIANA(stdout.trim());
                method = 'powershell';
            } catch {
                // Silent catch
            }
        }
    } catch (error) {
        log.error('Error getting system timezone:', error);
        method = 'error_fallback';
    }
    
    // If we couldn't get system timezone, fall back to JavaScript
    if (!timezone) {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        method = 'intl_fallback';
    }
    
    // Get current offset
    const offset = new Date().getTimezoneOffset();
    
    return {
        timezone,
        offset,
        method
    };
}

// Map Windows timezone IDs to IANA timezone names
function mapWindowsToIANA(windowsId) {
    const mapping = {
        'Pacific Standard Time': 'America/Los_Angeles',
        'Mountain Standard Time': 'America/Denver',
        'Central Standard Time': 'America/Chicago',
        'Eastern Standard Time': 'America/New_York',
        'GMT Standard Time': 'Europe/London',
        'Central European Standard Time': 'Europe/Berlin',
        'E. Europe Standard Time': 'Europe/Bucharest',
        'Turkey Standard Time': 'Europe/Istanbul',
        'China Standard Time': 'Asia/Shanghai',
        'Tokyo Standard Time': 'Asia/Tokyo',
        'India Standard Time': 'Asia/Kolkata',
        'Arabian Standard Time': 'Asia/Dubai',
        'Atlantic Standard Time': 'Atlantic/Canary',
        'W. Europe Standard Time': 'Europe/Paris',
        'Romance Standard Time': 'Europe/Paris',
        'Central Europe Standard Time': 'Europe/Warsaw',
        'Russian Standard Time': 'Europe/Moscow',
        'SA Pacific Standard Time': 'America/Bogota',
        'Argentina Standard Time': 'America/Buenos_Aires',
        'Brasilia Standard Time': 'America/Sao_Paulo',
        'Canada Central Standard Time': 'America/Regina',
        'Mexico Standard Time': 'America/Mexico_City',
        'Venezuela Standard Time': 'America/Caracas',
        'SA Eastern Standard Time': 'America/Cayenne',
        'Newfoundland Standard Time': 'America/St_Johns',
        'Greenland Standard Time': 'America/Godthab',
        'Azores Standard Time': 'Atlantic/Azores',
        'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
        'Morocco Standard Time': 'Africa/Casablanca',
        'UTC': 'UTC',
        'GMT Standard Time': 'Europe/London',
        'British Summer Time': 'Europe/London',
        'Egypt Standard Time': 'Africa/Cairo',
        'South Africa Standard Time': 'Africa/Johannesburg',
        'Israel Standard Time': 'Asia/Jerusalem',
        'Jordan Standard Time': 'Asia/Amman',
        'Middle East Standard Time': 'Asia/Beirut',
        'Syria Standard Time': 'Asia/Damascus',
        'West Asia Standard Time': 'Asia/Karachi',
        'Afghanistan Standard Time': 'Asia/Kabul',
        'Pakistan Standard Time': 'Asia/Karachi',
        'Sri Lanka Standard Time': 'Asia/Colombo',
        'Myanmar Standard Time': 'Asia/Yangon',
        'SE Asia Standard Time': 'Asia/Bangkok',
        'Singapore Standard Time': 'Asia/Singapore',
        'Taipei Standard Time': 'Asia/Taipei',
        'W. Australia Standard Time': 'Australia/Perth',
        'Korea Standard Time': 'Asia/Seoul',
        'Cen. Australia Standard Time': 'Australia/Adelaide',
        'AUS Eastern Standard Time': 'Australia/Sydney',
        'Tasmania Standard Time': 'Australia/Hobart',
        'Vladivostok Standard Time': 'Asia/Vladivostok',
        'West Pacific Standard Time': 'Pacific/Port_Moresby',
        'Central Pacific Standard Time': 'Pacific/Guadalcanal',
        'Fiji Standard Time': 'Pacific/Fiji',
        'New Zealand Standard Time': 'Pacific/Auckland',
        'Tonga Standard Time': 'Pacific/Tongatapu',
        'Samoa Standard Time': 'Pacific/Apia',
        'Hawaiian Standard Time': 'Pacific/Honolulu',
        'Alaskan Standard Time': 'America/Anchorage',
        'Pacific Standard Time (Mexico)': 'America/Tijuana',
        'Mountain Standard Time (Mexico)': 'America/Chihuahua',
        'Central Standard Time (Mexico)': 'America/Mexico_City',
        'Eastern Standard Time (Mexico)': 'America/Cancun',
        'US Mountain Standard Time': 'America/Phoenix',
        'Central America Standard Time': 'America/Guatemala',
        'US Eastern Standard Time': 'America/Indiana/Indianapolis',
        'Paraguay Standard Time': 'America/Asuncion',
        'Montevideo Standard Time': 'America/Montevideo',
        'Magallanes Standard Time': 'America/Punta_Arenas',
        'Cuba Standard Time': 'America/Havana',
        'Haiti Standard Time': 'America/Port-au-Prince',
        'Turks And Caicos Standard Time': 'America/Grand_Turk',
        'Sao Tome Standard Time': 'Africa/Sao_Tome',
        'Libya Standard Time': 'Africa/Tripoli',
        'Namibia Standard Time': 'Africa/Windhoek',
        'Mauritius Standard Time': 'Indian/Mauritius',
        'Georgian Standard Time': 'Asia/Tbilisi',
        'Caucasus Standard Time': 'Asia/Yerevan',
        'Iran Standard Time': 'Asia/Tehran',
        'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
        'Omsk Standard Time': 'Asia/Omsk',
        'Bangladesh Standard Time': 'Asia/Dhaka',
        'Nepal Standard Time': 'Asia/Kathmandu',
        'North Asia Standard Time': 'Asia/Krasnoyarsk',
        'N. Central Asia Standard Time': 'Asia/Novosibirsk',
        'North Asia East Standard Time': 'Asia/Irkutsk',
        'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
        'Yakutsk Standard Time': 'Asia/Yakutsk',
        'Sakhalin Standard Time': 'Asia/Sakhalin',
        'Magadan Standard Time': 'Asia/Magadan',
        'Kamchatka Standard Time': 'Asia/Kamchatka',
        'Norfolk Standard Time': 'Pacific/Norfolk',
        'Lord Howe Standard Time': 'Australia/Lord_Howe',
        'Easter Island Standard Time': 'Pacific/Easter',
        'Marquesas Standard Time': 'Pacific/Marquesas',
        'Tahiti Standard Time': 'Pacific/Tahiti',
        'Line Islands Standard Time': 'Pacific/Kiritimati',
        'Chatham Islands Standard Time': 'Pacific/Chatham'
    };
    
    return mapping[windowsId] || windowsId;
}

/**
 * Enhanced HTTP request handler with network awareness
 *
 * This implementation uses Electron's net module with adaptive retry logic
 * based on current network conditions (quality, VPN status)
 */
async function handleMakeHttpRequest(_, url, method, options = {}) {
    const { net } = require('electron');

    // Get current network state
    const networkState = networkMonitor ? networkMonitor.getState() : systemState;

    // Configure retry parameters based on network quality
    const MAX_RETRIES = networkState.networkQuality === 'poor' ? 3 : 2;
    const RETRY_DELAY = networkState.networkQuality === 'poor' ? 1000 : 500;

    // Add network context to options
    const enhancedOptions = {
        ...options,
        networkContext: {
            quality: networkState.networkQuality,
            vpn: networkState.vpnActive,
            confidence: networkState.confidence
        }
    };

    // Function to perform the actual request with retry logic
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

                // Get requestId
                const requestId = (options.connectionOptions && options.connectionOptions.requestId) ||
                    (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

                // Create request using Electron's net module
                const request = net.request({
                    method: method || 'GET',
                    url: parsedUrl.toString(),
                    redirect: 'follow'
                });

                // Adjust timeout based on network quality
                let timeoutMs = options.connectionOptions?.timeout || 15000;

                // Increase timeout for poor network
                if (networkState.networkQuality === 'poor') {
                    timeoutMs = Math.min(timeoutMs * 2, 60000);
                }

                let timeoutId = null;

                // Set up timeout handler
                timeoutId = setTimeout(() => {
                    request.abort();
                    log.error(`[${requestId}] Request timed out after ${timeoutMs}ms (network: ${networkState.networkQuality})`);

                    // Check if we should retry
                    if (retryCount < MAX_RETRIES && networkState.isOnline) {
                        const delay = Math.min(
                            RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                            10000
                        );

                        log.info(`[${requestId}] Retrying due to timeout in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                        setTimeout(() => {
                            performRequest(retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    } else {
                        reject(new Error(`Request timed out after ${timeoutMs}ms`));
                    }
                }, timeoutMs);

                // Set headers
                if (options.headers) {
                    Object.entries(options.headers).forEach(([key, value]) => {
                        request.setHeader(key, value);
                    });
                }

                // Set User-Agent
                request.setHeader('User-Agent', `OpenHeaders/${app.getVersion()}`);

                log.info(`[${requestId}] Making HTTP ${method} request to ${parsedUrl.href} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}, network: ${networkState.networkQuality})`);

                // Collect response chunks
                let responseData = '';
                let statusCode = 0;

                request.on('response', (response) => {
                    // Clear the timeout since we got a response
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }

                    statusCode = response.statusCode;
                    const responseHeaders = response.headers;

                    response.on('data', (chunk) => {
                        responseData += chunk.toString();
                    });

                    response.on('end', () => {
                        log.info(`[${requestId}] HTTP response received: ${statusCode}`);

                        // Check for server errors (5xx) that might benefit from a retry
                        if (statusCode >= 500 && retryCount < MAX_RETRIES) {
                            log.info(`[${requestId}] Server error ${statusCode} received, will retry`);

                            const delay = Math.min(
                                RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                                10000
                            );

                            log.info(`[${requestId}] Retrying in ${Math.round(delay)}ms`);

                            setTimeout(() => {
                                performRequest(retryCount + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, delay);
                        } else {
                            // Format response
                            const formattedResponse = {
                                statusCode: statusCode,
                                headers: responseHeaders,
                                body: responseData,
                                networkContext: networkState
                            };

                            resolve(JSON.stringify(formattedResponse));
                        }
                    });
                });

                // Handle errors
                request.on('error', (error) => {
                    // Clear timeout on error
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }

                    log.error(`[${requestId}] HTTP request error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);

                    // Improved error detection
                    const isRetryableError =
                        error.code === 'ECONNRESET' ||
                        error.code === 'ETIMEDOUT' ||
                        error.code === 'ECONNREFUSED' ||
                        error.code === 'ENOTFOUND' ||
                        error.code === 'ECONNABORTED' ||
                        error.code === 'ENETUNREACH' ||
                        error.code === 'EHOSTUNREACH' ||
                        (error.message && (
                            error.message.includes('net::ERR_CONNECTION_RESET') ||
                            error.message.includes('net::ERR_CONNECTION_TIMED_OUT') ||
                            error.message.includes('net::ERR_CONNECTION_REFUSED') ||
                            error.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
                            error.message.includes('net::ERR_NETWORK_CHANGED') ||
                            error.message.includes('net::ERR_CONNECTION_ABORTED') ||
                            error.message.includes('net::ERR_EMPTY_RESPONSE')
                        ));

                    const isCertificateError =
                        (error.message && error.message.includes('net::ERR_CERT_'));

                    if (isCertificateError) {
                        log.error(`[${requestId}] Certificate error - not retrying`);
                        reject(new Error(`Certificate validation failed: ${error.message}`));
                    }
                    else if (isRetryableError && retryCount < MAX_RETRIES && networkState.isOnline) {
                        const delay = Math.min(
                            RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000,
                            10000
                        );

                        log.info(`[${requestId}] Retrying due to network error in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

                        setTimeout(() => {
                            performRequest(retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    } else {
                        // Max retries reached or non-retryable error
                        log.error(`[${requestId}] Error not retryable or max retries reached`);
                        reject(error);
                    }
                });

                // Prepare request body if applicable
                if (['POST', 'PUT', 'PATCH'].includes(method) && options.body) {
                    let requestBody = options.body;

                    // Handle different content types
                    if (options.contentType === 'application/x-www-form-urlencoded') {
                        let formData = {};

                        if (typeof options.body === 'string') {
                            // Handle different string format types for form data
                            if (options.body.includes('=') && options.body.includes('&')) {
                                requestBody = options.body;
                            }
                            else if (options.body.includes('=') && options.body.includes('\n')) {
                                requestBody = options.body.split('\n')
                                    .filter(line => line.trim() !== '' && line.includes('='))
                                    .join('&');
                            }
                            else if (options.body.includes(':')) {
                                const lines = options.body.split('\n');
                                lines.forEach(line => {
                                    line = line.trim();
                                    if (line === '') return;

                                    if (line.includes(':"')) {
                                        const colonPos = line.indexOf(':');
                                        const key = line.substring(0, colonPos).trim();
                                        const value = line.substring(colonPos + 2, line.lastIndexOf('"'));
                                        formData[key] = value;
                                    }
                                    else if (line.includes(':')) {
                                        const parts = line.split(':');
                                        if (parts.length >= 2) {
                                            const key = parts[0].trim();
                                            const value = parts.slice(1).join(':').trim();
                                            formData[key] = value;
                                        }
                                    }
                                });

                                requestBody = querystring.stringify(formData);
                            }
                        }
                        else if (typeof options.body === 'object' && options.body !== null) {
                            requestBody = querystring.stringify(options.body);
                        }

                        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
                    }
                    else if (options.contentType === 'application/json') {
                        if (typeof options.body !== 'string') {
                            requestBody = JSON.stringify(options.body);
                        }
                        request.setHeader('Content-Type', 'application/json');
                    }
                    else if (options.contentType) {
                        request.setHeader('Content-Type', options.contentType);
                    }

                    // Convert to Buffer if it's a string
                    if (typeof requestBody === 'string') {
                        requestBody = Buffer.from(requestBody);
                    }

                    // Write the request body
                    request.write(requestBody);
                }

                // Complete the request
                request.end();

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