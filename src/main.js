// main.js - Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const chokidar = require('chokidar');
const AutoLaunch = require('auto-launch');
const webSocketService = require('./services/ws-service');

// Globals
let mainWindow;
const fileWatchers = new Map();
let tray = null;
let isQuitting = false;

// Fix for Electron 18+ where app.getPath('appData') could return /Application Support/open-headers-app
// instead of /Application Support/Open Headers
app.setName('Open Headers');

// Handle dock visibility early for macOS
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
        // Default to showing dock icon on error
    }
}

// Create the browser window
function createWindow() {
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

    // Show window when it's ready to avoid flashing
    mainWindow.once('ready-to-show', () => {
        // Check settings for auto-hide
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

                // Check if this is likely an auto-launch scenario
                const isAutoLaunch = process.argv.includes('--hidden') ||
                    app.getLoginItemSettings().wasOpenedAtLogin ||
                    app.getLoginItemSettings().wasOpenedAsHidden;

                console.log('App launch details:', {
                    hideOnLaunch: settings.hideOnLaunch,
                    isAutoLaunch: isAutoLaunch,
                    argv: process.argv,
                    loginItemSettings: app.getLoginItemSettings()
                });

                // Only hide window if both hideOnLaunch is enabled AND this is an auto-launch
                const shouldHideWindow = settings.hideOnLaunch && isAutoLaunch;

                if (!shouldHideWindow) {
                    console.log('Showing window on startup (manual launch detected)');
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    console.log('Hiding window on startup (auto-launch with hide setting enabled)');
                }
            } else {
                // No settings file exists, show by default
                mainWindow.show();
            }
        } catch (err) {
            console.error('Error loading settings:', err);
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
        console.error('Error loading settings for tray:', err);
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
            console.log('Checking icon at:', location);
            if (fs.existsSync(location)) {
                iconPath = location;
                console.log('Found tray icon at:', iconPath);
                break;
            }
        }

        if (!iconPath) {
            console.warn('No suitable icon found, using fallback path');
            iconPath = path.join(app.getAppPath(), '..', 'build', 'icon16.png');
        }
    } catch (error) {
        console.error('Error determining tray icon path:', error);
        iconPath = path.join(app.getAppPath(), '..', 'build', 'icon.png');
    }

    console.log('Using tray icon path:', iconPath);

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

function updateTray(settings) {
    if (!settings) return;

    console.log('Updating tray with settings:', settings.showStatusBarIcon, 'and dock:', settings.showDockIcon);

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
    // Store whether the window was visible before updating dock
    const wasWindowVisible = mainWindow && mainWindow.isVisible();

    // Update dock visibility on macOS
    if (process.platform === 'darwin') {
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

// App is ready
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Initialize WebSocket service
    const wsPort = 59210;
    webSocketService.initialize(wsPort);

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

// Handle app quit
app.on('before-quit', () => {
    isQuitting = true;

    // Clean up file watchers
    for (const watcher of fileWatchers.values()) {
        watcher.close();
    }

    // Close WebSocket server
    webSocketService.close();
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
        webSocketService.updateSources(sources);
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
                    console.error('Error reading changed file:', err);
                }
            });

            fileWatchers.set(filePath, watcher);
        }

        return content;
    } catch (err) {
        console.error('Error setting up file watch:', err);
        throw err;
    }
}

async function handleUnwatchFile(_, filePath) {
    if (fileWatchers.has(filePath)) {
        const watcher = fileWatchers.get(filePath);
        await watcher.close();
        fileWatchers.delete(filePath);
        return true;
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
        return await fs.promises.readFile(storagePath, 'utf8');
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
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Apply settings
        updateTray(settings);

        return { success: true };
    } catch (err) {
        console.error('Error saving settings:', err);
        return { success: false, message: err.message };
    }
}

async function handleGetSettings() {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const data = await fs.promises.readFile(settingsPath, 'utf8');
            return JSON.parse(data);
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
            return defaultSettings;
        }
    } catch (err) {
        console.error('Error getting settings:', err);
        throw err;
    }
}

async function handleSetAutoLaunch(_, enable) {
    try {
        const autoLauncher = new AutoLaunch({
            name: 'Open Headers',
            path: app.getPath('exe'),
            args: ['--hidden']  // Add this flag to indicate auto-launch
        });

        if (enable) {
            await autoLauncher.enable();
            console.log('Auto launch enabled with --hidden flag');
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