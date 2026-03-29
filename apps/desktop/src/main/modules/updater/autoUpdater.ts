import electron from 'electron';
import { autoUpdater } from 'electron-updater';
import settingsCache from '../../../services/core/SettingsCache';
import networkService from '../../../services/network/NetworkService';
import { errorMessage, toErrno } from '../../../types/common';
import type { AppSettings } from '../../../types/settings';
import mainLogger from '../../../utils/mainLogger';
import trayManager from '../tray/trayManager';
import { writeRestartHiddenFlag } from '../window/restartFlag';
import windowManager from '../window/windowManager';

const { app, dialog } = electron;
const { createLogger } = mainLogger;
const log = createLogger('AutoUpdater');

// Use electron-updater's own types instead of redeclaring
import type { UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';

interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

/**
 * AutoUpdaterManager — owns the full update lifecycle in the main process.
 *
 * Design principles:
 *  - Main process is the sole owner of update state. The renderer (if alive)
 *    receives events for display but never drives the lifecycle.
 *  - Background auto-checks are silent. Only manual checks surface errors to
 *    the user. This prevents the background app from showing notifications
 *    about transient failures (CI building, GitHub 404s).
 *  - Error classification happens here, not in the renderer. The renderer
 *    only receives clean, user-friendly strings — never raw error details.
 *  - Network-aware retry: subscribes to NetworkService state changes rather
 *    than running independent timers. When the network recovers, a pending
 *    retry fires automatically.
 */
class AutoUpdaterManager {
  updateCheckInProgress: boolean;
  updateDownloadInProgress: boolean;
  updateDownloaded: boolean;
  downloadedUpdateInfo: UpdateDownloadedEvent | null;
  scheduledCheckTimer: ReturnType<typeof setInterval> | null;

  // Tracks whether the current/last check was user-initiated (tray click,
  // settings button) or automatic (startup, periodic, network recovery).
  // handleUpdateError uses this to decide whether to show UI notifications.
  private lastCheckManual: boolean;

  // Retry state: pending retry timer for transient/network errors.
  // Cleared when a new check starts or network state changes.
  private retryTimer: ReturnType<typeof setTimeout> | null;
  private pendingRetry: boolean;

  // Network listener cleanup
  private networkCleanup: (() => void) | null;

  CHECK_INTERVAL: number;
  private readonly TRANSIENT_RETRY_DELAY = 2 * 60 * 1000; // 2 minutes

  constructor() {
    this.updateCheckInProgress = false;
    this.updateDownloadInProgress = false;
    this.updateDownloaded = false;
    this.downloadedUpdateInfo = null;
    this.scheduledCheckTimer = null;
    this.lastCheckManual = false;
    this.retryTimer = null;
    this.pendingRetry = false;
    this.networkCleanup = null;
    this.CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  }

  setupAutoUpdater() {
    autoUpdater.logger = {
      info: (...args: unknown[]) => log.info('[AutoUpdater]', ...args),
      warn: (...args: unknown[]) => log.warn('[AutoUpdater]', ...args),
      error: (...args: unknown[]) => log.error('[AutoUpdater]', ...args),
      debug: () => {},
    } as typeof autoUpdater.logger;
    autoUpdater.allowDowngrade = false;
    autoUpdater.autoInstallOnAppQuit = false;

    const settings = settingsCache.get();
    this.applyUpdateSettings(settings);

    this.logAppInfo();
    this.setupEventListeners();
    this.setupNetworkListener();
    this.scheduleUpdates();
  }

  // ── Settings ─────────────────────────────────────────────────

  applyUpdateSettings(settings: AppSettings) {
    autoUpdater.autoDownload = settings.autoUpdate !== false;
    autoUpdater.allowPrerelease = settings.updateChannel === 'beta';
    log.info(
      `Update settings applied: autoUpdate=${settings.autoUpdate}, channel=${settings.updateChannel}, allowPrerelease=${autoUpdater.allowPrerelease}`,
    );
  }

  logAppInfo() {
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
      autoUpdater.forceDevUpdateConfig = true;
    }
  }

  // ── Event listeners ──────────────────────────────────────────

  private setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      this.updateCheckInProgress = true;
      trayManager.setUpdateState('checking');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateCheckInProgress = false;
      this.updateDownloadInProgress = true;
      this.clearPendingRetry();
      trayManager.setUpdateState('downloading', { version: info.version, percent: 0 });
      windowManager.sendToWindow('update-available', info);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateCheckInProgress = false;
      this.clearPendingRetry();
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
      this.clearPendingRetry();
      trayManager.setUpdateState('ready', { version: info.version });
      windowManager.sendToWindow('update-downloaded', info);
    });

    autoUpdater.on('error', (err: Error) => {
      this.handleUpdateError(err);
    });
  }

  // ── Network-aware retry ──────────────────────────────────────

  /**
   * Subscribe to NetworkService state changes for retry-on-recovery.
   *
   * When a check fails due to network or transient errors, we set
   * pendingRetry=true. When the network transitions to online, we
   * trigger an automatic (silent) retry instead of relying on
   * independent timers. This integrates with the app's existing
   * network monitoring rather than duplicating it.
   */
  private setupNetworkListener() {
    const handler = () => {
      if (this.pendingRetry) {
        log.info('Network recovered with pending update retry, checking now');
        this.clearPendingRetry();
        // Small delay to let DNS/connections stabilize
        setTimeout(() => this.checkForUpdates(), 5000);
      }
    };

    networkService.on('online', handler);
    this.networkCleanup = () => networkService.removeListener('online', handler);
  }

  // ── Error handling ───────────────────────────────────────────

  /**
   * Classify an update error into a user-facing category.
   *
   * Internal details (URLs, HTTP headers, stack traces) must never reach
   * the user. The full error is always logged for debugging.
   */
  private classifyUpdateError(err: Error): {
    kind: 'network' | 'transient' | 'signature' | 'generic';
    userMessage: string;
  } {
    const msg = err.message || '';

    if (
      msg.includes('net::ERR_INTERNET_DISCONNECTED') ||
      msg.includes('net::ERR_NAME_NOT_RESOLVED') ||
      msg.includes('net::ERR_CONNECTION_REFUSED') ||
      msg.includes('net::ERR_NETWORK_CHANGED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ETIMEDOUT')
    ) {
      return { kind: 'network', userMessage: 'Network unavailable. Will retry when connected.' };
    }

    // 404 = release tag exists but assets not uploaded yet (CI still building)
    if (msg.includes('HttpError: 404') || msg.includes('Cannot find latest')) {
      return { kind: 'transient', userMessage: 'No update available right now. Please try again later.' };
    }

    if (msg.includes('code signature') || msg.includes('signature verification')) {
      log.error('Code signature validation error:', {
        message: msg,
        code: toErrno(err).code,
        errno: toErrno(err).errno,
      });
      return { kind: 'signature', userMessage: 'Update verification failed. Please try again.' };
    }

    return { kind: 'generic', userMessage: "Couldn't check for updates. Please try again later." };
  }

  /**
   * Central error handler for all update errors.
   *
   * Uses lastCheckManual to decide visibility:
   *  - Manual check: show user-friendly notification + tray error state
   *  - Auto check: silent (log only) + schedule retry
   *
   * Both paths schedule retries for recoverable errors (network, transient).
   */
  private handleUpdateError(err: Error) {
    const { kind, userMessage } = this.classifyUpdateError(err);
    const wasManual = this.lastCheckManual;

    // Always log full error for debugging (network errors at debug level)
    if (kind === 'network') {
      log.debug('Update check failed (network):', err.message);
    } else {
      log.error('Update check failed:', err);
    }

    // Reset check state
    this.updateCheckInProgress = false;
    this.updateDownloadInProgress = false;

    // Tray + renderer feedback depends on whether the user asked for this
    if (wasManual) {
      trayManager.setUpdateState('error');
      windowManager.sendToWindow('clear-update-checking-notification');
      windowManager.sendToWindow('update-error', { message: userMessage });
    } else {
      // Background check — completely silent, no UI feedback
      trayManager.setUpdateState('idle');
      windowManager.sendToWindow('clear-update-checking-notification');
    }

    // Schedule retry for recoverable errors
    if (kind === 'network' || kind === 'transient') {
      this.scheduleRetry(kind === 'network' ? 'network-recovery' : 'timer');
    }
  }

  // ── Retry management ─────────────────────────────────────────

  /**
   * Schedule a retry for a failed update check.
   *
   * Two strategies:
   *  - 'network-recovery': set pendingRetry flag, wait for NetworkService
   *    to signal online. No timer — the network listener triggers the retry.
   *  - 'timer': retry after TRANSIENT_RETRY_DELAY (for 404s where network
   *    is fine but assets aren't ready yet).
   *
   * Both are cleared when a successful check starts or completes.
   */
  private scheduleRetry(strategy: 'network-recovery' | 'timer') {
    this.clearPendingRetry();

    if (strategy === 'network-recovery') {
      // NetworkService listener will trigger retry when online
      this.pendingRetry = true;
      log.info('Update retry pending network recovery');
    } else {
      this.pendingRetry = true;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.pendingRetry && !this.updateCheckInProgress && !this.updateDownloadInProgress) {
          log.info('Retrying update check after transient failure');
          this.pendingRetry = false;
          this.checkForUpdates();
        }
      }, this.TRANSIENT_RETRY_DELAY);
      log.info(`Update retry scheduled in ${this.TRANSIENT_RETRY_DELAY / 1000}s`);
    }
  }

  private clearPendingRetry() {
    this.pendingRetry = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // ── Check triggers ───────────────────────────────────────────

  scheduleUpdates() {
    const settings = settingsCache.get();
    if (settings.autoUpdate === false) {
      log.info('Auto-update disabled, skipping scheduled checks');
      return;
    }

    // Check on startup (with delay)
    setTimeout(() => this.checkForUpdates(), 3000);

    // Periodic checks
    this.scheduledCheckTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Automatic (silent) update check. Errors are logged but never shown
   * to the user. Called by startup timer, periodic interval, and
   * network recovery retry.
   */
  checkForUpdates() {
    if (!networkService.getState().isOnline) return;
    if (this.updateCheckInProgress || this.updateDownloadInProgress) return;

    const channel = autoUpdater.allowPrerelease ? 'beta' : 'production';
    log.info(`Checking for updates (channel: ${channel})`);

    this.lastCheckManual = false;
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      // The 'error' event fires for the same failure and calls
      // handleUpdateError. This catch prevents unhandled rejection.
      log.debug('checkForUpdatesAndNotify rejected (handled by error event):', err.message);
    });
  }

  /**
   * Manual update check (user clicked tray menu or settings button).
   * Errors are shown to the user with friendly messages.
   */
  checkForUpdatesManual(isManual = true) {
    if (!networkService.getState().isOnline) {
      windowManager.sendToWindow('update-check-network-offline');
      return;
    }

    if (this.updateDownloaded) {
      windowManager.sendToWindow('update-already-downloaded', {
        isManual,
        info: this.downloadedUpdateInfo,
      });
      return;
    }

    if (this.updateCheckInProgress || this.updateDownloadInProgress) {
      windowManager.sendToWindow('update-check-already-in-progress');
      return;
    }

    this.lastCheckManual = isManual;
    this.updateCheckInProgress = true;

    try {
      autoUpdater
        .checkForUpdates()
        .catch((err: Error) => {
          log.debug('checkForUpdates rejected (handled by error event):', err.message);
        })
        .finally(() => {
          // Failsafe: reset flag if stuck after 10 seconds
          setTimeout(() => {
            if (this.updateCheckInProgress) {
              this.updateCheckInProgress = false;
              windowManager.sendToWindow('clear-update-checking-notification');
            }
          }, 10000);
        });
    } catch (err: unknown) {
      this.handleUpdateError(err instanceof Error ? err : new Error(errorMessage(err)));
    }
  }

  /**
   * IPC handler for update checks from the renderer.
   */
  handleManualUpdateCheck(_event: Electron.IpcMainEvent, isManual: boolean) {
    this.checkForUpdatesManual(isManual);
  }

  // ── Install ──────────────────────────────────────────────────

  async installUpdate() {
    const appLifecycle = (await import('../app/lifecycle')).default;
    appLifecycle.setQuitting(true);
    this.updateDownloaded = false;
    this.downloadedUpdateInfo = null;

    try {
      log.info('Performing pre-update server cleanup...');
      await appLifecycle.beforeQuit();
      log.info('Pre-update cleanup complete, installing update');

      // If the window is currently hidden, preserve that state after restart.
      // Skip if the flag was already written by the caller (e.g. restartApp IPC
      // → before-quit → installUpdate) to avoid checking window state during shutdown.
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        writeRestartHiddenFlag();
      }

      autoUpdater.quitAndInstall(false, true);

      setTimeout(() => {
        app.exit(0);
      }, 3000);
    } catch (error: unknown) {
      log.error('Failed to install update:', error);
      this.updateDownloaded = true;

      const mainWindow = windowManager.getMainWindow();
      if (mainWindow) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Update Error',
          message: 'Failed to install update',
          detail: errorMessage(error),
          buttons: ['OK'],
        });
      }
      app.exit(1);
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────

  shutdown() {
    this.clearPendingRetry();
    if (this.scheduledCheckTimer) {
      clearInterval(this.scheduledCheckTimer);
      this.scheduledCheckTimer = null;
    }
    if (this.networkCleanup) {
      this.networkCleanup();
      this.networkCleanup = null;
    }
  }
}

const autoUpdaterManager = new AutoUpdaterManager();
export default autoUpdaterManager;
