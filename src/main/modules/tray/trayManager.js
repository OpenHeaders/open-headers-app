const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../../utils/mainLogger');
const windowManager = require('../window/windowManager');
const appLifecycle = require('../app/lifecycle');

const log = createLogger('TrayManager');

class TrayManager {
    constructor() {
        this.tray = null;
    }

    createTray() {
        if (this.tray) return;

        try {
            let trayIcon = this.findTrayIcon();
            this.tray = new Tray(trayIcon);
            this.tray.setToolTip('Open Headers');
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'Show Open Headers',
                    click: () => {
                        windowManager.showWindow();
                    }
                },
                {
                    label: 'Hide Open Headers',
                    click: () => {
                        windowManager.hideWindow();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    click: () => {
                        appLifecycle.setQuitting(true);
                        windowManager.sendToWindow('quitApp');
                        app.quit();
                    }
                }
            ]);

            this.tray.setContextMenu(contextMenu);

            // Platform-specific click behavior
            if (process.platform === 'darwin') {
                log.info('macOS tray setup: clicking will only show the menu');
            } else {
                // Windows/Linux: double-click to show app
                this.tray.on('double-click', () => {
                    windowManager.showWindow();
                });
            }

            log.info('Tray icon created successfully');
        } catch (error) {
            log.error('Failed to create tray icon:', error);
            this.createFallbackTray();
        }
    }

    findTrayIcon() {
        let trayIcon = null;

        // Search locations in priority order: dev build, packaged resources, fallbacks
        const iconLocations = process.platform === 'darwin' ? [
            // Renderer template icons (these get copied by webpack)
            path.join(__dirname, 'renderer', 'images', 'iconTemplate.png'),
            path.join(__dirname, 'renderer', 'images', 'iconTemplate@2x.png'),
            // macOS template icons from build dir
            path.join(__dirname, '..', '..', '..', '..', 'build', 'iconTemplate.png'),
            path.join(__dirname, '..', '..', '..', '..', 'build', 'iconTemplate@2x.png'),
            // Fallback to regular icons
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon128.png'),
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon.png'),
            // Renderer assets
            path.join(__dirname, 'renderer', 'images', 'icon32.png'),
            path.join(__dirname, 'renderer', 'images', 'icon128.png'),
            // Production app resources
            path.join(app.getAppPath(), '..', '..', 'Resources', 'iconTemplate.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'iconTemplate@2x.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon128.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon.png'),
            path.join(process.resourcesPath, 'iconTemplate.png'),
            path.join(process.resourcesPath, 'iconTemplate@2x.png'),
            path.join(process.resourcesPath, 'icon128.png'),
            path.join(process.resourcesPath, 'icon.png'),
            // Resource subdirectories
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon32.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon128.png'),
            path.join(process.resourcesPath, 'images', 'icon32.png'),
            path.join(process.resourcesPath, 'images', 'icon128.png')
        ] : [
            // Windows/Linux: regular colored icons
            // Prioritize 64x64 for Windows tray for best quality on high-DPI displays
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon64.png'),
            path.join(__dirname, 'renderer', 'images', 'icon64.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon64.png'),
            path.join(process.resourcesPath, 'icon64.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon64.png'),
            path.join(process.resourcesPath, 'images', 'icon64.png'),
            // Then 32x32 as fallback
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon32.png'),
            path.join(__dirname, 'renderer', 'images', 'icon32.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon32.png'),
            path.join(process.resourcesPath, 'images', 'icon32.png'),
            // Fallback to other sizes
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon128.png'),
            path.join(__dirname, '..', '..', '..', '..', 'build', 'icon.png'),
            path.join(__dirname, 'renderer', 'images', 'icon128.png'),
            // Production app resources
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon128.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'icon.png'),
            path.join(process.resourcesPath, 'icon128.png'),
            path.join(process.resourcesPath, 'icon.png'),
            // Resource subdirectories
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon32.png'),
            path.join(app.getAppPath(), '..', '..', 'Resources', 'images', 'icon128.png'),
            path.join(process.resourcesPath, 'images', 'icon32.png'),
            path.join(process.resourcesPath, 'images', 'icon128.png')
        ];

        for (const location of iconLocations) {
            log.info('Checking icon at:', location);
            if (fs.existsSync(location)) {
                trayIcon = nativeImage.createFromPath(location);
                log.info('Found tray icon at:', location);
                break;
            }
        }

        // Generate fallback icon if no file found
        if (!trayIcon) {
            log.warn('No icon file found, creating basic icon');

            // Embedded base64 icon as last resort
            const iconDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAADxJREFUOBFjYBgFAx0BRkZGRkZLS8v/UH4DA8EAZGZlZP7/r6SkBNeHywBCimEuIKSYKAOIUjwaDcQlIQBu+xIQiOn5+QAAAABJRU5ErkJggg==';

            trayIcon = nativeImage.createFromDataURL(iconDataURL);

            if (process.platform === 'darwin') {
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
                trayIcon.setTemplateImage(true);
            }
        } else {
            // Platform-specific icon sizing and formatting
            if (process.platform === 'darwin') {
                // macOS: 16x16 template icon for proper theme integration
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
                trayIcon.setTemplateImage(true);
            } else if (process.platform === 'win32') {
                // Windows: Use 64x64 icon for best quality on high-DPI displays
                // Windows will automatically scale it down as needed
                // This prevents pixelation on high-DPI screens
                trayIcon = trayIcon.resize({ width: 64, height: 64 });
            } else {
                // Linux: standard 16x16 tray icon
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
            }
        }

        return trayIcon;
    }

    createFallbackTray() {
        try {
            const emptyIcon = nativeImage.createEmpty();
            this.tray = new Tray(emptyIcon);
            this.tray.setToolTip('Open Headers');

            const basicMenu = Menu.buildFromTemplate([
                {
                    label: 'Show App',
                    click: () => {
                        windowManager.showWindow();
                    }
                },
                {
                    label: 'Quit',
                    click: () => {
                        appLifecycle.setQuitting(true);
                        app.quit();
                    }
                }
            ]);
            this.tray.setContextMenu(basicMenu);
            log.info('Created fallback tray with empty icon');
        } catch (fallbackError) {
            log.error('Failed to create basic tray icon:', fallbackError);
        }
    }

    updateTray(settings) {
        if (!settings) return;

        // Normalize settings to prevent type coercion issues
        const showStatusBarIcon = Boolean(settings.showStatusBarIcon);
        const showDockIcon = Boolean(settings.showDockIcon);

        log.info('Updating tray with settings:',
            'showStatusBarIcon =', showStatusBarIcon,
            'showDockIcon =', showDockIcon);

        // Manage system tray icon visibility
        if (this.tray && !showStatusBarIcon) {
            try {
                this.tray.destroy();
                this.tray = null;
                log.info('Status bar icon destroyed');
            } catch (error) {
                log.error('Error destroying tray:', error);
                this.tray = null;
            }
        }

        if (!this.tray && showStatusBarIcon) {
            try {
                this.createTray();
                log.info('Status bar icon created');
            } catch (error) {
                log.error('Error creating tray:', error);
            }
        }

        // macOS dock icon management with window preservation
        if (process.platform === 'darwin') {
            const mainWindow = windowManager.getMainWindow();
            const wasWindowVisible = mainWindow && mainWindow.isVisible();

            if (showDockIcon) {
                log.info('Showing dock icon');
                app.dock.show();
            } else {
                log.info('Hiding dock icon');
                app.dock.hide();

                // Preserve window focus after hiding dock
                // Note: Do NOT call window.show() here as it may cause macOS to re-show the dock
                if (mainWindow && wasWindowVisible) {
                    setTimeout(() => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.focus();
                            log.info('Restored window focus after hiding dock icon');
                        }
                    }, 100);
                }
            }
        }
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

module.exports = new TrayManager();