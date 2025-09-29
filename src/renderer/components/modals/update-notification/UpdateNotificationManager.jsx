import React from 'react';
import { Button, Progress } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';

/**
 * UpdateNotificationManager - Manages notification display and formatting
 * 
 * Provides centralized notification content generation and display logic
 * for different update states. Handles notification keys, content formatting,
 * and user interaction elements.
 * 
 * Features:
 * - Consistent notification formatting across all update states
 * - Centralized notification key management
 * - Progress indicator formatting
 * - Install button generation with confirmation dialogs
 * - Proper cleanup and state management
 * 
 * @param {Object} notification - Ant Design notification API
 * @param {Object} modal - Ant Design modal API
 * @param {Object} token - Theme token for styling
 * @param {boolean} isInstalling - Whether update installation is in progress
 * @param {function} setIsInstalling - State setter for installation status
 * @param {function} debugLog - Debug logging function
 */
export const UpdateNotificationManager = ({
    notification,
    modal,
    token,
    isInstalling,
    setIsInstalling,
    debugLog
}) => {
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

    /**
     * Clear all update-related notifications
     */
    const clearAllNotifications = () => {
        debugLog('Clearing all update notifications');
        Object.values(NOTIFICATION_KEYS).forEach(key => {
            notification.destroy(key);
        });
    };

    /**
     * Clear a specific notification by key
     * @param {string} key - Notification key to clear
     */
    const clearNotification = (key) => {
        debugLog(`Clearing notification with key: ${key}`);
        notification.destroy(key);
    };

    /**
     * Show checking for updates notification
     */
    const showCheckingNotification = () => {
        debugLog('Showing checking for updates notification');
        notification.open({
            message: 'Checking for Updates',
            description: 'Looking for new versions…',
            duration: 0,
            key: NOTIFICATION_KEYS.CHECKING,
            icon: <LoadingOutlined spin />
        });
    };

    /**
     * Show already checking notification
     * @param {boolean} isDownloading - Whether download is in progress
     */
    const showAlreadyCheckingNotification = (isDownloading) => {
        notification.info({
            message: isDownloading ? 'Download In Progress' : 'Check In Progress',
            description: isDownloading
                ? 'Already downloading the latest update'
                : 'Already checking for updates',
            duration: 3,
            key: NOTIFICATION_KEYS.ALREADY_CHECKING
        });
    };

    /**
     * Show update available notification with download progress
     * @param {Object} info - Update information
     * @param {number} progress - Download progress (0-100)
     */
    const showUpdateAvailableNotification = (info, progress = 0) => {
        debugLog(`Showing update available notification for version ${info.version}`);
        notification.info({
            message: 'Update Available',
            description: (
                <div>
                    <div>Version {info.version} is downloading...</div>
                    <Progress percent={progress} status="active" />
                </div>
            ),
            duration: 0,
            key: NOTIFICATION_KEYS.DOWNLOADING
        });
    };

    /**
     * Show download progress notification
     * @param {number} percent - Download progress percentage
     */
    const showDownloadProgressNotification = (percent) => {
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
    };

    /**
     * Create install button with confirmation dialog
     * @returns {React.ReactNode} Install button component
     */
    const createInstallButton = () => {
        return (
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
    };

    /**
     * Show update ready notification
     * @param {Object} info - Update information
     */
    const showUpdateReadyNotification = (info) => {
        debugLog(`Showing update ready notification for version ${info.version}`);
        
        const installButton = createInstallButton();
        
        notification.success({
            message: 'Update Ready',
            description: `Version ${info.version} is ready to install`,
            duration: 0,
            key: NOTIFICATION_KEYS.DOWNLOADED,
            btn: installButton
        });
    };

    /**
     * Show no updates available notification
     */
    const showNoUpdatesNotification = () => {
        debugLog('Showing no updates available notification');
        notification.success({
            message: 'No Updates Available',
            description: 'You are already using the latest version.',
            duration: 4,
            key: NOTIFICATION_KEYS.NOT_AVAILABLE,
            icon: <CheckCircleOutlined style={{ color: token.colorSuccess || '#52c41a' }} />
        });
    };

    /**
     * Show update error notification
     * @param {string} message - Error message
     */
    const showUpdateErrorNotification = (message) => {
        debugLog('Showing update error notification');
        notification.error({
            message: 'Update Error',
            description: message,
            duration: 8,
            key: NOTIFICATION_KEYS.ERROR
        });
    };

    return {
        NOTIFICATION_KEYS,
        clearAllNotifications,
        clearNotification,
        showCheckingNotification,
        showAlreadyCheckingNotification,
        showUpdateAvailableNotification,
        showDownloadProgressNotification,
        showUpdateReadyNotification,
        showNoUpdatesNotification,
        showUpdateErrorNotification
    };
};