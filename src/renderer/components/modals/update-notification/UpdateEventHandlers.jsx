import timeManager from '../../../services/TimeManager';

/**
 * UpdateEventHandlers - Manages update event handling and logic
 * 
 * Provides centralized event handling for all update-related events from
 * the main process. Handles timing, state management, and notification
 * coordination for different update scenarios.
 * 
 * Features:
 * - Event handler registration and cleanup
 * - Timing-based notification delays
 * - State management coordination
 * - Silent mode handling
 * - Progress tracking
 * 
 * @param {Object} params - Handler parameters
 * @param {Object} params.notificationManager - Notification manager instance
 * @param {Object} params.state - Component state object
 * @param {Object} params.setState - State setters object
 * @param {Object} params.refs - Component refs object
 * @param {function} params.debugLog - Debug logging function
 * @param {number} params.MIN_CHECK_DISPLAY_TIME - Minimum notification display time
 * @returns {Object} Event handlers and cleanup function
 */
export const createUpdateEventHandlers = ({
    notificationManager,
    state,
    setState,
    refs,
    debugLog,
    MIN_CHECK_DISPLAY_TIME
}) => {
    const debugLabel = '[UpdateNotification Debug]';

    /**
     * Handle update check already in progress
     * 
     * Called when the main process indicates that an update check is already
     * running. This prevents duplicate checks and provides user feedback.
     */
    const handleUpdateCheckAlreadyInProgress = () => {
        debugLog(`${debugLabel} Received "update-check-already-in-progress" event`);

        // Reset state to indicate we're not manually checking anymore
        setState.setManualCheckInProgress(false);
        refs.checkingNotificationRef.current = false;

        // Only show notification if not in silent mode (user-initiated checks)
        if (!refs.inSilentCheckModeRef.current) {
            // Clear any existing checking notification
            notificationManager.clearNotification(notificationManager.NOTIFICATION_KEYS.CHECKING);

            // Show appropriate notification if not already downloading
            if (!state.isDownloading) {
                notificationManager.showAlreadyCheckingNotification(state.isDownloading);
            }
        }
    };

    /**
     * Handle clearing checking notification
     * 
     * Called when the main process requests to clear the checking notification,
     * usually after a minimum display time has elapsed or when the check completes.
     */
    const handleClearCheckingNotification = () => {
        debugLog(`${debugLabel} Received clear-checking-notification event`);
        notificationManager.clearNotification(notificationManager.NOTIFICATION_KEYS.CHECKING);

        // Only reset state if we're not waiting for a delayed notification
        if (!refs.pendingNotificationRef.current) {
            debugLog(`${debugLabel} Resetting checking states`);
            refs.checkingNotificationRef.current = false;
            setState.setManualCheckInProgress(false);
        } else {
            debugLog(`${debugLabel} Not resetting state - waiting for delayed notification`);
        }
    };

    /**
     * Handle update already downloaded
     * 
     * Called when the main process indicates that an update was already downloaded
     * in a previous session. This handles the timing to ensure proper user experience.
     * 
     * @param {boolean} isManual - Whether this was a manual check
     */
    const handleUpdateAlreadyDownloaded = (isManual = false) => {
        debugLog(`${debugLabel} Received "update-already-downloaded" event (manual check: ${isManual})`);

        // Skip notification if in silent mode and this wasn't a manual check
        if (refs.inSilentCheckModeRef.current && !isManual && !state.manualCheckInProgress) {
            debugLog(`${debugLabel} In silent check mode, not showing notification`);
            return;
        }

        // Mark that we're handling an already downloaded update
        refs.handlingAlreadyDownloadedRef.current = true;

        // Calculate timing for delayed notification to ensure minimum display time
        const elapsed = timeManager.now() - refs.checkStartTimeRef.current;
        const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

        if (remainingTime > 0) {
            debugLog(`${debugLabel} Delaying "update-already-downloaded" handling for ${remainingTime}ms`);
            setTimeout(() => {
                showUpdateReadyNotification(isManual);
            }, remainingTime);
        } else {
            showUpdateReadyNotification(isManual);
        }
    };

    /**
     * Show update ready notification with proper state management
     * @param {boolean} isManual - Whether this was a manual check
     */
    const showUpdateReadyNotification = (isManual) => {
        debugLog(`${debugLabel} Showing update ready notification`);

        // Clear checking notification
        notificationManager.clearNotification(notificationManager.NOTIFICATION_KEYS.CHECKING);

        // Reset state
        refs.checkingNotificationRef.current = false;
        setState.setManualCheckInProgress(false);

        // Only show notification for manual checks or first time
        const wasManualCheck = state.manualCheckInProgress || isManual;
        if (wasManualCheck || !state.updateDownloaded) {
            setState.setUpdateDownloaded(true);

            // Get version info with fallback
            const version = state.updateInfo ? state.updateInfo.version : '2.4.7';
            
            // Show notification with version info
            notificationManager.showUpdateReadyNotification({ version });
        }
    };

    /**
     * Handle update available event
     * @param {Object} info - Update information
     */
    const handleUpdateAvailable = (info) => {
        debugLog(`${debugLabel} Received "update-available" event with version ${info.version}`);

        // Update state
        setState.setUpdateInfo(info);
        setState.setIsDownloading(true);
        setState.setManualCheckInProgress(false);
        refs.checkingNotificationRef.current = false;
        setState.setDownloadProgress(0);

        // Clear notifications and show download notification
        notificationManager.clearAllNotifications();
        notificationManager.showUpdateAvailableNotification(info, 0);
    };

    /**
     * Handle download progress updates
     * @param {Object} progressObj - Progress information
     */
    const handleUpdateProgress = (progressObj) => {
        const percent = Math.round(progressObj.percent) || 0;
        setState.setDownloadProgress(percent);

        // Update progress notification
        notificationManager.showDownloadProgressNotification(percent);

        // Log progress less frequently
        if (percent % 20 === 0) {
            debugLog(`Download progress: ${percent}%`);
        }
    };

    /**
     * Handle update downloaded event
     * @param {Object} info - Update information
     */
    const handleUpdateDownloaded = (info) => {
        debugLog(`${debugLabel} Received "update-downloaded" event for version ${info.version}`);

        // Update state
        setState.setUpdateDownloaded(true);
        setState.setIsDownloading(false);
        setState.setUpdateInfo(info);
        setState.setManualCheckInProgress(false);
        refs.checkingNotificationRef.current = false;

        // Close download progress notification and show ready notification
        notificationManager.clearNotification(notificationManager.NOTIFICATION_KEYS.DOWNLOADING);
        notificationManager.showUpdateReadyNotification(info);
    };

    /**
     * Handle update error event
     * @param {string} message - Error message
     */
    const handleUpdateError = (message) => {
        debugLog(`${debugLabel} Received "update-error" event: ${message}`);

        // Update state
        setState.setIsDownloading(false);
        setState.setManualCheckInProgress(false);
        refs.checkingNotificationRef.current = false;
        setState.setIsInstalling(false);

        // Skip notification if in silent mode
        if (refs.inSilentCheckModeRef.current) {
            debugLog(`${debugLabel} In silent check mode, not showing error notification`);
            return;
        }

        // Handle timing for error notification
        const elapsed = timeManager.now() - refs.checkStartTimeRef.current;
        const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

        const showErrorNotification = () => {
            notificationManager.clearAllNotifications();
            notificationManager.showUpdateErrorNotification(message);
        };

        if (remainingTime > 0) {
            debugLog(`${debugLabel} Delaying error notification for ${remainingTime}ms`);
            setTimeout(showErrorNotification, remainingTime);
        } else {
            showErrorNotification();
        }
    };

    /**
     * Handle update not available event
     */
    const handleUpdateNotAvailable = () => {
        debugLog(`${debugLabel} Received "update-not-available" event`);

        // Skip notification if in silent mode AND not a manual check in progress
        if (refs.inSilentCheckModeRef.current && !state.manualCheckInProgress) {
            debugLog(`${debugLabel} In silent check mode, not showing notification`);
            refs.checkingNotificationRef.current = false;
            setState.setManualCheckInProgress(false);
            return;
        }

        // Handle timing for no updates notification
        const elapsed = timeManager.now() - refs.checkStartTimeRef.current;
        const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

        const showNoUpdatesNotification = () => {
            notificationManager.clearAllNotifications();
            notificationManager.showNoUpdatesNotification();
            setState.setManualCheckInProgress(false);
            refs.checkingNotificationRef.current = false;
            refs.pendingNotificationRef.current = false;
        };

        if (remainingTime > 0) {
            debugLog(`${debugLabel} Delaying "no updates" notification for ${remainingTime}ms`);
            refs.pendingNotificationRef.current = true;
            setTimeout(showNoUpdatesNotification, remainingTime);
        } else {
            showNoUpdatesNotification();
        }
    };

    /**
     * Set up all event listeners
     * @returns {function} Cleanup function
     */
    const setupEventListeners = () => {

        // Set up event subscriptions
        const unsubscribeAlreadyInProgress = window.electronAPI.onUpdateCheckAlreadyInProgress?.(handleUpdateCheckAlreadyInProgress) || (() => {});
        const unsubscribeAlreadyDownloaded = window.electronAPI.onUpdateAlreadyDownloaded?.(handleUpdateAlreadyDownloaded) || (() => {});
        const unsubscribeClearChecking = window.electronAPI.onClearUpdateCheckingNotification?.(handleClearCheckingNotification) || (() => {});
        const unsubscribeAvailable = window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
        const unsubscribeProgress = window.electronAPI.onUpdateProgress(handleUpdateProgress);
        const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
        const unsubscribeError = window.electronAPI.onUpdateError(handleUpdateError);
        const unsubscribeNotAvailable = window.electronAPI.onUpdateNotAvailable(handleUpdateNotAvailable);

        // Return cleanup function
        return () => {
            debugLog('Cleaning up update event listeners');
            unsubscribeAlreadyInProgress();
            unsubscribeAlreadyDownloaded();
            unsubscribeClearChecking();
            unsubscribeAvailable();
            unsubscribeProgress();
            unsubscribeDownloaded();
            unsubscribeError();
            unsubscribeNotAvailable();
        };
    };

    return {
        setupEventListeners,
        handleUpdateCheckAlreadyInProgress,
        handleClearCheckingNotification,
        handleUpdateAlreadyDownloaded,
        handleUpdateAvailable,
        handleUpdateProgress,
        handleUpdateDownloaded,
        handleUpdateError,
        handleUpdateNotAvailable
    };
};