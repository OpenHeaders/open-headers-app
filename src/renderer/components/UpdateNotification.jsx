import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Button, notification, Modal, Progress, App } from 'antd';
import { DownloadOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';

const UpdateNotification = forwardRef((props, ref) => {
    const { notification } = App.useApp();
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [manualCheckInProgress, setManualCheckInProgress] = useState(false);

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
            notification.info({
                message: 'Update Available',
                description: `Version ${info.version} is downloading...`,
                duration: 5,
                key: 'update-available'
            });
            setIsDownloading(true);
            setManualCheckInProgress(false);
        };

        const handleUpdateProgress = (progressObj) => {
            setDownloadProgress(Math.round(progressObj.percent) || 0);

            // Only show progress notification occasionally to avoid flooding
            if (Math.round(progressObj.percent) % 20 === 0) {
                notification.info({
                    message: 'Downloading Update',
                    description: (
                        <div>
                            <div>Downloaded {Math.round(progressObj.percent)}%</div>
                            <Progress percent={Math.round(progressObj.percent)} status="active" />
                        </div>
                    ),
                    duration: 2,
                    key: 'update-progress'
                });
            }
        };

        const handleUpdateDownloaded = (info) => {
            setUpdateDownloaded(true);
            setIsDownloading(false);
            setUpdateInfo(info);
            setManualCheckInProgress(false);

            notification.success({
                message: 'Update Ready',
                description: `Version ${info.version} is ready to install`,
                duration: 0,
                key: 'update-downloaded',
                btn: (
                    <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            Modal.confirm({
                                title: 'Install Update',
                                content: 'The application will restart to install the update. Continue?',
                                onOk: () => window.electronAPI.installUpdate(),
                                okText: 'Update Now',
                                cancelText: 'Later'
                            });
                            notification.close('update-downloaded');
                        }}
                    >
                        Install Now
                    </Button>
                )
            });
        };

        const handleUpdateError = (message) => {
            setIsDownloading(false);
            setManualCheckInProgress(false);

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
        // Use a small delay to allow the app to finish loading
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
    }, [manualCheckInProgress]);

    // This component doesn't render anything visible
    return null;
});

export default UpdateNotification;