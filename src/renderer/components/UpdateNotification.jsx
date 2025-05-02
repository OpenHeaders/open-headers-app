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
    const [isInstalling, setIsInstalling] = useState(false); // Added state for installation

    // Expose methods via ref to parent components
    useImperativeHandle(ref, () => ({
        checkForUpdates: () => {
            setManualCheckInProgress(true);
            notification.info({
                message: 'Checking for Updates',
                description: 'Looking for new versions...',
                duration: 2,
                key: 'checking-updates'
            });
            window.electronAPI.checkForUpdates();
        }
    }));

    useEffect(() => {
        // Event handlers for update notifications
        const handleUpdateAvailable = (info) => {
            setUpdateInfo(info);
            setIsDownloading(true);
            setManualCheckInProgress(false);
            setDownloadProgress(0);

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
                key: 'update-download-progress' // Use ONE consistent key for all progress updates
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
                        <div>Downloaded {percent}%</div>
                        <Progress percent={percent} status="active" />
                    </div>
                ),
                duration: 0, // Keep it visible until download completes
                key: 'update-download-progress' // SAME key as initial notification
            });
        };

        const handleUpdateDownloaded = (info) => {
            setUpdateDownloaded(true);
            setIsDownloading(false);
            setUpdateInfo(info);
            setManualCheckInProgress(false);

            // Close the progress notification
            notification.destroy('update-download-progress');

            // Show completion notification
            notification.success({
                message: 'Update Ready',
                description: `Version ${info.version} is ready to install`,
                duration: 0,
                key: 'update-downloaded',
                actions: [
                    <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={isInstalling} // Show loading state
                        onClick={() => {
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
                                        key: 'update-installing'
                                    });

                                    // Remove the previous notification
                                    notification.destroy('update-downloaded');

                                    // Call the install function in main process
                                    window.electronAPI.installUpdate();

                                    // Add a fallback - if app hasn't restarted after 10 seconds,
                                    // show an error and reset installing state
                                    setTimeout(() => {
                                        if (document.hasFocus()) { // If app is still running
                                            setIsInstalling(false);
                                            notification.destroy('update-installing');
                                            notification.error({
                                                message: 'Installation Failed',
                                                description: 'The update installation failed. Please try again or download the latest version manually.',
                                                duration: 0,
                                                key: 'update-install-failed',
                                                actions: [
                                                    <Button
                                                        type="primary"
                                                        size="small"
                                                        onClick={() => {
                                                            // Try to open GitHub releases page if available
                                                            if (window.electronAPI.openExternal) {
                                                                window.electronAPI.openExternal('https://github.com/OpenHeaders/open-headers-app/releases/latest');
                                                            }
                                                        }}
                                                    >
                                                        Download Manually
                                                    </Button>
                                                ]
                                            });
                                        }
                                    }, 10000);
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

            // Close the progress notification
            notification.destroy('update-download-progress');
            notification.destroy('update-installing');

            notification.error({
                message: 'Update Error',
                description: message,
                duration: 8,
                key: 'update-error'
            });
        };

        const handleUpdateNotAvailable = (info) => {
            // Only show this notification when manually checking for updates
            if (manualCheckInProgress) {
                notification.success({
                    message: 'No Updates Available',
                    description: 'You are already using the latest version.',
                    duration: 4,
                    key: 'update-not-available',
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
        };
    }, [manualCheckInProgress, notification, modal, isInstalling]); // Added isInstalling to dependency array

    // This component doesn't render anything visible
    return null;
});

export default UpdateNotification;