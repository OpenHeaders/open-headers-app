import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { App, theme } from 'antd';
import timeManager from '../../../services/TimeManager';
import { UpdateNotificationManager } from './UpdateNotificationManager';
import { createUpdateEventHandlers } from './UpdateEventHandlers';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('UpdateNotification');

/**
 * UpdateNotification component for handling application updates
 * 
 * Main orchestrator component that manages update checking, downloading,
 * and installation workflows. Provides a comprehensive interface for
 * update notifications with proper state management and user interactions.
 * 
 * Features:
 * - Manual and automatic update checking
 * - Download progress tracking
 * - Installation management with confirmation dialogs
 * - Silent mode for background checks
 * - Proper timing and debouncing for notifications
 * - Event-driven architecture with cleanup
 * 
 * Component Architecture:
 * This component acts as the main coordinator, delegating functionality to:
 * - UpdateNotificationManager: Notification display and formatting
 * - UpdateEventHandlers: Event handling and state management
 * 
 * @param {Object} props - Component props (unused)
 * @param {Object} ref - Forward ref for imperative API
 */
const UpdateNotification = forwardRef((props, ref) => {
    const { notification, modal } = App.useApp();
    const { token } = theme.useToken();

    // Component state - manages update lifecycle and user interactions
    const [updateDownloaded, setUpdateDownloaded] = useState(false);      // Whether update has been downloaded and is ready to install
    const [downloadProgress, setDownloadProgress] = useState(0);          // Current download progress (0-100)
    const [isDownloading, setIsDownloading] = useState(false);            // Whether update is currently downloading
    const [updateInfo, setUpdateInfo] = useState(null);                  // Information about the available update
    const [manualCheckInProgress, setManualCheckInProgress] = useState(false); // Whether user initiated a manual check
    const [isInstalling, setIsInstalling] = useState(false);             // Whether update installation is in progress
    const [lastCheckTime, setLastCheckTime] = useState(0);               // Timestamp of last update check (for debouncing)

    // Debug configuration - controls logging and timing behavior
    const debugLabel = '[UpdateNotification Debug]';              // Prefix for debug messages
    const MIN_CHECK_DISPLAY_TIME = 2000; // 2 seconds            // Minimum time to show checking notification

    // Refs for state management across re-renders - prevents stale closures and timing issues
    const checkingNotificationRef = useRef(false);               // Whether checking notification is currently shown
    const checkStartTimeRef = useRef(0);                         // Start time of current check (for timing calculations)
    const handlingAlreadyDownloadedRef = useRef(false);          // Whether we're handling an already downloaded update
    const eventListenersSetupRef = useRef(false);               // Whether event listeners have been initialized
    const initialCheckPerformedRef = useRef(false);             // Whether initial silent check has been performed
    const notificationTimeoutRef = useRef(null);                // Timeout for delayed notifications
    const checkDebounceTimerRef = useRef(null);                 // Timer for debouncing check requests
    const inSilentCheckModeRef = useRef(false);                 // Whether current check is in silent mode
    const pendingNotificationRef = useRef(false);               // Whether a delayed notification is pending

    /**
     * Debug logging function with timestamp
     * @param {string} message - Log message
     * @param {*} data - Optional data to log
     */
    const debugLog = (message, data = null) => {
        // No-op: debug logging disabled for update notifications
    };

    // Initialize notification manager - handles all notification display and formatting
    const notificationManager = UpdateNotificationManager({
        notification,
        modal,
        token,
        isInstalling,
        setIsInstalling,
        debugLog
    });

    // Prepare state and refs for event handlers - organized for clean dependency injection
    const state = {
        updateDownloaded,
        downloadProgress,
        isDownloading,
        updateInfo,
        manualCheckInProgress,
        isInstalling,
        lastCheckTime
    };

    const setState = {
        setUpdateDownloaded,
        setDownloadProgress,
        setIsDownloading,
        setUpdateInfo,
        setManualCheckInProgress,
        setIsInstalling,
        setLastCheckTime
    };

    const refs = {
        checkingNotificationRef,
        checkStartTimeRef,
        handlingAlreadyDownloadedRef,
        eventListenersSetupRef,
        initialCheckPerformedRef,
        notificationTimeoutRef,
        checkDebounceTimerRef,
        inSilentCheckModeRef,
        pendingNotificationRef
    };

    // Create event handlers - manages all update-related event handling and timing
    const eventHandlers = createUpdateEventHandlers({
        notificationManager,
        state,
        setState,
        refs,
        debugLog,
        MIN_CHECK_DISPLAY_TIME
    });

    /**
     * Perform update check with debouncing and state management
     * @param {boolean} isManual - Whether this is a manual check
     */
    const performUpdateCheck = (isManual = false) => {
        debugLog(`${debugLabel} checkForUpdates called (manual: ${isManual})`);

        // Prevent rapid consecutive checks - protects against accidental double-clicking
        const now = timeManager.now();
        const timeSinceLastCheck = now - lastCheckTime;

        if (timeSinceLastCheck < 5000) { // 5 seconds minimum between checks
            debugLog(`${debugLabel} Ignoring rapid update check (${timeSinceLastCheck}ms since last check)`);
            return;
        }

        // Don't allow new checks if already in progress - prevents overlapping update processes
        if (checkingNotificationRef.current || isDownloading || manualCheckInProgress) {
            debugLog(`${debugLabel} Update check already in progress`);
            notificationManager.showAlreadyCheckingNotification(isDownloading);
            return;
        }

        // Clear existing timers and notifications - ensures clean state for new check
        if (checkDebounceTimerRef.current) {
            clearTimeout(checkDebounceTimerRef.current);
            checkDebounceTimerRef.current = null;
        }
        notificationManager.clearAllNotifications();

        // Update state and refs - prepare for new check cycle
        handlingAlreadyDownloadedRef.current = false;     // Reset downloaded handling flag
        checkingNotificationRef.current = true;           // Mark checking notification as active
        setManualCheckInProgress(true);                   // Set manual check state
        setLastCheckTime(now);                            // Record check timestamp for debouncing
        inSilentCheckModeRef.current = !isManual;         // Set silent mode (opposite of manual)
        checkStartTimeRef.current = now;                  // Record start time for timing calculations

        // Show checking notification for manual checks - provides immediate user feedback
        if (isManual) {
            notificationManager.showCheckingNotification();
        }

        // Trigger the actual update check - communicates with main process
        debugLog(`${debugLabel} Calling electronAPI.checkForUpdates()`);
        window.electronAPI.checkForUpdates(isManual);

        // Set minimum display timer for manual checks - ensures notification shows long enough to read
        if (isManual) {
            checkDebounceTimerRef.current = setTimeout(() => {
                debugLog(`${debugLabel} Minimum check notification display time reached`);
                checkDebounceTimerRef.current = null;
            }, MIN_CHECK_DISPLAY_TIME);
        }
    };

    // Expose imperative API - allows parent components to trigger update checks
    useImperativeHandle(ref, () => ({
        checkForUpdates: performUpdateCheck
    }));

    // Set up event listeners (only once) - establishes communication with main process
    useEffect(() => {
        if (eventListenersSetupRef.current) {
            return;
        }

        eventListenersSetupRef.current = true;

        const cleanupEventListeners = eventHandlers.setupEventListeners();

        // Return cleanup function - ensures proper cleanup on unmount
        return () => {
            cleanupEventListeners();

            // Clean up timers - prevents memory leaks
            if (checkDebounceTimerRef.current) {
                clearTimeout(checkDebounceTimerRef.current);
            }
            if (notificationTimeoutRef.current) {
                clearTimeout(notificationTimeoutRef.current);
            }

            // Clear all notifications - prevents stale notifications
            notificationManager.clearAllNotifications();
        };
    }, []); // Empty dependency array - only run once on mount

    // Perform initial silent check (only once) - checks for updates on app startup
    useEffect(() => {
        if (initialCheckPerformedRef.current) {
            return;
        }

        const initialCheckTimer = setTimeout(() => {
            initialCheckPerformedRef.current = true;
            inSilentCheckModeRef.current = true;
            window.electronAPI.checkForUpdates(false); // false = not manual
        }, 5000); // Wait 5 seconds after startup to avoid interfering with app initialization

        return () => {
            clearTimeout(initialCheckTimer);
        };
    }, []);

    // This component doesn't render anything visible
    return null;
});

UpdateNotification.displayName = 'UpdateNotification';

export default UpdateNotification;