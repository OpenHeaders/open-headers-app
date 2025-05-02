import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Button, App, Progress } from 'antd';
import { DownloadOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';

const UpdateNotification = forwardRef((props, ref) => {
    const { notification, modal } = App.useApp();
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [manualCheckInProgress, setManualCheckInProgress] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);

    // Notification keys for proper management
    const NOTIFICATION_KEYS = {
        CHECKING: 'checking-updates',
        DOWNLOADING: 'update-download-progress',
        DOWNLOADED: 'update-downloaded',
        INSTALLING: 'update-installing',
        ERROR: 'update-error',
        NOT_AVAILABLE: 'update-not-available'
    };

    // Expose methods via ref to parent components
    useImperativeHandle(ref, () => ({
        checkForUpdates: () => {
            setManualCheckInProgress(true);
            // Clear any existing notifications first
            clearAllNotifications();

            notification.info({
                message: 'Checking for Updates',
                description: 'Looking for new versions...',
                duration: 2,
                key: NOTIFICATION_KEYS.CHECKING
            });
            window.electronAPI.checkForUpdates();
        }
    }));

    // Helper function to clear all update-related notifications
    const clearAllNotifications = () => {
        Object.values(NOTIFICATION_KEYS).forEach(key => {
            notification.destroy(key);
        });
    };

    useEffect(() => {
        // Event handlers for update notifications
        const handleUpdateAvailable = (info) => {
            setUpdateInfo(info);
            setIsDownloading(true);
            setManualCheckInProgress(false);
            setDownloadProgress(0);

            // Clear any existing notifications first
            clearAllNotifications();

            // Initial download notification - we'll update this same notification
            notification.info({
                message: 'Update Available',
                description: (
                    <div>
                        <div>Version {info.version} is downloading...</div>
                        <Progress percent={0} status="active" />
                    </div>
                ),
                duration: 0, // Keep it visible until download completes
                key: NOTIFICATION_KEYS.DOWNLOADING
            });
        };

        const handleUpdateProgress = (progressObj) => {
            const percent = Math.round(progressObj.percent) || 0;
            setDownloadProgress(percent);

            // Update the SAME notification with new progress
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
                duration: 0, // Keep it visible until download completes
                key: NOTIFICATION_KEYS.DOWNLOADING // SAME key as initial notification
            });
        };

        const handleUpdateDownloaded = (info) => {
            setUpdateDownloaded(true);
            setIsDownloading(false);
            setUpdateInfo(info);
            setManualCheckInProgress(false);

            // Close the progress notification first
            notification.destroy(NOTIFICATION_KEYS.DOWNLOADING);

            // Show completion notification
            notification.success({
                message: 'Update Ready',
                description: `Version ${info.version} is ready to install`,
                duration: 0,
                key: NOTIFICATION_KEYS.DOWNLOADED,
                actions: [
                    <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={isInstalling} // Show loading state
                        onClick={() => {
                            // First close the current notification
                            notification.destroy(NOTIFICATION_KEYS.DOWNLOADED);

                            modal.confirm({
                                title: 'Install Update',
                                content: 'The application will restart to install the update. Continue?',
                                onOk: () => {
                                    // Show installing state
                                    setIsInstalling(true);

                                    // Show an installation notification
                                    notification.info({
                                        message: 'Installing Update',
                                        description: 'The application will restart momentarily...',
                                        duration: 0,
                                        key: NOTIFICATION_KEYS.INSTALLING
                                    });

                                    // Call the install function in main process - use this exact event name
                                    window.electronAPI.installUpdate();
                                },
                                okText: 'Update Now',
                                cancelText: 'Later'
                            });
                        }}
                    >
                        {isInstalling ? 'Installing...' : 'Install Now'}
                    </Button>
                ]
            });
        };

        const handleUpdateError = (message) => {
            setIsDownloading(false);
            setManualCheckInProgress(false);
            setIsInstalling(false);

            // Clear all existing notifications first
            clearAllNotifications();

            notification.error({
                message: 'Update Error',
                description: message,
                duration: 8,
                key: NOTIFICATION_KEYS.ERROR
            });
        };

        const handleUpdateNotAvailable = (info) => {
            // Only show this notification when manually checking for updates
            if (manualCheckInProgress) {
                // Clear any existing notifications first
                clearAllNotifications();

                notification.success({
                    message: 'No Updates Available',
                    description: 'You are already using the latest version.',
                    duration: 4,
                    key: NOTIFICATION_KEYS.NOT_AVAILABLE,
                    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />
                });
                setManualCheckInProgress(false);
            }
        };

        // Set up event listeners
        const unsubscribeAvailable = window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
        const unsubscribeProgress = window.electronAPI.onUpdateProgress(handleUpdateProgress);
        const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
        const unsubscribeError = window.electronAPI.onUpdateError(handleUpdateError);
        const unsubscribeNotAvailable = window.electronAPI.onUpdateNotAvailable(handleUpdateNotAvailable);

        // Check for updates on component mount (silent check)
        const initialCheckTimer = setTimeout(() => {
            window.electronAPI.checkForUpdates();
        }, 5000);

        // Clean up listeners on unmount
        return () => {
            unsubscribeAvailable();
            unsubscribeProgress();
            unsubscribeDownloaded();
            unsubscribeError();
            unsubscribeNotAvailable();
            clearTimeout(initialCheckTimer);
            clearAllNotifications();
        };
    }, [manualCheckInProgress, notification, modal, isInstalling]);

    // This component doesn't render anything visible
    return null;
});

export default UpdateNotification;