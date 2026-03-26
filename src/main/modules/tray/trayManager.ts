import electron from 'electron';
import type { Tray as TrayType, NativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import mainLogger from '../../../utils/mainLogger';
import windowManager from '../window/windowManager';
import appLifecycle from '../app/lifecycle';

const { Tray, Menu, app, nativeImage } = electron;
const { createLogger } = mainLogger;
const log = createLogger('TrayManager');

class TrayManager {
    tray: TrayType | null;

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
                    label: 'Settings',
                    click: () => {
                        windowManager.showWindow();
                        windowManager.sendToWindow('navigate-to', { tab: 'settings' });
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
                // Windows/Linux: single click toggles window visibility
                this.tray.on('click', () => {
                    const mainWindow = windowManager.getMainWindow();
                    if (mainWindow && mainWindow.isVisible()) {
                        windowManager.hideWindow();
                    } else {
                        windowManager.showWindow();
                    }
                });
            }

            log.info('Tray icon created successfully');
        } catch (error) {
            log.error('Failed to create tray icon:', error);
            this.createFallbackTray();
        }
    }

    findTrayIcon() {
        let trayIcon: NativeImage | null = null;

        // Direct platform-specific lookup — we control the build layout,
        // so only check the paths that actually matter (packaged vs dev).
        const isMac = process.platform === 'darwin';
        const iconName = isMac ? 'iconTemplate.png' : 'icon64.png';

        // Prioritized locations: packaged resources first, then dev/build paths
        const iconLocations = [
            path.join(process.resourcesPath, iconName),
            path.join(process.resourcesPath, 'images', iconName),
            path.join(__dirname, '../renderer', 'images', iconName),
            path.join(__dirname, '..', '..', 'build', iconName),
            // Fallback to generic icon names
            path.join(process.resourcesPath, 'icon128.png'),
            path.join(__dirname, '../renderer', 'images', 'icon128.png'),
            path.join(__dirname, '..', '..', 'build', 'icon128.png'),
        ];

        for (const location of iconLocations) {
            if (fs.existsSync(location)) {
                trayIcon = nativeImage.createFromPath(location);
                log.debug('Found tray icon at:', location);
                break;
            }
        }

        if (!trayIcon) {
            log.warn('No icon file found, creating basic icon');
            const iconDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAADxJREFUOBFjYBgFAx0BRkZGRkZLS8v/UH4DA8EAZGZlZP7/r6SkBNeHywBCimEuIKSYKAOIUjwaDcQlIQBu+xIQiOn5+QAAAABJRU5ErkJggg==';
            trayIcon = nativeImage.createFromDataURL(iconDataURL);
        }

        // Platform-specific sizing
        if (isMac) {
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
            trayIcon.setTemplateImage(true);
        } else if (process.platform === 'win32') {
            trayIcon = trayIcon.resize({ width: 64, height: 64 });
        } else {
            trayIcon = trayIcon.resize({ width: 16, height: 16 });
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

    updateTray(settings: { showStatusBarIcon?: boolean; showDockIcon?: boolean }) {
        if (!settings) return;

        // Normalize settings to prevent type coercion issues
        const showStatusBarIcon = Boolean(settings.showStatusBarIcon);
        const showDockIcon = Boolean(settings.showDockIcon);

        log.info(`Updating tray with settings: showStatusBarIcon=${showStatusBarIcon}, showDockIcon=${showDockIcon}`);

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
                app.dock?.show();
            } else {
                log.info('Hiding dock icon');
                app.dock?.hide();

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

const trayManager = new TrayManager();
export { TrayManager };
export default trayManager;
