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

    handleManualUpdateCheck(event, isManual) {
        // Check network state
        const networkState = networkService.getState();
        if (!networkState.isOnline) {
            windowManager.sendToWindow('update-check-network-offline');
            return;
        }

        // Check if update already downloaded
        if (this.updateDownloaded) {
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow) {
                const isManualCheck = event.sender === mainWindow.webContents;
                mainWindow.webContents.send('update-already-downloaded', {
                    isManual: isManualCheck,
                    info: this.downloadedUpdateInfo // Include stored update info
                });
            }
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
                event.reply('update-error', err.message);
            }
        }
    }

    installUpdate() {
        const appLifecycle = require('../app/lifecycle');
        appLifecycle.setQuitting(true);
        this.updateDownloaded = false;
        this.downloadedUpdateInfo = null;

        try {
            // Signal that we want to restart after update
            autoUpdater.autoInstallOnAppQuit = true;

            // Force quit with updated options
            autoUpdater.quitAndInstall(false, true);

            // Backup approach: force the app to quit after a short delay
            setTimeout(() => {
                app.exit(0);
            }, 1000);
        } catch (error) {
            log.error('Failed to install update:', error);
            this.updateDownloaded = true; // Reset back since install failed

            // Show error dialog
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow) {
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: 'Update Error',
                    message: 'Failed to install update',
                    detail: error.message || 'Unknown error',
                    buttons: ['OK']
                });
            }
        }
    }
}

module.exports = new AutoUpdaterManager();