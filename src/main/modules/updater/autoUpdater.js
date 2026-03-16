const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');
const { createLogger } = require('../../../utils/mainLogger');
const networkService = require('../../../services/network/NetworkService');
const windowManager = require('../window/windowManager');

const log = createLogger('AutoUpdater');

class AutoUpdaterManager {
    constructor() {
        // State tracking variables
        this.updateCheckInProgress = false;
        this.updateDownloadInProgress = false;
        this.updateDownloaded = false;
        this.downloadedUpdateInfo = null; // Store downloaded update info for later retrieval
        this.networkErrorRetryTimer = null;
        this.NETWORK_RETRY_INTERVAL = 15 * 60 * 1000; // 15 minutes
        this.CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    }

    setupAutoUpdater() {
        // Configure logging to filter electron-updater verbose output
        autoUpdater.logger = {
            info: (...args) => log.info('[AutoUpdater]', ...args),
            warn: (...args) => log.warn('[AutoUpdater]', ...args),
            error: (...args) => log.error('[AutoUpdater]', ...args),
            debug: () => {}
        };
        autoUpdater.allowDowngrade = false;
        autoUpdater.autoDownload = true;
        autoUpdater.allowPrerelease = false;
        // Disable electron-updater's built-in auto-install-on-quit.
        // It spawns the NSIS installer during before-quit BEFORE our async
        // server cleanup finishes, causing EADDRINUSE on Windows.
        // We handle update installation ourselves in main.js's before-quit handler,
        // AFTER servers are properly closed.
        autoUpdater.autoInstallOnAppQuit = false;

        this.logAppInfo();
        this.setupEventListeners();
        this.scheduleUpdates();
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
        });

        autoUpdater.on('update-available', (info) => {
            this.updateCheckInProgress = false;
            this.updateDownloadInProgress = true;

            windowManager.sendToWindow('update-available', info);
        });

        autoUpdater.on('update-not-available', (info) => {
            this.updateCheckInProgress = false;

            windowManager.sendToWindow('update-not-available', info);
            windowManager.sendToWindow('clear-update-checking-notification');
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.updateDownloadInProgress = true;
            windowManager.sendToWindow('update-progress', progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            this.updateDownloadInProgress = false;
            this.updateDownloaded = true;
            this.downloadedUpdateInfo = info; // Store for later retrieval

            windowManager.sendToWindow('update-downloaded', info);
        });

        autoUpdater.on('error', (err) => {
            this.handleUpdateError(err);
        });
    }

    handleUpdateError(err) {
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
                code: err.code,
                errno: err.errno
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
                autoUpdater.checkForUpdates().catch(err => {
                    log.error('Retry update check failed:', err);
                });
            }
            this.networkErrorRetryTimer = null;
        }, this.NETWORK_RETRY_INTERVAL);

        windowManager.sendToWindow('clear-update-checking-notification');
    }

    scheduleUpdates() {
        // Check for updates on startup (with delay)
        setTimeout(() => {
            this.checkForUpdates();
        }, 3000);

        // Set up periodic update checks
        setInterval(() => {
            this.checkForUpdates();
        }, this.CHECK_INTERVAL);
    }

    checkForUpdates() {
        // Check network state before attempting update
        const networkState = networkService.getState();
        if (!networkState.isOnline) {
            return;
        }

        // Check if we're already checking or downloading
        if (this.updateCheckInProgress || this.updateDownloadInProgress) {
            return;
        }
        autoUpdater.checkForUpdatesAndNotify()
            .catch(err => {
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
     * @param {boolean} isManual - If true, errors are shown to the user
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
                .catch(error => {
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
        } catch (err) {
            this.updateCheckInProgress = false;
            log.error('Error calling checkForUpdates:', err);
            windowManager.sendToWindow('clear-update-checking-notification');

            if (isManual) {
                windowManager.sendToWindow('update-error', err.message);
            }
        }
    }

    /**
     * IPC handler for update checks from the renderer.
     * Thin transport layer — delegates to checkForUpdatesManual().
     */
    handleManualUpdateCheck(_event, isManual) {
        this.checkForUpdatesManual(isManual);
    }

    async installUpdate() {
        const appLifecycle = require('../app/lifecycle');
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
        } catch (error) {
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
                    detail: error.message || 'Unknown error',
                    buttons: ['OK']
                });
            }
            app.exit(1);
        }
    }
}

module.exports = new AutoUpdaterManager();