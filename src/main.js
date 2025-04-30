const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const chokidar = require('chokidar');
const AutoLaunch = require('auto-launch');

// Lazy load the webSocketService only when needed
let webSocketService = null;
const getWebSocketService = () => {
    if (!webSocketService) {
        webSocketService = require('./services/ws-service');
    }
    return webSocketService;
};

// Globals
let mainWindow;
let tray = null;
let isQuitting = false;
let settingsCache = null;

// The file watchers map is now created lazily when first used
let fileWatchers = null;
const getFileWatchers = () => {
    if (!fileWatchers) {
        fileWatchers = new Map();
    }
    return fileWatchers;
};

// Try to load the hideOnLaunch setting early
let hideOnStartupSetting = false; // Default

try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settingsData = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(settingsData);
        hideOnStartupSetting = !!settings.hideOnLaunch;
        console.log(`Early settings load: hideOnLaunch is ${hideOnStartupSetting}`);
    }
} catch (settingsErr) {
    console.error('Error loading settings early:', settingsErr);
}

// Improve command-line argument handling for Linux
if (process.platform === 'linux') {
    // Some Linux desktop environments strip command-line arguments
    // This helps detect if we're running from autostart
    const argv = process.argv || [];
    const execPath = argv[0] || '';

    // Check common autostart paths and desktop environment startup indicators
    const isFromAutostart = execPath.includes('.config/autostart') ||
        argv.some(arg => arg.includes('autostart')) ||
        !!process.env.XDG_AUTOSTART_CONTEXT;

    // If appears to be from autostart but missing our flags, add them
    if (isFromAutostart && !argv.includes('--autostart')) {
        process.argv.push('--autostart');
        console.log('Added --autostart flag for Linux:', process.argv);

        // Only add --hidden if the setting is enabled
        if (hideOnStartupSetting && !argv.includes('--hidden')) {
            process.argv.push('--hidden');
            console.log('Added --hidden flag based on settings:', process.argv);
        }
    }

    // IMPORTANT: If this is a manual terminal launch, explicitly add --manual flag
    // to distinguish from auto-launch scenarios
    if (!isFromAutostart && !argv.includes('--manual')) {
        // Check if being launched from a terminal
        const isTerminalLaunch = process.env.TERM ||
            process.env.TERMINAL ||
            process.env.TERMINAL_EMULATOR ||
            process.stdin.isTTY;

        if (isTerminalLaunch) {
            process.argv.push('--manual');
            console.log('Added --manual flag for terminal launch detection:', process.argv);
        }
    }

    console.log('Linux argv analysis:', {
        argv: process.argv,
        execPath,
        isFromAutostart,
        hideOnStartupSetting,
        term: process.env.TERM,
        terminal: process.env.TERMINAL,
        terminalEmulator: process.env.TERMINAL_EMULATOR,
        isTTY: process.stdin.isTTY
    });
}

// Improve Linux startup by setting app name early
app.setName('Open Headers');

// Detect Linux platform
const isLinux = process.platform === 'linux';

// OPTIMIZATION: For Linux, delay non-critical operations
// This helps with faster initial startup
const delayedOperations = [];
const scheduleForLater = (fn) => {
    if (isLinux) {
        delayedOperations.push(fn);
    } else {
        fn();
    }
};

// Function to run delayed operations
const runDelayedOperations = () => {
    while (delayedOperations.length > 0) {
        const operation = delayedOperations.shift();
        operation();
    }
};

// Handle dock visibility early for macOS only
if (process.platform === 'darwin') {
    console.log('Checking early dock visibility settings');
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');

    try {
        if (fs.existsSync(settingsPath)) {
            const settingsData = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);

            // Set dock visibility based on settings
            if (settings.showDockIcon === false) {
                console.log('Hiding dock icon at startup based on settings');
                app.dock.hide();
            } else if (settings.showDockIcon === true && !app.dock.isVisible()) {
                console.log('Showing dock icon at startup based on settings');
                app.dock.show();
            }
        }
    } catch (err) {
        console.error('Error applying early dock visibility settings:', err);
    }
}

// Create the browser window with optimizations for fast startup
function createWindow() {
    // Check for direct command-line flags that should always affect visibility
    const forceHidden = process.argv.includes('--hidden');
    const forceShow = process.argv.includes('--show');
    const isManualLaunch = process.argv.includes('--manual');

    // Log the visibility flags
    console.log('Visibility flags:', {
        forceHidden,
        forceShow,
        isManualLaunch
    });

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
        show: false // Don't show until ready-to-show
    });

    // OPTIMIZATION: Skip CSP setup on initial load for faster startup
    // Instead, add it after the window is shown
    scheduleForLater(() => {
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
    });

    // Show window when it's ready to avoid flashing
    mainWindow.once('ready-to-show', () => {
        // If forceShow is present, it overrides everything else
        if (forceShow) {
            console.log('Showing window because --show flag is present');
            mainWindow.show();
            mainWindow.focus();

            if (isLinux) {
                setTimeout(runDelayedOperations, 1000);
            }
            return;
        }

        // If manual launch flag is present, always show window
        if (isManualLaunch) {
            console.log('Showing window because this is a manual launch (--manual flag)');
            mainWindow.show();
            mainWindow.focus();

            if (isLinux) {
                setTimeout(runDelayedOperations, 1000);
            }
            return;
        }

        // Check settings for auto-hide
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                settingsCache = settings; // Cache settings

                // IMPROVED: Platform-specific auto-launch detection with better Linux support
                let isAutoLaunch = false;

                // Check command line args first (works on all platforms)
                if (process.argv.includes('--autostart')) {
                    isAutoLaunch = true;
                    console.log('Auto-launch detected via --autostart flag');
                }
                else if (process.argv.includes('--hidden') && !process.argv.includes('--manual')) {
                    isAutoLaunch = true;
                    console.log('Auto-launch detected via --hidden flag (without --manual)');
                }
                // macOS-specific detection
                else if (process.platform === 'darwin' &&
                    (app.getLoginItemSettings().wasOpenedAtLogin ||
                        app.getLoginItemSettings().wasOpenedAsHidden)) {
                    isAutoLaunch = true;
                    console.log('Auto-launch detected via macOS login items');
                }
                // Windows-specific detection
                else if (process.platform === 'win32') {
                    // On Windows, check if the app was launched by the system/task scheduler
                    // 1. Check if we have a startup shortcut
                    const hasAutoLaunchEnabled = settings.launchAtLogin === true;

                    // 2. Process startup time check - Auto-launched apps typically start within
                    //    a short time after system boot
                    const appStartTime = Date.now();
                    const systemUptime = process.uptime() * 1000; // convert to ms

                    // If system has been running for less than 5 minutes and app is set to auto-launch,
                    // it's very likely this is an auto-launch scenario
                    if (hasAutoLaunchEnabled && systemUptime < 5 * 60 * 1000) {
                        isAutoLaunch = true;
                        console.log(`Auto-launch detected on Windows (uptime: ${Math.round(systemUptime/1000)}s)`);
                    }
                }
                // Linux-specific detection - IMPROVED
                else if (process.platform === 'linux') {
                    // Method 1: Check if autolaunch is enabled in settings
                    const hasAutoLaunchEnabled = settings.launchAtLogin === true;

                    // Method 2: Check for environment variables that might indicate desktop session startup
                    const desktopSession = process.env.DESKTOP_SESSION || '';
                    const xdgSessionType = process.env.XDG_SESSION_TYPE || '';
                    const gdmSession = process.env.GDMSESSION || '';
                    const xdgAutostart = process.env.XDG_AUTOSTART_CONTEXT || '';

                    console.log('Linux environment:', {
                        DESKTOP_SESSION: desktopSession,
                        XDG_SESSION_TYPE: xdgSessionType,
                        GDMSESSION: gdmSession,
                        XDG_AUTOSTART_CONTEXT: xdgAutostart,
                        hasAutoLaunchEnabled
                    });

                    // Method 3: Check system uptime as a heuristic (similar to Windows approach)
                    const systemUptime = process.uptime() * 1000; // convert to ms
                    const isRecentBoot = systemUptime < 5 * 60 * 1000; // 5 minutes

                    // Method 4: Check parent process name or PID
                    let parentProcessInfo = '';
                    try {
                        // We could use 'ps -o comm= -p $PPID' but for simplicity, we'll use a heuristic
                        const ppid = process.ppid;
                        parentProcessInfo = `PPID: ${ppid}`;
                        console.log(`Parent process ID: ${ppid}`);
                    } catch (error) {
                        console.error('Error getting parent process:', error);
                    }

                    // Method 5: Direct flag detection (most reliable)
                    const hasAutoStartFlag = process.argv.includes('--autostart');
                    const hasManualFlag = process.argv.includes('--manual');

                    // IMPORTANT: If --manual flag is present, NEVER consider it an auto-launch
                    if (hasManualFlag) {
                        console.log('Manual launch detected via --manual flag, NOT treating as auto-launch');
                        isAutoLaunch = false;
                    }
                    // Combined decision logic for Linux auto-launch detection
                    else if (hasAutoLaunchEnabled && (hasAutoStartFlag || isRecentBoot || xdgAutostart)) {
                        isAutoLaunch = true;
                        console.log(`Auto-launch detected on Linux (flags: ${hasAutoStartFlag}, uptime: ${Math.round(systemUptime/1000)}s)`);
                    }
                    // For standard desktop application launch (not terminal, not auto)
                    else if (hasAutoLaunchEnabled && !process.stdin.isTTY && !process.env.TERM) {
                        // This might be an app launcher situation with desktop file
                        if (process.env.DESKTOP_FILE_HINT || process.env.GIO_LAUNCHED_DESKTOP_FILE) {
                            console.log('Desktop launcher detection: NOT an auto-launch');
                            isAutoLaunch = false;
                        }
                    }
                }

                console.log('App launch details:', {
                    hideOnLaunch: settings.hideOnLaunch,
                    isAutoLaunch: isAutoLaunch,
                    launchAtLogin: settings.launchAtLogin,
                    platform: process.platform,
                    argv: process.argv
                });

                // Only hide window if both hideOnLaunch is enabled AND this is an auto-launch
                // AND it's not a manual terminal launch AND not explicitly shown
                const shouldHideWindow = settings.hideOnLaunch && isAutoLaunch &&
                    !process.argv.includes('--manual') && !process.argv.includes('--show');

                // Add detailed logging for visibility decision
                console.log('Window visibility decision:', {
                    hideOnLaunch: settings.hideOnLaunch,
                    isAutoLaunch,
                    hasManualFlag: process.argv.includes('--manual'),
                    hasShowFlag: process.argv.includes('--show'),
                    shouldHideWindow
                });

                if (!shouldHideWindow) {
                    console.log('Showing window on startup (manual launch or hide setting disabled)');
                    mainWindow.show();
                    mainWindow.focus();

                    // OPTIMIZATION: For Linux, run delayed operations only after window is visible
                    if (isLinux) {
                        // Wait a short time to ensure window is responsive first
                        setTimeout(runDelayedOperations, 1000);
                    }
                } else {
                    console.log('Hiding window on startup (auto-launch with hide setting enabled)');

                    // Even if window is hidden, we should still run delayed operations
                    if (isLinux) {
                        setTimeout(runDelayedOperations, 1000);
                    }
                }
            } else {
                // No settings file exists, show by default
                mainWindow.show();

                // Run delayed operations after window is shown
                if (isLinux) {
                    setTimeout(runDelayedOperations, 1000);
                }
            }
        } catch (err) {
            console.error('Error loading settings:', err);
            // Show window on error as fallback
            mainWindow.show();

            // Run delayed operations after window is shown
            if (isLinux) {
                setTimeout(runDelayedOperations, 1000);
            }
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

// OPTIMIZATION: Create tray icon with better icon handling
function createTray() {
    // Don't create tray if it already exists
    if (tray) return;

    // Use cached settings if available, otherwise load from file
    let settings = settingsCache;
    if (!settings) {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        settings = {
            showStatusBarIcon: true, // Default to true
            showDockIcon: true
        };

        try {
            if (fs.existsSync(settingsPath)) {
                const data = fs.readFileSync(settingsPath, 'utf8');
                const loadedSettings = JSON.parse(data);
                settings = { ...settings, ...loadedSettings };
                settingsCache = settings; // Cache for future use
            }
        } catch (err) {
            console.error('Error loading settings for tray:', err);
        }
    }

    // Check if the tray should be shown
    if (!settings.showStatusBarIcon) return;

    // OPTIMIZATION: Improved icon path resolution with fewer tries
    let iconPath;
    try {
        // Choose more targeted icon locations based on platform and packaging
        if (app.isPackaged) {
            if (isLinux) {
                // Linux prefers smaller icons for tray
                iconPath = path.join(process.resourcesPath, 'build', 'icon16.png');
                if (!fs.existsSync(iconPath)) {
                    iconPath = path.join(process.resourcesPath, 'build', 'icon.png');
                }
            } else {
                // For macOS/Windows, check most likely locations first
                iconPath = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'src', 'renderer', 'images', 'icon16.png');
                if (!fs.existsSync(iconPath)) {
                    iconPath = path.join(process.resourcesPath, 'build', 'icon16.png');
                }
            }
        } else {
            // For development
            if (isLinux) {
                iconPath = path.join(__dirname, '..', 'src', 'renderer', 'images', 'icon16.png');
            } else {
                iconPath = path.join(__dirname, 'renderer', 'images', 'icon16.png');
            }
        }

        // If icon still not found, use fallback
        if (!fs.existsSync(iconPath)) {
            console.warn('Using fallback icon path');
            iconPath = path.join(app.getAppPath(), '..', 'build', 'icon.png');
        }

        console.log('Using tray icon path:', iconPath);
    } catch (error) {
        console.error('Error determining tray icon path:', error);
        iconPath = path.join(app.getAppPath(), '..', 'build', 'icon.png');
    }

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

        // Platform-specific tray behavior
        if (process.platform === 'darwin') {
            // Just let the default behavior show the context menu
            console.log('macOS tray setup: clicking will only show the menu');
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

        console.log('Tray icon created successfully');
    } catch (error) {
        console.error('Failed to create tray icon:', error);
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
            console.error('Failed to create basic tray icon:', fallbackError);
        }
    }
}

// OPTIMIZATION: Update tray with efficient checks
function updateTray(settings) {
    if (!settings) return;

    console.log('Updating tray with settings:', settings.showStatusBarIcon, 'and dock:', settings.showDockIcon);

    // Update settings cache
    settingsCache = settings;

    // PART 1: Handle status bar icon (tray)
    // -----------------------------------------
    // If tray exists but should be hidden, destroy it
    if (tray && !settings.showStatusBarIcon) {
        tray.destroy();
        tray = null;
        console.log('Status bar icon destroyed');
    }

    // If tray doesn't exist but should be shown, create it
    if (!tray && settings.showStatusBarIcon) {
        createTray();
        console.log('Status bar icon created');
    }

    // PART 2: Handle dock icon on macOS (separate from tray handling)
    // --------------------------------------------------------------
    // Only run on macOS
    if (process.platform === 'darwin') {
        // Store whether the window was visible before updating dock
        const wasWindowVisible = mainWindow && mainWindow.isVisible();

        if (settings.showDockIcon && !app.dock.isVisible()) {
            console.log('Showing dock icon');
            app.dock.show();
        } else if (!settings.showDockIcon && app.dock.isVisible()) {
            console.log('Hiding dock icon');
            app.dock.hide();

            // Critical fix: Ensure window stays visible after hiding dock icon
            if (mainWindow && wasWindowVisible) {
                // Small delay to let the dock hide operation complete
                setTimeout(() => {
                    if (mainWindow) {
                        // Show and focus the window to bring it to front
                        mainWindow.show();
                        mainWindow.focus();
                        console.log('Restoring window visibility after hiding dock icon');
                    }
                }, 100);
            }
        }
    }
}

// Setup Linux-specific auto launch
async function setupLinuxAutoLaunch(enable) {
    try {
        // First load current settings to check hideOnLaunch preference
        let hideOnStartup = false;
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settingsData = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);
                hideOnStartup = !!settings.hideOnLaunch;
                console.log(`Linux autostart setup: hideOnLaunch setting is ${hideOnStartup}`);
            }
        } catch (settingsErr) {
            console.error('Error reading settings during autolaunch setup:', settingsErr);
        }

        // Standard auto-launcher approach (works on most platforms)
        const autoLauncher = new AutoLaunch({
            name: 'Open Headers',
            path: app.getPath('exe'),
            // Only include --hidden if the setting is enabled
            args: hideOnStartup ? ['--hidden', '--autostart'] : ['--autostart']
        });

        if (enable) {
            await autoLauncher.enable();
            console.log(`Standard auto launch enabled with ${hideOnStartup ? '--hidden and ' : ''}--autostart flags`);

            // For Linux, also create a proper .desktop file in the autostart directory
            if (process.platform === 'linux') {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const os = require('os');

                    // Path to the autostart directory
                    const autostartDir = path.join(os.homedir(), '.config', 'autostart');

                    // Ensure autostart directory exists
                    if (!fs.existsSync(autostartDir)) {
                        fs.mkdirSync(autostartDir, { recursive: true });
                    }

                    // Path to executable
                    const exePath = app.getPath('exe');

                    // Create desktop entry content - only include --hidden if setting is enabled
                    const desktopEntry = `[Desktop Entry]
Type=Application
Name=Open Headers
Comment=Dynamic sources for Open Headers browser extension
Exec="${exePath}" ${hideOnStartup ? '--hidden' : ''} --autostart
Icon=open-headers
Terminal=false
Categories=Utility;Development;Network
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;

                    // Write the desktop entry file
                    const desktopEntryPath = path.join(autostartDir, 'open-headers.desktop');
                    fs.writeFileSync(desktopEntryPath, desktopEntry);

                    // Now create a standard desktop application entry in ~/.local/share/applications too
                    // This ensures the app can be launched without autostart flags
                    try {
                        const applicationsDir = path.join(os.homedir(), '.local', 'share', 'applications');

                        // Ensure applications directory exists
                        if (!fs.existsSync(applicationsDir)) {
                            fs.mkdirSync(applicationsDir, { recursive: true });
                        }

                        // Create desktop entry content for regular application launch (no autostart flags)
                        const applicationEntry = `[Desktop Entry]
Type=Application
Name=Open Headers
Comment=Dynamic sources for Open Headers browser extension
Exec="${exePath}"
Icon=open-headers
Terminal=false
Categories=Utility;Development;Network
`;

                        // Write the application desktop entry file
                        const applicationEntryPath = path.join(applicationsDir, 'open-headers.desktop');
                        fs.writeFileSync(applicationEntryPath, applicationEntry);

                        console.log(`Created Linux application entry at ${applicationEntryPath}`);
                    } catch (appEntryErr) {
                        console.error('Error creating Linux application entry:', appEntryErr);
                    }

                    console.log(`Created Linux autostart entry at ${desktopEntryPath} with ${hideOnStartup ? '--hidden and ' : ''}--autostart flags`);
                } catch (linuxErr) {
                    console.error('Error creating Linux desktop entry:', linuxErr);
                }
            }
        } else {
            await autoLauncher.disable();
            console.log('Auto launch disabled');

            // For Linux, also remove the .desktop file
            if (process.platform === 'linux') {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const os = require('os');

                    // Path to the desktop entry file
                    const desktopEntryPath = path.join(os.homedir(), '.config', 'autostart', 'open-headers.desktop');

                    // Remove the file if it exists
                    if (fs.existsSync(desktopEntryPath)) {
                        fs.unlinkSync(desktopEntryPath);
                        console.log(`Removed Linux desktop entry at ${desktopEntryPath}`);
                    }
                } catch (linuxErr) {
                    console.error('Error removing Linux desktop entry:', linuxErr);
                }
            }
        }

        return { success: true };
    } catch (err) {
        console.error('Error setting auto launch:', err);
        return { success: false, message: err.message };
    }
}

function initializeWebSocket() {
    console.log('Initializing WebSocket service with both WS and WSS support...');
    const wsService = getWebSocketService();

    // Initialize with both WS and WSS support
    wsService.initialize({
        wsPort: 59210,   // Regular WebSocket port
        wssPort: 59211   // Secure WebSocket port for Firefox
    });

    console.log('WebSocket services initialized on ports 59210 (WS) and 59211 (WSS)');
}

// App is ready
app.whenReady().then(() => {
    createWindow();

    // OPTIMIZATION: For Linux, defer tray and WebSocket initialization
    if (isLinux) {
        // Schedule non-critical operations for later
        scheduleForLater(() => {
            createTray();
            initializeWebSocket();
        });
    } else {
        // For other platforms, initialize immediately
        createTray();
        initializeWebSocket();
    }

    setupIPC();

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
            console.log('Window restored after dock icon click');
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IMPROVED: Better cleanup when app quits
app.on('before-quit', () => {
    isQuitting = true;

    // Clean up file watchers if they exist
    if (fileWatchers) {
        console.log(`Cleaning up ${fileWatchers.size} file watchers...`);
        for (const [filePath, watcher] of fileWatchers.entries()) {
            try {
                if (watcher.isFallback) {
                    watcher.close(); // Clear interval for fallback watchers
                } else {
                    watcher.close(); // Close chokidar watcher
                }
                console.log(`Closed watcher for ${filePath}`);
            } catch (err) {
                console.error(`Error closing watcher for ${filePath}:`, err);
            }
        }
        fileWatchers.clear();
    }

    // Close WebSocket server if initialized
    if (webSocketService) {
        webSocketService.close();
    }
});

async function handleWatchFile(_, sourceId, filePath) {
    try {
        // Read file initially
        const content = await fs.promises.readFile(filePath, 'utf8');
        const watchers = getFileWatchers();

        // Set up watcher if not already watching
        if (!watchers.has(filePath)) {
            // IMPROVED: Always use polling for all platforms for consistent behavior
            const watchOptions = {
                persistent: true,
                usePolling: true, // Force polling on all platforms
                disableGlobbing: true,
                interval: 1000,    // Polling interval in milliseconds
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                }
            };

            console.log(`Setting up file watcher for ${filePath} with polling (interval: ${watchOptions.interval}ms)`);

            try {
                const watcher = chokidar.watch(filePath, watchOptions);

                watcher.on('change', async (changedPath) => {
                    try {
                        console.log(`File changed: ${changedPath}`);
                        const newContent = await fs.promises.readFile(changedPath, 'utf8');
                        if (mainWindow) {
                            mainWindow.webContents.send('fileChanged', sourceId, newContent);
                        }
                    } catch (err) {
                        console.error('Error reading changed file:', err);
                    }
                });

                watchers.set(filePath, watcher);
                console.log(`Watcher successfully set up for ${filePath}`);
            } catch (watcherError) {
                console.error(`Error creating watcher for ${filePath}:`, watcherError);
                // Fall back to basic polling if chokidar fails
                fallbackToBasicPolling(sourceId, filePath);
            }
        }

        return content;
    } catch (err) {
        console.error('Error setting up file watch:', err);
        throw err;
    }
}

// Add this fallback polling function for extreme cases
function fallbackToBasicPolling(sourceId, filePath) {
    console.log(`Using fallback basic polling for ${filePath}`);

    // Store last modified time and content
    let lastMtime = 0;
    let lastContent = '';

    try {
        // Get initial stats and content
        const stats = fs.statSync(filePath);
        lastMtime = stats.mtimeMs;
        lastContent = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`Failed to get initial file info for ${filePath}:`, err);
    }

    // Set up polling interval (10 seconds)
    const interval = setInterval(() => {
        try {
            const stats = fs.statSync(filePath);
            // Check if file has been modified
            if (stats.mtimeMs > lastMtime) {
                const newContent = fs.readFileSync(filePath, 'utf8');
                // Only notify if content actually changed
                if (newContent !== lastContent) {
                    if (mainWindow) {
                        mainWindow.webContents.send('fileChanged', sourceId, newContent);
                    }
                    lastContent = newContent;
                }
                lastMtime = stats.mtimeMs;
            }
        } catch (err) {
            // File might have been deleted or become inaccessible
            console.error(`Error polling file ${filePath}:`, err);
        }
    }, 10000); // 10 second polling

    // Store the interval in the watchers map so we can clear it later
    const watchers = getFileWatchers();
    watchers.set(filePath, {
        close: () => clearInterval(interval),
        isFallback: true
    });
}

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
        getWebSocketService().updateSources(sources);
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
                console.warn(`Blocked attempt to open non-HTTPS URL: ${url}`);
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
                console.warn(`Blocked attempt to open URL to untrusted domain: ${validUrl.hostname}`);
                return { success: false, error: 'Only trusted domains are allowed' };
            }

            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });
}

// IPC Handlers
async function handleOpenFileDialog() {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
}

async function handleSaveFileDialog(_, options = {}) {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result.canceled ? null : result.filePath;
}

async function handleReadFile(_, filePath) {
    return fs.promises.readFile(filePath, 'utf8');
}

async function handleWriteFile(_, filePath, content) {
    return fs.promises.writeFile(filePath, content, 'utf8');
}

// IMPROVED: Enhanced unwatchFile function
async function handleUnwatchFile(_, filePath) {
    const watchers = getFileWatchers();
    if (watchers.has(filePath)) {
        try {
            const watcher = watchers.get(filePath);
            // Check if this is a fallback watcher or regular chokidar watcher
            if (watcher.isFallback) {
                watcher.close(); // This will clear the interval
            } else {
                await watcher.close(); // Regular chokidar close
            }
            watchers.delete(filePath);
            console.log(`Successfully unwatched file: ${filePath}`);
            return true;
        } catch (error) {
            console.error(`Error unwatching file ${filePath}:`, error);
            // Still remove from the map even if there was an error
            watchers.delete(filePath);
            return false;
        }
    }
    return false;
}

function handleGetEnvVariable(_, name) {
    return process.env[name] || `Environment variable '${name}' is not set`;
}

async function handleSaveToStorage(_, filename, content) {
    const storagePath = path.join(app.getPath('userData'), filename);
    return fs.promises.writeFile(storagePath, content, 'utf8');
}

async function handleLoadFromStorage(_, filename) {
    const storagePath = path.join(app.getPath('userData'), filename);
    try {
        const content = await fs.promises.readFile(storagePath, 'utf8');
        // Cache settings if it's the settings file
        if (filename === 'settings.json') {
            try {
                settingsCache = JSON.parse(content);
            } catch (e) {
                console.error('Failed to parse settings for cache:', e);
            }
        }
        return content;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return null; // File doesn't exist yet
        }
        throw err;
    }
}

function handleGetAppPath() {
    return app.getPath('userData');
}

// OPTIMIZATION: Improved HTTP request handling
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

                        resolve(JSON.stringify(response));
                    } catch (err) {
                        reject(new Error(`Failed to process response: ${err.message}`));
                    }
                });
            });

            // Handle errors
            req.on('error', (error) => {
                reject(error);
            });

            // Handle timeout
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timed out after ${requestOptions.timeout}ms`));
            });

            // Send body if present
            if (requestBody) {
                req.write(requestBody);
            }

            req.end();
        } catch (error) {
            reject(error);
        }
    });
}

async function handleSaveSettings(_, settings) {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');

        // Check if we're changing the hideOnLaunch setting
        let oldHideOnLaunch = false;
        try {
            if (fs.existsSync(settingsPath)) {
                const oldData = await fs.promises.readFile(settingsPath, 'utf8');
                const oldSettings = JSON.parse(oldData);
                oldHideOnLaunch = !!oldSettings.hideOnLaunch;
            }
        } catch (err) {
            console.error('Error reading old settings:', err);
        }

        // Save the new settings
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Update settings cache
        settingsCache = settings;

        // Apply settings
        updateTray(settings);

        // If the hideOnLaunch setting changed AND auto-launch is enabled,
        // update the desktop entry on Linux
        const newHideOnLaunch = !!settings.hideOnLaunch;
        if (process.platform === 'linux' &&
            oldHideOnLaunch !== newHideOnLaunch &&
            settings.launchAtLogin) {

            console.log(`hideOnLaunch setting changed from ${oldHideOnLaunch} to ${newHideOnLaunch}. Updating desktop entry.`);

            try {
                const os = require('os');

                // Path to the autostart directory
                const autostartDir = path.join(os.homedir(), '.config', 'autostart');
                const desktopEntryPath = path.join(autostartDir, 'open-headers.desktop');

                // Only update if the desktop entry exists
                if (fs.existsSync(desktopEntryPath)) {
                    // Path to executable
                    const exePath = app.getPath('exe');

                    // Create desktop entry content - only include --hidden if setting is enabled
                    const desktopEntry = `[Desktop Entry]
Type=Application
Name=Open Headers
Comment=Dynamic sources for Open Headers browser extension
Exec="${exePath}" ${newHideOnLaunch ? '--hidden' : ''} --autostart
Icon=open-headers
Terminal=false
Categories=Utility;Development;Network
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;

                    // Write the updated desktop entry file
                    fs.writeFileSync(desktopEntryPath, desktopEntry);
                    console.log(`Updated Linux autostart desktop entry at ${desktopEntryPath} based on new hideOnLaunch setting`);
                }
            } catch (err) {
                console.error('Error updating desktop entry after settings change:', err);
            }
        }

        return { success: true };
    } catch (err) {
        console.error('Error saving settings:', err);
        return { success: false, message: err.message };
    }
}

async function handleGetSettings() {
    try {
        // Use cached settings if available
        if (settingsCache) {
            return settingsCache;
        }

        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const data = await fs.promises.readFile(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            settingsCache = settings; // Cache settings
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
            settingsCache = defaultSettings; // Cache settings
            return defaultSettings;
        }
    } catch (err) {
        console.error('Error getting settings:', err);
        throw err;
    }
}

// Updated auto-launch handler with special Linux support
async function handleSetAutoLaunch(_, enable) {
    // Use platform-specific approach for Linux
    if (process.platform === 'linux') {
        return setupLinuxAutoLaunch(enable);
    }

    // Standard approach for other platforms
    try {
        // First check hideOnLaunch setting
        let hideOnStartup = false;
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settingsData = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);
                hideOnStartup = !!settings.hideOnLaunch;
                console.log(`Auto launch setup: hideOnLaunch setting is ${hideOnStartup}`);
            }
        } catch (settingsErr) {
            console.error('Error reading settings during autolaunch setup:', settingsErr);
        }

        const autoLauncher = new AutoLaunch({
            name: 'Open Headers',
            path: app.getPath('exe'),
            // Only include --hidden if the setting is enabled
            args: hideOnStartup ? ['--hidden', '--autostart'] : ['--autostart']
        });

        if (enable) {
            await autoLauncher.enable();
            console.log(`Auto launch enabled with ${hideOnStartup ? '--hidden and ' : ''}--autostart flags`);
        } else {
            await autoLauncher.disable();
            console.log('Auto launch disabled');
        }

        return { success: true };
    } catch (err) {
        console.error('Error setting auto launch:', err);
        return { success: false, message: err.message };
    }
}