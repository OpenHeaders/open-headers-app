// main.js - Application Entry Point
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Set app name programmatically (this works for development mode)
app.name = "Open Headers - Dynamic Sources";
// You could also try:
// app.setName("Open Headers - Dynamic Sources");

// Global references
let mainWindow;
let sourceService;
let wsController;
let sourceController;
let trayService; // Added for tray functionality
let settingsController; // Added for settings management

// Command line arguments parsing
const parseArgs = () => {
    const args = {
        headless: false,
        configFile: null,
        dev: false
    };

    for (let i = 0; i < process.argv.length; i++) {
        const arg = process.argv[i];

        if (arg === '--headless') {
            args.headless = true;
        } else if (arg === '--config' && i + 1 < process.argv.length) {
            args.configFile = process.argv[i + 1];
            i++; // Skip the next argument as it's the value
        } else if (arg === '--dev') {
            args.dev = true;
        }
    }

    return args;
};

const appArgs = parseArgs();

// Add this function to ensure the dock icon is set properly in macOS
function setMacOSDockIcon() {
    if (process.platform === 'darwin') {
        try {
            // Check possible icon paths in order of preference - prioritize the path that works for tray
            const iconPaths = [
                path.join(__dirname, 'src/ui/images/icon128.png'), // This one seems to exist
                path.join(__dirname, 'src/ui/images/icon32.png'),  // This one seems to exist for tray
                path.join(app.getAppPath(), 'src/ui/images/icon128.png'),
                path.join(app.getAppPath(), 'src/ui/images/icon32.png'),
                path.join(__dirname, 'build/icon.icns'),
                path.join(__dirname, 'build/icon128.png'),
                path.join(app.getAppPath(), 'build/icon.icns'),
                path.join(app.getAppPath(), 'build/icon128.png')
            ];

            // Find the first icon that exists
            let iconPath = null;
            for (const testPath of iconPaths) {
                console.log('Testing icon path:', testPath);
                if (fs.existsSync(testPath)) {
                    iconPath = testPath;
                    console.log('Found icon at:', iconPath);
                    break;
                }
            }

            if (iconPath) {
                console.log('Setting dock icon to:', iconPath);
                app.dock.setIcon(iconPath);
            } else {
                console.warn('No suitable icon found for dock');
            }
        } catch (error) {
            console.error('Error setting dock icon:', error);
        }
    }
}

/**
 * Creates the main application window
 */
function createWindow() {
    // Load config first to avoid circular dependencies
    const appConfig = require('./src/config/app-config');

    mainWindow = new BrowserWindow({
        width: appConfig.window.width,
        height: appConfig.window.height,
        webPreferences: {
            preload: path.join(__dirname, 'src/preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        show: false // Don't show until ready-to-show
    });

    // Show window when it's ready to avoid flashing
    mainWindow.once('ready-to-show', () => {
        // Check if we should hide at launch based on settings
        const shouldHide = settingsController && settingsController.shouldHideOnLaunch();

        if (!shouldHide) {
            console.log('Showing window at startup (not configured to hide)');
            mainWindow.show();
        } else {
            console.log('Hiding window at startup (configured to hide)');
            // Window stays hidden
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));

    mainWindow.on('close', (event) => {
        if (!appConfig.app.isQuitting) {
            event.preventDefault();
            // Hide instead of closing if tray is active
            if (trayService && settingsController && settingsController.getSettings().showStatusBarIcon) {
                trayService.minimizeToTray();
            } else {
                mainWindow.hide();
            }
        }
    });

    // Handle minimize to tray
    ipcMain.on('minimizeToTray', () => {
        if (trayService) {
            trayService.minimizeToTray();
        }
    });

    // Debug: Only in dev mode
    if (appArgs.dev) {
        mainWindow.webContents.openDevTools();
    }

    return mainWindow;
}

/**
 * Initialize application services and controllers
 * @param {BrowserWindow} window - The main application window (or null in headless mode)
 * @param {Object} options - Initialization options
 * @param {boolean} options.headless - Whether the app is running in headless mode
 * @param {string} options.configFile - Path to a config file to load
 */
async function initializeApp(window, options = {}) {
    try {
        // Since we're using require for modules, we need to load them here
        // to avoid circular dependencies
        const SourceService = require('./src/services/source-service');
        const SourceController = require('./src/controllers/source-controller');
        const WsController = require('./src/controllers/ws-controller');
        const SourceRepository = require('./src/repositories/source-repository');
        const TrayService = require('./src/services/tray-service'); // Added
        const SettingsController = require('./src/controllers/settings-controller'); // Added

        console.log('Initializing services...');
        console.log('Running mode:', options.headless ? 'Headless' : 'GUI');

        if (options.configFile) {
            console.log('Config file specified:', options.configFile);
        }

        // Initialize services
        // Only create a new instance if it doesn't exist already
        if (!sourceService) {
            sourceService = new SourceService();
            console.log('Source service created');
        }

        // Initialize WebSocket controller first (needed in both modes)
        if (!wsController) {
            wsController = new WsController(sourceService);
            console.log('WebSocket controller created');
        }

        // Initialize tray service (only in GUI mode)
        if (!options.headless && window && !trayService) {
            trayService = new TrayService(window);
            console.log('Tray service created');
        }

        // Initialize settings controller (only in GUI mode)
        if (!options.headless && window && !settingsController) {
            settingsController = new SettingsController(window, trayService);
            console.log('Settings controller created');
        }

        // Initialize the source controller only in GUI mode
        if (!options.headless && window && !sourceController) {
            sourceController = new SourceController(window, sourceService);
            console.log('Source controller created');
        }

        console.log('Controllers initialized');

        // Initialize the source service
        await sourceService.initialize();
        console.log('Source service initialized');

        // If config file is specified, load it
        if (options.configFile) {
            await loadConfigFile(options.configFile);
        }

        // Set up event to send sources when the window is ready (only in GUI mode)
        if (!options.headless && window) {
            window.webContents.on('did-finish-load', () => {
                const sources = sourceService.getAllSources();
                console.log(`Sending ${sources.length} sources to renderer`);
                window.webContents.send('initialSources', sources);
            });
        }
    } catch (err) {
        console.error('Error initializing application:', err);
    }
}

/**
 * Load sources from a config file
 * @param {string} configFilePath - Path to the config file
 */
async function loadConfigFile(configFilePath) {
    try {
        console.log(`Loading config from file: ${configFilePath}`);

        if (!fs.existsSync(configFilePath)) {
            console.error(`Config file not found: ${configFilePath}`);
            return;
        }

        const fileContent = fs.readFileSync(configFilePath, 'utf8');
        let importedSources;

        try {
            importedSources = JSON.parse(fileContent);
        } catch (parseError) {
            console.error('Error parsing config file:', parseError);
            return;
        }

        if (!Array.isArray(importedSources)) {
            console.error('Invalid config file format: not an array');
            return;
        }

        console.log(`Found ${importedSources.length} sources in config file`);

        // Import each source
        for (const sourceData of importedSources) {
            try {
                await sourceService.importSource(sourceData);
            } catch (importError) {
                console.error(`Error importing source: ${importError.message}`);
            }
        }

        console.log('Config file loaded successfully');
    } catch (error) {
        console.error('Error loading config file:', error);
    }
}

// App initialization
app.whenReady().then(async () => {
    try {
        // On macOS, ensure the dock icon setting is applied before showing UI
        if (process.platform === 'darwin') {
            // Start with the dock icon visible (will be hidden by settings controller if needed)
            setMacOSDockIcon();
        }

        if (appArgs.headless) {
            console.log('Starting in headless mode...');
            await initializeApp(null, {
                headless: true,
                configFile: appArgs.configFile
            });

            if (!appArgs.configFile) {
                console.log('Warning: No config file specified in headless mode. Use --config <file> to specify one.');
            }
        } else {
            console.log('Starting in GUI mode...');
            const window = createWindow();
            await initializeApp(window, {
                headless: false,
                configFile: appArgs.configFile
            });

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    createWindow();
                } else if (mainWindow) {
                    mainWindow.show();
                }
            });
        }
    } catch (err) {
        console.error('Error during app initialization:', err);
    }
});

// Handle app lifecycle events
app.on('before-quit', async () => {
    try {
        // Load config
        const appConfig = require('./src/config/app-config');
        appConfig.app.isQuitting = true;

        // Clean up resources
        if (sourceService && typeof sourceService.dispose === 'function') {
            console.log('Disposing source service...');
            await sourceService.dispose();
            console.log('Source service disposed');
        }

        if (wsController && typeof wsController.close === 'function') {
            console.log('Closing WebSocket controller...');
            wsController.close();
            console.log('WebSocket controller closed');
        }

        // Clean up tray resources
        if (trayService && typeof trayService.dispose === 'function') {
            console.log('Disposing tray service...');
            trayService.dispose();
            console.log('Tray service disposed');
        }
    } catch (err) {
        console.error('Error during app cleanup:', err);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});