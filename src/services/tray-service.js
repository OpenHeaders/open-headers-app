// tray-service.js - Updated to work in both dev and production modes
const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Service for managing system tray integration
 */
class TrayService {
    /**
     * Create a new TrayService
     * @param {BrowserWindow} window - The main browser window
     */
    constructor(window) {
        this.window = window;
        this.tray = null;
        this.isQuitting = false;

        // Listen for app before-quit to set the quitting flag
        app.on('before-quit', () => {
            console.log('App is quitting, destroying tray');
            this.isQuitting = true;
        });
    }

    /**
     * Create the system tray icon
     */
    createTray() {
        if (this.tray) {
            console.log('Tray already exists');
            return;
        }

        try {
            console.log('Creating system tray icon');

            // Get the appropriate icon path based on the platform
            const iconPath = this._getIconPath();
            console.log('Using icon path:', iconPath);

            let trayIcon;
            // Check if the icon file exists
            if (!fs.existsSync(iconPath)) {
                console.log('Icon not found at path:', iconPath);
                console.log('Trying fallback icons...');

                // Try multiple fallback paths for the icon
                const fallbackPaths = [
                    // Development paths
                    path.join(app.getAppPath(), 'src', 'ui', 'images', 'icon32.png'),
                    path.join(app.getAppPath(), 'src', 'ui', 'images', 'icon128.png'),
                    path.join(__dirname, '..', 'ui', 'images', 'icon32.png'),
                    path.join(__dirname, '..', 'ui', 'images', 'icon128.png'),
                    // Production paths (for packaged app)
                    path.join(process.resourcesPath, 'app.asar', 'src', 'ui', 'images', 'icon32.png'),
                    path.join(process.resourcesPath, 'app.asar', 'src', 'ui', 'images', 'icon128.png'),
                    path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'images', 'icon32.png'),
                    path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'images', 'icon128.png'),
                    // Extra resources path (for production)
                    path.join(process.resourcesPath, 'build', 'icon32.png'),
                    path.join(process.resourcesPath, 'build', 'icon.png')
                ];

                let foundIconPath = null;
                for (const testPath of fallbackPaths) {
                    console.log('Testing icon path:', testPath);
                    if (fs.existsSync(testPath)) {
                        foundIconPath = testPath;
                        console.log('Found icon at:', foundIconPath);
                        break;
                    }
                }

                if (foundIconPath) {
                    console.log('Using fallback icon:', foundIconPath);
                    trayIcon = nativeImage.createFromPath(foundIconPath);
                } else {
                    console.log('No fallback icon found, using empty icon');
                    trayIcon = nativeImage.createEmpty();
                }
            } else {
                // Create a native image from the icon path
                console.log('Using primary icon path:', iconPath);
                trayIcon = nativeImage.createFromPath(iconPath);
            }

            // Resize the icon for the tray (16x16 is recommended for most platforms)
            const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

            // Create the tray instance
            this.tray = new Tray(resizedIcon);

            // Set the tooltip
            this.tray.setToolTip('Open Headers - Dynamic Sources');

            // Create the tray menu
            this._createTrayMenu();

            // Register event listeners for the tray
            this._registerTrayEvents();

            console.log('System tray icon created successfully');
        } catch (error) {
            console.error('Error creating system tray icon:', error);
            // Create a basic tray icon as a last resort
            try {
                console.log('Creating basic tray icon as fallback');
                const emptyIcon = nativeImage.createEmpty();
                this.tray = new Tray(emptyIcon);
                this.tray.setToolTip('Open Headers - Dynamic Sources');
                this._createTrayMenu();
            } catch (fallbackError) {
                console.error('Failed to create basic tray icon:', fallbackError);
            }
        }
    }

    /**
     * Create the tray menu
     * @private
     */
    _createTrayMenu() {
        if (!this.tray) return;

        try {
            const menu = Menu.buildFromTemplate([
                {
                    label: 'Show Application',
                    click: () => {
                        this._showMainWindow();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    click: () => {
                        this.isQuitting = true;
                        app.quit();
                    }
                }
            ]);

            this.tray.setContextMenu(menu);
        } catch (error) {
            console.error('Error creating tray menu:', error);
        }
    }

    /**
     * Register event listeners for the tray
     * @private
     */
    _registerTrayEvents() {
        if (!this.tray) return;

        try {
            // Show app on tray icon click (macOS and Windows behave differently)
            if (process.platform === 'darwin') {
                // On macOS, show on click
                this.tray.on('click', () => {
                    this._showMainWindow();
                });
            } else {
                // On Windows and others, show on double-click
                this.tray.on('double-click', () => {
                    this._showMainWindow();
                });
            }
        } catch (error) {
            console.error('Error registering tray events:', error);
        }
    }

    /**
     * Show the main window
     * @private
     */
    _showMainWindow() {
        if (this.window) {
            try {
                if (this.window.isMinimized()) {
                    this.window.restore();
                }
                if (!this.window.isVisible()) {
                    this.window.show();
                }
                this.window.focus();

                // Notify renderer that app was shown from tray
                if (this.window.webContents) {
                    this.window.webContents.send('showApp');
                }
            } catch (error) {
                console.error('Error showing main window:', error);
            }
        }
    }

    /**
     * Get the appropriate icon path based on the platform
     * @private
     * @returns {string} Path to the icon file
     */
    _getIconPath() {
        try {
            // Determine if we're in development or production mode
            const isDev = process.argv.includes('--dev') || process.defaultApp;
            const isPacked = !process.defaultApp;
            console.log('Environment:', {
                isDev: isDev,
                isPacked: isPacked,
                resourcesPath: process.resourcesPath,
                appPath: app.getAppPath()
            });

            // Check multiple possible icon locations
            const iconLocations = [];

            // First try app.asar paths for production
            if (isPacked) {
                // Production paths
                iconLocations.push(
                    path.join(process.resourcesPath, 'build', 'icon32.png'),
                    path.join(process.resourcesPath, 'build', 'icon.png'),
                    path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'ui', 'images', 'icon32.png'),
                    path.join(process.resourcesPath, 'app.asar', 'src', 'ui', 'images', 'icon32.png')
                );
            }

            // Then try development paths
            iconLocations.push(
                path.join(app.getAppPath(), 'build', 'icon32.png'),
                path.join(app.getAppPath(), 'src', 'ui', 'images', 'icon32.png'),
                path.join(__dirname, '..', 'ui', 'images', 'icon32.png')
            );

            // Try to find an existing icon
            for (const location of iconLocations) {
                console.log('Checking icon at:', location);
                if (fs.existsSync(location)) {
                    console.log('Found icon at:', location);
                    return location;
                }
            }

            // If no icon found, return the first path as default
            return iconLocations[0];
        } catch (error) {
            console.error('Error determining icon path:', error);
            // Return a fallback path
            return path.join(app.getAppPath(), 'src', 'ui', 'images', 'icon32.png');
        }
    }

    /**
     * Destroy the system tray icon
     */
    destroyTray() {
        if (this.tray) {
            try {
                this.tray.destroy();
                this.tray = null;
                console.log('System tray icon destroyed');
            } catch (error) {
                console.error('Error destroying tray:', error);
            }
        }
    }

    /**
     * Hide the main window to the tray
     */
    minimizeToTray() {
        if (this.window && !this.isQuitting) {
            try {
                console.log('Minimizing to system tray');
                this.window.hide();
            } catch (error) {
                console.error('Error minimizing to tray:', error);
            }
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        try {
            this.destroyTray();
        } catch (error) {
            console.error('Error disposing tray service:', error);
        }
    }
}

module.exports = TrayService;