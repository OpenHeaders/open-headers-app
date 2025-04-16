// settings-controller.js - Controller for application settings
const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const appConfig = require('../config/app-config');
const AutoLaunch = require('auto-launch');

/**
 * Controller for managing application settings
 */
class SettingsController {
    /**
     * Create a new SettingsController
     * @param {BrowserWindow} window - The main browser window
     * @param {TrayService} trayService - The tray service
     */
    constructor(window, trayService) {
        this.window = window;
        this.trayService = trayService;
        this.settingsPath = path.join(app.getPath('userData'), 'settings.json');

        // Default settings
        this.settings = {
            launchAtLogin: false,
            hideOnLaunch: false,
            showDockIcon: true,
            showStatusBarIcon: true
        };

        // Initialize auto-launcher
        this.autoLauncher = new AutoLaunch({
            name: 'Open Headers',
            path: app.getPath('exe'),
            isHidden: false // Start visible by default
        });

        // Load settings
        this._loadSettings();

        // Register IPC handlers
        this._registerIpcHandlers();

        // Apply initial settings
        this._applySettings();
    }

    /**
     * Register IPC event handlers for settings
     * @private
     */
    _registerIpcHandlers() {
        // Get current settings
        ipcMain.handle('getSettings', () => {
            return this.settings;
        });

        // Save settings
        ipcMain.handle('saveSettings', async (event, newSettings) => {
            try {
                console.log('Saving new settings:', newSettings);

                // Update settings
                this.settings = {
                    ...this.settings,
                    ...newSettings
                };

                // Save to disk
                await this._saveSettings();

                // Apply the new settings
                this._applySettings();

                return { success: true };
            } catch (error) {
                console.error('Error saving settings:', error);
                return { success: false, message: error.message };
            }
        });
    }

    /**
     * Load settings from disk
     * @private
     */
    _loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                const loadedSettings = JSON.parse(data);

                // Merge with default settings (to ensure we have all required fields)
                this.settings = {
                    ...this.settings,
                    ...loadedSettings
                };

                console.log('Settings loaded:', this.settings);
            } else {
                console.log('No settings file found, using defaults');
                this._saveSettings(); // Create the default settings file
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    /**
     * Save settings to disk
     * @private
     */
    async _saveSettings() {
        try {
            const data = JSON.stringify(this.settings, null, 2);
            await fs.promises.writeFile(this.settingsPath, data, 'utf8');
            console.log('Settings saved to disk');
            return true;
        } catch (error) {
            console.error('Error saving settings to disk:', error);
            throw error;
        }
    }

    /**
     * Apply current settings to the application
     * @private
     */
    _applySettings() {
        try {
            console.log('Applying settings:', this.settings);

            // Handle auto-launch cross-platform using the auto-launch package
            if (this.settings.launchAtLogin) {
                // Create a new instance with updated hidden setting
                this.autoLauncher = new AutoLaunch({
                    name: 'Open Headers',
                    path: app.getPath('exe'),
                    isHidden: this.settings.hideOnLaunch
                });

                this.autoLauncher.enable().then(() => {
                    console.log('Auto-launch enabled');
                }).catch(err => {
                    console.error('Error enabling auto-launch:', err);
                });
            } else {
                this.autoLauncher.disable().then(() => {
                    console.log('Auto-launch disabled');
                }).catch(err => {
                    console.error('Error disabling auto-launch:', err);
                });
            }

            // Apply tray icon setting if tray service exists
            if (this.trayService) {
                if (this.settings.showStatusBarIcon) {
                    this.trayService.createTray();
                } else {
                    this.trayService.destroyTray();
                }
            }

            // Apply dock icon setting (macOS only)
            if (process.platform === 'darwin') {
                if (this.settings.showDockIcon) {
                    // First make sure app name is set properly
                    app.setName("Open Headers - Dynamic Sources");

                    // Show the dock
                    app.dock.show();

                    // Set the dock icon
                    this._setDockIcon();
                } else {
                    app.dock.hide();
                }
            }

            console.log('Settings applied successfully');
        } catch (error) {
            console.error('Error applying settings:', error);
        }
    }

    /**
     * Check if the window should be hidden on launch
     * @returns {boolean} True if window should be hidden on launch
     */
    shouldHideOnLaunch() {
        try {
            // If settings specify to hide on launch
            return this.settings && this.settings.hideOnLaunch === true;
        } catch (error) {
            console.error('Error checking hide on launch setting:', error);
            return false; // Default to showing the window if there's an error
        }
    }

    /**
     * Set the dock icon for macOS more forcefully
     * @private
     */
    _setDockIcon() {
        if (process.platform !== 'darwin') return;

        try {
            const iconPaths = [
                path.join(app.getAppPath(), 'src/ui/images/icon128.png'),
                path.join(app.getAppPath(), 'src/ui/images/icon32.png'),
                path.join(__dirname, '../src/ui/images/icon128.png'),
                path.join(__dirname, '../src/ui/images/icon32.png')
            ];

            // Find the first icon that exists
            let iconPath = null;
            for (const testPath of iconPaths) {
                console.log('Testing dock icon path:', testPath);
                if (fs.existsSync(testPath)) {
                    iconPath = testPath;
                    console.log('Found dock icon at:', iconPath);
                    break;
                }
            }

            if (iconPath) {
                console.log('Setting dock icon to:', iconPath);

                // Read the icon file
                const iconData = fs.readFileSync(iconPath);

                // Create a new icon from the file data
                const nativeImage = require('electron').nativeImage;
                const icon = nativeImage.createFromBuffer(iconData);

                // Set the dock icon
                app.dock.setIcon(icon);

                // Another attempt with path
                app.dock.setIcon(iconPath);

                console.log('Dock icon set successfully');
            } else {
                console.warn('No suitable icon found for dock');
            }
        } catch (error) {
            console.error('Error setting dock icon:', error);
        }
    }

    /**
     * Get the current settings
     * @returns {Object} Current settings
     */
    getSettings() {
        return { ...this.settings };
    }
}

module.exports = SettingsController;