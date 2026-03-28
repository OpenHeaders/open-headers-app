import { autoUpdater } from 'electron-updater';
import electron from 'electron';
import mainLogger from '../../../utils/mainLogger';
import networkService from '../../../services/network/NetworkService';
import windowManager from '../window/windowManager';
import settingsCache from '../../../services/core/SettingsCache';
import trayManager from '../tray/trayManager';
import { errorMessage, toErrno } from '../../../types/common';
import type { AppSettings } from '../../../types/settings';
const { app, dialog } = electron;
const { createLogger } = mainLogger;
const log = createLogger('AutoUpdater');

// Use electron-updater's own types instead of redeclaring
import type { UpdateInfo, UpdateDownloadedEvent } from 'electron-updater';

interface DownloadProgress {
    bytesPerSecond: number;
    percent: number;
    total: number;
    transferred: number;
}

class AutoUpdaterManager {
    updateCheckInProgress: boolean;
    updateDownloadInProgress: boolean;
    updateDownloaded: boolean;
    downloadedUpdateInfo: UpdateDownloadedEvent | null;
    networkErrorRetryTimer: ReturnType<typeof setTimeout> | null;
    scheduledCheckTimer: ReturnType<typeof setInterval> | null;
    NETWORK_RETRY_INTERVAL: number;
    CHECK_INTERVAL: number;

    constructor() {
        // State tracking variables
        this.updateCheckInProgress = false;
        this.updateDownloadInProgress = false;
        this.updateDownloaded = false;
        this.downloadedUpdateInfo = null; // Store downloaded update info for later retrieval
        this.networkErrorRetryTimer = null;
        this.scheduledCheckTimer = null;
        this.NETWORK_RETRY_INTERVAL = 15 * 60 * 1000; // 15 minutes
        this.CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    }

    setupAutoUpdater() {
        // Configure logging to filter electron-updater verbose output
        autoUpdater.logger = {
            info: (...args: unknown[]) => log.info('[AutoUpdater]', ...args),
            warn: (...args: unknown[]) => log.warn('[AutoUpdater]', ...args),
            error: (...args: unknown[]) => log.error('[AutoUpdater]', ...args),
            debug: () => {}
        } as typeof autoUpdater.logger;
        autoUpdater.allowDowngrade = false;
        // Disable electron-updater's built-in auto-install-on-quit.
        // It spawns the NSIS installer during before-quit BEFORE our async
        // server cleanup finishes, causing EADDRINUSE on Windows.
        // We handle update installation ourselves in main.js's before-quit handler,
        // AFTER servers are properly closed.
        autoUpdater.autoInstallOnAppQuit = false;

        // Apply user settings (autoUpdate + updateChannel)
        const settings = settingsCache.get();
        this.applyUpdateSettings(settings);

        this.logAppInfo();
        this.setupEventListeners();
        this.scheduleUpdates();
    }

    /**
     * Apply update-related settings to electron-updater.
     * Called on startup and when the user changes settings.
     */
    applyUpdateSettings(settings: AppSettings) {
        // If the running app is a beta, force allowPrerelease so electron-updater
        // sees the current beta release on GitHub. Without this, it skips the beta
        // release, finds an older stable, and triggers a channel-mismatch downgrade.
        // The user naturally upgrades to stable when it ships (4.0.0 > 4.0.0-beta.N).
        const isRunningBeta = app.getVersion().includes('-beta.');
        autoUpdater.autoDownload = settings.autoUpdate !== false;
        autoUpdater.allowPrerelease = settings.updateChannel === 'beta' || isRunningBeta;
        log.info(`Update settings applied: autoUpdate=${settings.autoUpdate}, allowPrerelease=${autoUpdater.allowPrerelease}, runningBeta=${isRunningBeta}`);
    }

    logAppInfo() {
        // Force updates in development mode for testing
        if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
            autoUpdater.forceDevUpdateConfig = true;
        }
    }

    setupEventListeners() {
        autoUpdater.on('checking-for-update', () => {
            this.updateCheckInProgress = true;
            trayManager.setUpdateState('checking');
        });

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            this.updateCheckInProgress = false;
            this.updateDownloadInProgress = true;
            trayManager.setUpdateState('downloading', { version: info.version, percent: 0 });

            windowManager.sendToWindow('update-available', info);
        });

        autoUpdater.on('update-not-available', (info: UpdateInfo) => {
            this.updateCheckInProgress = false;
            trayManager.setUpdateState('up-to-date');

            windowManager.sendToWindow('update-not-available', info);
            windowManager.sendToWindow('clear-update-checking-notification');
        });

        autoUpdater.on('download-progress', (progressObj: DownloadProgress) => {
            this.updateDownloadInProgress = true;
            trayManager.setUpdateState('downloading', { percent: progressObj.percent });
            windowManager.sendToWindow('update-progress', progressObj);
        });

        autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
            this.updateDownloadInProgress = false;
            this.updateDownloaded = true;
            this.downloadedUpdateInfo = info;
            trayManager.setUpdateState('ready', { version: info.version });

            windowManager.sendToWindow('update-downloaded', info);
        });

        autoUpdater.on('error', (err: Error) => {
            this.handleUpdateError(err);
        });
    }

    handleUpdateError(err: Error) {
        const isNetworkError = err.message && (
            err.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
            err.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
            err.message.includes('net::ERR_CONNECTION_REFUSED')
        );

        if (isNetworkError) {
            // Network error - silently handle
        } else {
            log.error('Error in auto-updater:', err);
        }

        // Reset all states on error
        this.updateCheckInProgress = false;
        this.updateDownloadInProgress = false;
        trayManager.setUpdateState('idle');

        // Always send clear notification event on error
        windowManager.sendToWindow('clear-update-checking-notification');

        if (isNetworkError) {
            this.scheduleNetworkRetry();
        } else {
            // Only send non-network errors to renderer
            windowManager.sendToWindow('update-error', err.message);
        }

        // Better logging for specific signature errors
        if (err.message.includes('code signature')) {
            log.error('Code signature validation error details:', {
                message: err.message,
                code: toErrno(err).code,
                errno: toErrno(err).errno
            });
        }
    }

    scheduleNetworkRetry() {
        // Clear any existing retry timer
        if (this.networkErrorRetryTimer) {
            clearTimeout(this.networkErrorRetryTimer);
        }

        this.networkErrorRetryTimer = setTimeout(() => {
            if (!this.updateCheckInProgress && !this.updateDownloadInProgress) {
                autoUpdater.checkForUpdates().catch((err: Error) => {
                    log.error('Retry update check failed:', err);
                });
            }
            this.networkErrorRetryTimer = null;
        }, this.NETWORK_RETRY_INTERVAL);

        windowManager.sendToWindow('clear-update-checking-notification');
    }

    scheduleUpdates() {
        const settings = settingsCache.get();
        if (settings.autoUpdate === false) {
            log.info('Auto-update disabled, skipping scheduled checks');
            return;
        }

        // Check for updates on startup (with delay)
        setTimeout(() => {
            this.checkForUpdates();
        }, 3000);

        // Set up periodic update checks
        this.scheduledCheckTimer = setInterval(() => {
            this.checkForUpdates();
        }, this.CHECK_INTERVAL);
    }

    checkForUpdates() {
        // Check network state before attempting update
        const networkState = networkService.getState();
        if (!networkState.isOnline) {
            return;
        }

        const channel = autoUpdater.allowPrerelease ? 'beta' : 'production';
        log.info(`Checking for updates (channel: ${channel})`);

        // Check if we're already checking or downloading
        if (this.updateCheckInProgress || this.updateDownloadInProgress) {
            return;
        }
        autoUpdater.checkForUpdatesAndNotify()
            .catch((err: Error) => {
                const isNetworkError = err.message && (
                    err.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
                    err.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
                    err.message.includes('net::ERR_CONNECTION_REFUSED')
                );

                if (isNetworkError) {
                    // Network error - silently handle
                } else {
                    log.error('Error in update check:', err);
                }
            });
    }

    /**
     * Trigger an update check with user feedback control.
     * Pure business logic — no IPC dependency. Can be called from
     * IPC handlers, app menu, tray menu, or any other context.
     */
    checkForUpdatesManual(isManual = true) {
        // Check network state
        const networkState = networkService.getState();
        if (!networkState.isOnline) {
            windowManager.sendToWindow('update-check-network-offline');
            return;
        }

        // Check if update already downloaded
        if (this.updateDownloaded) {
            windowManager.sendToWindow('update-already-downloaded', {
                isManual,
                info: this.downloadedUpdateInfo
            });
            return;
        }

        // Skip if already checking or downloading
        if (this.updateCheckInProgress || this.updateDownloadInProgress) {
            windowManager.sendToWindow('update-check-already-in-progress');
            return;
        }

        this.updateCheckInProgress = true;

        try {
            autoUpdater.checkForUpdates()
                .catch((error: Error) => {
                    const isNetworkError = error.message && (
                        error.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
                        error.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
                        error.message.includes('net::ERR_CONNECTION_REFUSED')
                    );

                    if (isNetworkError) {
                        // Network error - silently handle
                    } else {
                        log.error('autoUpdater.checkForUpdates() failed:', error);
                    }

                    this.updateCheckInProgress = false;
                    windowManager.sendToWindow('clear-update-checking-notification');

                    if (isManual) {
                        windowManager.sendToWindow('update-error', error.message || 'Update check failed');
                    }
                })
                .finally(() => {
                    // Reset flag when check is complete
                    setTimeout(() => {
                        if (this.updateCheckInProgress) {
                            this.updateCheckInProgress = false;
                            windowManager.sendToWindow('clear-update-checking-notification');
                        }
                    }, 10000); // 10 second timeout as a failsafe
                });
        } catch (err: unknown) {
            this.updateCheckInProgress = false;
            log.error('Error calling checkForUpdates:', err);
            windowManager.sendToWindow('clear-update-checking-notification');

            if (isManual) {
                windowManager.sendToWindow('update-error', errorMessage(err));
            }
        }
    }

    /**
     * IPC handler for update checks from the renderer.
     * Thin transport layer — delegates to checkForUpdatesManual().
     */
    handleManualUpdateCheck(_event: Electron.IpcMainEvent, isManual: boolean) {
        this.checkForUpdatesManual(isManual);
    }

    async installUpdate() {
        const appLifecycle = (await import('../app/lifecycle')).default;
        appLifecycle.setQuitting(true);
        this.updateDownloaded = false;
        this.downloadedUpdateInfo = null;

        try {
            // Close all servers BEFORE spawning the installer.
            // On Windows, NSIS with runAfterFinish:true starts the new process
            // immediately after install — if the old process still holds ports,
            // the new process gets EADDRINUSE and the browser extension can't connect.
            log.info('Performing pre-update server cleanup...');
            await appLifecycle.beforeQuit();
            log.info('Pre-update cleanup complete, installing update');

            autoUpdater.quitAndInstall(false, true);

            // Backup: force exit if quitAndInstall doesn't exit.
            // Longer timeout since cleanup is already done above.
            setTimeout(() => {
                app.exit(0);
            }, 3000);
        } catch (error: unknown) {
            log.error('Failed to install update:', error);
            this.updateDownloaded = true; // Reset back since install failed

            // Show error dialog, then exit — services are already shut down
            // and _cleanupDone=true, so the app is non-recoverable.
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow) {
                await dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: 'Update Error',
                    message: 'Failed to install update',
                    detail: errorMessage(error),
                    buttons: ['OK']
                });
            }
            app.exit(1);
        }
    }
}

const autoUpdaterManager = new AutoUpdaterManager();
export { AutoUpdaterManager };
export default autoUpdaterManager;
