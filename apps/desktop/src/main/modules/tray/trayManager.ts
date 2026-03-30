import fs from 'node:fs';
import path from 'node:path';
import type { MenuItemConstructorOptions, NativeImage, Tray as TrayType } from 'electron';
import electron from 'electron';
import mainLogger from '../../../utils/mainLogger';
import appLifecycle from '../app/lifecycle';
import windowManager from '../window/windowManager';

const { Tray, Menu, app, nativeImage } = electron;
const { createLogger } = mainLogger;
const log = createLogger('TrayManager');

type UpdateMenuState = 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';

class TrayManager {
  tray: TrayType | null;
  private updateState: UpdateMenuState = 'idle';
  private updateVersion: string | null = null;
  private downloadPercent = 0;
  private upToDateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.tray = null;
  }

  createTray() {
    if (this.tray) return;

    try {
      const trayIcon = this.findTrayIcon();
      this.tray = new Tray(trayIcon);
      this.tray.setToolTip('Open Headers');
      this.rebuildContextMenu();

      // Platform-specific click behavior
      if (process.platform === 'darwin') {
        log.info('macOS tray setup: clicking will only show the menu');
      } else {
        // Windows/Linux: single click toggles window visibility
        this.tray.on('click', () => {
          const mainWindow = windowManager.getMainWindow();
          if (mainWindow?.isVisible()) {
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

  private getUpdateMenuItem(): MenuItemConstructorOptions {
    switch (this.updateState) {
      case 'checking':
        return { label: 'Checking for Updates...', enabled: false };
      case 'downloading':
        return { label: `Processing Update... (${this.downloadPercent}%)`, enabled: false };
      case 'ready':
        return {
          label: this.updateVersion ? `Restart to Update (v${this.updateVersion})` : 'Restart to Update',
          click: async () => {
            const autoUpdaterManager = (await import('../updater/autoUpdater')).default;
            autoUpdaterManager.installUpdate();
          },
        };
      case 'up-to-date':
        return { label: "You're Up to Date", enabled: false };
      case 'error':
        return { label: 'Update Check Failed', enabled: false };
      default:
        return {
          label: 'Check for Updates...',
          click: async () => {
            const autoUpdaterManager = (await import('../updater/autoUpdater')).default;
            autoUpdaterManager.checkForUpdatesManual(true);
          },
        };
    }
  }

  private rebuildContextMenu() {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Open Headers',
        click: () => windowManager.showWindow(),
      },
      {
        label: 'Hide Open Headers',
        click: () => windowManager.hideWindow(),
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          windowManager.showWindow();
          windowManager.sendToWindow('navigate-to', { tab: 'settings' });
        },
      },
      this.getUpdateMenuItem(),
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          appLifecycle.setQuitting(true);
          windowManager.sendToWindow('quitApp');
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Update the tray menu's update status item.
   * Called by AutoUpdaterManager during the update lifecycle.
   */
  setUpdateState(state: UpdateMenuState, info?: { version?: string; percent?: number }) {
    if (this.upToDateTimer) {
      clearTimeout(this.upToDateTimer);
      this.upToDateTimer = null;
    }

    this.updateState = state;
    if (info?.version) this.updateVersion = info.version;
    if (info?.percent !== undefined) this.downloadPercent = Math.round(info.percent);

    this.rebuildContextMenu();

    // Transient states revert to idle after 5 seconds
    if (state === 'up-to-date' || state === 'error') {
      this.upToDateTimer = setTimeout(() => {
        this.updateState = 'idle';
        this.rebuildContextMenu();
        this.upToDateTimer = null;
      }, 5000);
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
      const iconDataURL =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAALEwAACxMBAJqcGAAAADxJREFUOBFjYBgFAx0BRkZGRkZLS8v/UH4DA8EAZGZlZP7/r6SkBNeHywBCimEuIKSYKAOIUjwaDcQlIQBu+xIQiOn5+QAAAABJRU5ErkJggg==';
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
          },
        },
        {
          label: 'Quit',
          click: () => {
            appLifecycle.setQuitting(true);
            app.quit();
          },
        },
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
      const wasWindowVisible = mainWindow?.isVisible();

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
    if (this.upToDateTimer) {
      clearTimeout(this.upToDateTimer);
      this.upToDateTimer = null;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

const trayManager = new TrayManager();

export { TrayManager };
export default trayManager;
