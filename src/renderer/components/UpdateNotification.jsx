import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { Button, App, Progress } from 'antd';
import { DownloadOutlined, ReloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
const { createLogger } = require('../utils/logger');
const log = createLogger('UpdateNotification');

const UpdateNotification = forwardRef((props, ref) => {
    const { notification, modal } = App.useApp();
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [manualCheckInProgress, setManualCheckInProgress] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useState(0);

    // Debug label for consistent logging
    const debugLabel = '[UpdateNotification Debug]';

    // Use refs to maintain state across re-renders
    const checkingNotificationRef = useRef(false);
    const checkStartTimeRef = useRef(0);
    const handlingAlreadyDownloadedRef = useRef(false);
    const eventListenersSetupRef = useRef(false);
    const initialCheckPerformedRef = useRef(false);
    const notificationTimeoutRef = useRef(null);
    const checkDebounceTimerRef = useRef(null);
    // ref to track if we're in silent check mode
    const inSilentCheckModeRef = useRef(false);
    // ref to track if we're waiting to show a delayed notification
    const pendingNotificationRef = useRef(false);

    // Minimum time to display checking notification (ms)
    const MIN_CHECK_DISPLAY_TIME = 2000; // 2 seconds

    // Notification keys for proper management
    const NOTIFICATION_KEYS = {
        CHECKING: 'checking-updates',
        DOWNLOADING: 'update-download-progress',
        DOWNLOADED: 'update-downloaded',
        INSTALLING: 'update-installing',
        ERROR: 'update-error',
        NOT_AVAILABLE: 'update-not-available',
        ALREADY_CHECKING: 'update-already-checking'
    };

    // Debug logging function
    const debugLog = (message, data = null) => {
        const timestamp = new Date().toISOString().slice(11, 19);
        if (data) {
            log.debug(`[${timestamp}] ${message}`, data);
        } else {
            log.debug(`[${timestamp}] ${message}`);
        }
    };

    // Helper function to clear a specific notification after a delay
    const clearNotificationAfterDelay = (key, delay) => {
        // Clear any existing timeout
        if (notificationTimeoutRef.current) {
            clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = null;
        }

        // Set new timeout to clear the notification
        notificationTimeoutRef.current = setTimeout(() => {
            notification.destroy(key);
            notificationTimeoutRef.current = null;
        }, delay);
    };

    // Helper function to clear all update-related notifications
    const clearAllNotifications = () => {
        debugLog(`${debugLabel} Clearing all notifications`);
        Object.values(NOTIFICATION_KEYS).forEach(key => {
            debugLog(`${debugLabel} Destroying notification: ${key}`);
            notification.destroy(key);
        });

        // Also clear any pending notification timeout
        if (notificationTimeoutRef.current) {
            debugLog(`${debugLabel} Clearing notification timeout`);
            clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = null;
        }
    };

    // Expose methods via ref to parent components
    useImperativeHandle(ref, () => ({
        checkForUpdates(isManual = false) {
            debugLog(`${debugLabel} checkForUpdates called (manual: ${isManual})`);

            // Prevent rapid consecutive checks
            const now = Date.now();
            const timeSinceLastCheck = now - lastCheckTime;

            if (timeSinceLastCheck < 5000) { // 5 seconds minimum between checks
                debugLog(`${debugLabel} Ignoring rapid update check (${timeSinceLastCheck}ms since last check)`);
                return;
            }

            // Don't allow new checks if we're already checking or downloading
            if (checkingNotificationRef.current || isDownloading || manualCheckInProgress) {
                debugLog(`${debugLabel} Update check already in progress: 
                  checkingNotificationRef=${checkingNotificationRef.current}, 
                  isDownloading=${isDownloading}, 
                  manualCheckInProgress=${manualCheckInProgress}`);

                notification.info({
                    message: isDownloading ? 'Download In Progress' : 'Check In Progress',
                    description: isDownloading
                        ? 'Already downloading the latest update'
                        : 'Already checking for updates',
                    duration: 3,
                    key: NOTIFICATION_KEYS.ALREADY_CHECKING
                });

                return;
            }

            // Clear any existing debounce timer
            if (checkDebounceTimerRef.current) {
                debugLog(`${debugLabel} Clearing existing debounce timer`);
                clearTimeout(checkDebounceTimerRef.current);
                checkDebounceTimerRef.current = null;
            }

            // Clear any existing notifications before showing new ones
            debugLog(`${debugLabel} Clearing all existing notifications`);
            clearAllNotifications();

            // Reset the flag for already-downloaded updates
            handlingAlreadyDownloadedRef.current = false;

            // Mark that we're checking and update the last check time
            debugLog(`${debugLabel} Setting checking states: 
              checkingNotificationRef.current=true, 
              manualCheckInProgress=${isManual}`);
            checkingNotificationRef.current = true;
            setManualCheckInProgress(true);
            setLastCheckTime(now);

            // Turn off silent mode for manual checks
            inSilentCheckModeRef.current = !isManual;

            // Record when we started the check
            checkStartTimeRef.current = now;
            debugLog(`${debugLabel} Starting update check, setting checkStartTime to ${new Date(checkStartTimeRef.current).toISOString()}`);

            // Only show checking notification for manual checks
            if (isManual) {
                debugLog(`${debugLabel} Showing 'Checking for Updates' notification`);
                notification.open({
                    message: 'Checking for Updates',
                    description: 'Looking for new versions…',
                    duration: 0,
                    key: NOTIFICATION_KEYS.CHECKING,
                    icon: <LoadingOutlined spin />
                });
            }

            // Actually trigger the update check
            debugLog(`${debugLabel} Calling electronAPI.checkForUpdates()`);
            window.electronAPI.checkForUpdates(isManual);

            // Set a timer to ensure minimum display time for checking notification
            if (isManual) {
                debugLog(`${debugLabel} Setting minimum display timer for notification`);
                checkDebounceTimerRef.current = setTimeout(() => {
                    debugLog(`${debugLabel} Minimum check notification display time reached`);
                    checkDebounceTimerRef.current = null;

                    // If we haven't received any response yet, keep the notification visible
                    if (checkingNotificationRef.current && !handlingAlreadyDownloadedRef.current) {
                        debugLog(`${debugLabel} Still checking for updates, keeping notification visible`);
                    }
                }, MIN_CHECK_DISPLAY_TIME);
            }
        }
    }));

    // Set up event listeners only once during component mount
    useEffect(() => {
        // Skip if we've already set up the listeners
        if (eventListenersSetupRef.current) {
            return;
        }

        debugLog('Setting up update event listeners (first time setup)');
        eventListenersSetupRef.current = true;

        // Handle the case where an update check is already in progress
        const handleUpdateCheckAlreadyInProgress = () => {
            debugLog(`${debugLabel} Received "update-check-already-in-progress" event`);

            // Update state and refs
            setManualCheckInProgress(false);
            checkingNotificationRef.current = false;

            // Only show notification if not in silent mode
            if (!inSilentCheckModeRef.current) {
                // If we were showing a checking notification, replace it
                notification.destroy(NOTIFICATION_KEYS.CHECKING);

                // Show appropriate notification if not already downloading
                if (!isDownloading) {
                    notification.info({
                        message: 'Check In Progress',
                        description: 'Already checking for updates',
                        duration: 3,
                        key: NOTIFICATION_KEYS.ALREADY_CHECKING
                    });
                }
            }
        };

        // Add handler for clearing checking notification
        const handleClearCheckingNotification = () => {
            debugLog(`${debugLabel} Received clear-checking-notification event`);
            notification.destroy(NOTIFICATION_KEYS.CHECKING);

            // Only reset state if we're not waiting for a delayed notification
            if (!pendingNotificationRef.current) {
                debugLog(`${debugLabel} Resetting checking states: checkingNotificationRef.current = false, manualCheckInProgress = false`);
                checkingNotificationRef.current = false;
                setManualCheckInProgress(false);
            } else {
                debugLog(`${debugLabel} Not resetting state - waiting for delayed notification`);
            }
        };

        // Add subscription for clearing checking notification
        const unsubscribeClearChecking = window.electronAPI.onClearUpdateCheckingNotification(
            handleClearCheckingNotification
        );

        // Handle the case where an update is already downloaded
        const handleUpdateAlreadyDownloaded = (isManual = false) => {
            debugLog(`${debugLabel} Received "update-already-downloaded" event (manual check: ${isManual})`);

            // Skip notification if in silent mode and this wasn't a manual check
            if (inSilentCheckModeRef.current && !isManual && !manualCheckInProgress) {
                debugLog(`${debugLabel} In silent check mode, not showing notification`);
                return;
            }

            // Mark that we're handling an already downloaded update
            handlingAlreadyDownloadedRef.current = true;

            // Calculate how long the checking notification has been shown
            const elapsed = Date.now() - checkStartTimeRef.current;
            const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

            debugLog(`${debugLabel} Checking notification shown for ${elapsed}ms, minimum is ${MIN_CHECK_DISPLAY_TIME}ms`);

            if (remainingTime > 0) {
                debugLog(`${debugLabel} Delaying "update-already-downloaded" handling for ${remainingTime}ms`);

                // Wait to ensure minimum display time for checking notification
                setTimeout(() => {
                    showUpdateReadyNotification(isManual);
                }, remainingTime);
            } else {
                // If checking notification was shown long enough, proceed immediately
                showUpdateReadyNotification(isManual);
            }
        };

        // Helper function to show update ready notification
        const showUpdateReadyNotification = (isManual) => {
            debugLog(`${debugLabel} Showing update ready notification`);

            // Clear checking notification
            notification.destroy(NOTIFICATION_KEYS.CHECKING);

            // Reset state
            checkingNotificationRef.current = false;
            setManualCheckInProgress(false);

            // Only show notification for manual checks or first time
            const wasManualCheck = manualCheckInProgress || isManual;
            if (wasManualCheck || !updateDownloaded) {
                setUpdateDownloaded(true);

                // Get version info
                const version = updateInfo ? updateInfo.version : '2.4.7'; // Default to known version instead of 'latest version'

                // Create install button
                const installButton = (
                    <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={isInstalling}
                        onClick={() => {
                            // Close notification
                            notification.destroy(NOTIFICATION_KEYS.DOWNLOADED);

                            // Show confirmation dialog
                            modal.confirm({
                                title: 'Install Update',
                                content: 'The application will restart to install the update. Continue?',
                                onOk: () => {
                                    setIsInstalling(true);

                                    // Show installation notification
                                    notification.info({
                                        message: 'Installing Update',
                                        description: 'The application will restart momentarily...',
                                        duration: 0,
                                        key: NOTIFICATION_KEYS.INSTALLING
                                    });

                                    // Call install function
                                    window.electronAPI.installUpdate();
                                },
                                okText: 'Update Now',
                                cancelText: 'Later'
                            });
                        }}
                    >
                        {isInstalling ? 'Installing...' : 'Install Now'}
                    </Button>
                );

                // Show notification
                notification.success({
                    message: 'Update Ready',
                    description: `Version ${version} is ready to install`,
                    duration: 0,
                    key: NOTIFICATION_KEYS.DOWNLOADED,
                    btn: installButton
                });

                debugLog(`${debugLabel} Showed "update ready" notification for version ${version}`);
            }
        };

        // Handle event when update is available
        const handleUpdateAvailable = (info) => {
            debugLog(`${debugLabel} Received "update-available" event with version ${info.version}`);

            // Update state
            setUpdateInfo(info);
            setIsDownloading(true);
            setManualCheckInProgress(false);
            checkingNotificationRef.current = false;
            setDownloadProgress(0);

            // Clear notifications before showing new one
            clearAllNotifications();

            // Show download notification
            notification.info({
                message: 'Update Available',
                description: (
                    <div>
                        <div>Version {info.version} is downloading...</div>
                        <Progress percent={0} status="active" />
                    </div>
                ),
                duration: 0,
                key: NOTIFICATION_KEYS.DOWNLOADING
            });
        };

        // Handle download progress updates
        const handleUpdateProgress = (progressObj) => {
            const percent = Math.round(progressObj.percent) || 0;
            setDownloadProgress(percent);

            // Update the progress notification
            notification.info({
                message: 'Downloading Update',
                description: (
                    <div>
                        <Progress
                            percent={percent}
                            status="active"
                            format={percent => `${percent}%`}
                        />
                    </div>
                ),
                duration: 0,
                key: NOTIFICATION_KEYS.DOWNLOADING
            });

            if (percent % 20 === 0) { // Log less frequently
                debugLog(`Download progress: ${percent}%`);
            }
        };

        // Handle completed download
        const handleUpdateDownloaded = (info) => {
            debugLog(`${debugLabel} Received "update-downloaded" event for version ${info.version}`);

            // Update state
            setUpdateDownloaded(true);
            setIsDownloading(false);
            setUpdateInfo(info);
            setManualCheckInProgress(false);
            checkingNotificationRef.current = false;

            // Close download progress notification
            notification.destroy(NOTIFICATION_KEYS.DOWNLOADING);

            // Create install button
            const installButton = (
                <Button
                    type="primary"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={isInstalling}
                    onClick={() => {
                        // Close notification
                        notification.destroy(NOTIFICATION_KEYS.DOWNLOADED);

                        // Show confirmation dialog
                        modal.confirm({
                            title: 'Install Update',
                            content: 'The application will restart to install the update. Continue?',
                            onOk: () => {
                                setIsInstalling(true);

                                // Show installation notification
                                notification.info({
                                    message: 'Installing Update',
                                    description: 'The application will restart momentarily...',
                                    duration: 0,
                                    key: NOTIFICATION_KEYS.INSTALLING
                                });

                                // Call install function
                                window.electronAPI.installUpdate();
                            },
                            okText: 'Update Now',
                            cancelText: 'Later'
                        });
                    }}
                >
                    {isInstalling ? 'Installing...' : 'Install Now'}
                </Button>
            );

            // Show notification
            notification.success({
                message: 'Update Ready',
                description: `Version ${info.version} is ready to install`,
                duration: 0,
                key: NOTIFICATION_KEYS.DOWNLOADED,
                btn: installButton
            });
        };

        // Handle update errors
        const handleUpdateError = (message) => {
            debugLog(`${debugLabel} Received "update-error" event: ${message}`);

            // Update state
            debugLog(`${debugLabel} Resetting states: isDownloading = false, manualCheckInProgress = false, checkingNotificationRef = false, isInstalling = false`);
            setIsDownloading(false);
            setManualCheckInProgress(false);
            checkingNotificationRef.current = false;
            setIsInstalling(false);

            // Skip notification if in silent mode
            if (inSilentCheckModeRef.current) {
                debugLog(`${debugLabel} In silent check mode, not showing error notification`);
                return;
            }

            // Calculate minimum notification time
            const elapsed = Date.now() - checkStartTimeRef.current;
            const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

            if (remainingTime > 0) {
                debugLog(`${debugLabel} Delaying error notification for ${remainingTime}ms`);
                setTimeout(() => {
                    // Clear notifications and show error
                    debugLog(`${debugLabel} Showing error notification after delay`);
                    clearAllNotifications();
                    notification.error({
                        message: 'Update Error',
                        description: message,
                        duration: 8,
                        key: NOTIFICATION_KEYS.ERROR
                    });
                }, remainingTime);
            } else {
                // Clear notifications and show error
                debugLog(`${debugLabel} Showing error notification immediately`);
                clearAllNotifications();
                notification.error({
                    message: 'Update Error',
                    description: message,
                    duration: 8,
                    key: NOTIFICATION_KEYS.ERROR
                });
            }
        };

        // Handle when no updates are available
        const handleUpdateNotAvailable = (info) => {
            debugLog(`${debugLabel} Received "update-not-available" event`);
            debugLog(`${debugLabel} Current states: manualCheckInProgress=${manualCheckInProgress}, inSilentCheckModeRef=${inSilentCheckModeRef.current}`);

            // Skip notification if in silent mode AND not a manual check in progress
            if (inSilentCheckModeRef.current && !manualCheckInProgress) {
                debugLog(`${debugLabel} In silent check mode and no manual check in progress, not showing notification`);
                debugLog(`${debugLabel} Resetting state flags: checkingNotificationRef.current=false, manualCheckInProgress=false`);
                checkingNotificationRef.current = false;
                setManualCheckInProgress(false);
                return;
            }

            // If we get here, either it's a manual check OR silent mode is off
            debugLog(`${debugLabel} Manual check detected, showing "no updates" notification`);

            // Calculate minimum notification time
            const elapsed = Date.now() - checkStartTimeRef.current;
            const remainingTime = Math.max(0, MIN_CHECK_DISPLAY_TIME - elapsed);

            if (remainingTime > 0) {
                debugLog(`${debugLabel} Delaying "no updates" notification for ${remainingTime}ms (${elapsed}ms elapsed)`);
                // Set pending notification flag to prevent premature state reset
                pendingNotificationRef.current = true;

                setTimeout(() => {
                    // Clear all notifications and show "no updates" notification
                    debugLog(`${debugLabel} Showing "no updates" notification after delay`);
                    clearAllNotifications();
                    notification.success({
                        message: 'No Updates Available',
                        description: 'You are already using the latest version.',
                        duration: 4,
                        key: NOTIFICATION_KEYS.NOT_AVAILABLE,
                        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    });
                    // Reset state and pending flag
                    debugLog(`${debugLabel} Resetting state flags after showing notification`);
                    setManualCheckInProgress(false);
                    checkingNotificationRef.current = false;
                    pendingNotificationRef.current = false;
                }, remainingTime);
            } else {
                // Show immediately if minimum display time already elapsed
                debugLog(`${debugLabel} Showing "no updates" notification immediately`);
                clearAllNotifications();
                notification.success({
                    message: 'No Updates Available',
                    description: 'You are already using the latest version.',
                    duration: 4,
                    key: NOTIFICATION_KEYS.NOT_AVAILABLE,
                    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
                });
                // Reset state
                debugLog(`${debugLabel} Resetting state flags after showing notification`);
                setManualCheckInProgress(false);
                checkingNotificationRef.current = false;
            }
        };

        // Set up all event listeners
        const unsubscribeAlreadyInProgress = window.electronAPI.onUpdateCheckAlreadyInProgress?.(handleUpdateCheckAlreadyInProgress) || (() => {});
        const unsubscribeAlreadyDownloaded = window.electronAPI.onUpdateAlreadyDownloaded?.(handleUpdateAlreadyDownloaded) || (() => {});
        const unsubscribeAvailable = window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
        const unsubscribeProgress = window.electronAPI.onUpdateProgress(handleUpdateProgress);
        const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
        const unsubscribeError = window.electronAPI.onUpdateError(handleUpdateError);
        const unsubscribeNotAvailable = window.electronAPI.onUpdateNotAvailable(handleUpdateNotAvailable);

        // Return cleanup function that will run on component unmount
        return () => {
            debugLog('Cleaning up update event listeners');
            unsubscribeAlreadyInProgress();
            unsubscribeAlreadyDownloaded();
            unsubscribeAvailable();
            unsubscribeProgress();
            unsubscribeDownloaded();
            unsubscribeError();
            unsubscribeNotAvailable();
            unsubscribeClearChecking();

            // Clean up timers
            if (checkDebounceTimerRef.current) {
                clearTimeout(checkDebounceTimerRef.current);
            }
            if (notificationTimeoutRef.current) {
                clearTimeout(notificationTimeoutRef.current);
            }

            // Clear all notifications
            clearAllNotifications();
        };
    }, []); // Empty dependency array - only run once on mount

    // Perform initial silent check but only once
    useEffect(() => {
        if (initialCheckPerformedRef.current) {
            return;
        }

        debugLog('Scheduling initial silent update check');
        const initialCheckTimer = setTimeout(() => {
            debugLog('Performing initial silent update check');
            initialCheckPerformedRef.current = true;
            inSilentCheckModeRef.current = true; // Enable silent mode for initial check
            window.electronAPI.checkForUpdates(false); // false = not manual
        }, 5000);

        return () => {
            clearTimeout(initialCheckTimer);
        };
    }, []);

    // This component doesn't render anything visible
    return null;
});

export default UpdateNotification;