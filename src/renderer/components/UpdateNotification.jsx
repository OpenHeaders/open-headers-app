// src/renderer/components/UpdateNotification.jsx
import React, { useEffect, useState } from 'react';
import { Button, Modal, notification } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';

const UpdateNotification = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);

    useEffect(() => {
        // Listen for update events from main process
        const unsubscribeAvailable = window.electronAPI.onUpdateAvailable((info) => {
            setUpdateAvailable(true);
            setUpdateInfo(info);
            notification.info({
                message: 'Update Available',
                description: `Version ${info.version} is available for download.`,
                duration: 10,
                btn: (
                    <Button type="primary" size="small" onClick={() => {
                        notification.close('update-available');
                    }}>
                        OK
                    </Button>
                ),
                key: 'update-available'
            });
        });

        const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
            setUpdateDownloaded(true);
            setUpdateInfo(info);
            notification.success({
                message: 'Update Ready',
                description: `Version ${info.version} has been downloaded and is ready to install.`,
                duration: 0,
                btn: (
                    <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            Modal.confirm({
                                title: 'Install Update',
                                content: 'The application will restart to install the update. Continue?',
                                onOk: () => window.electronAPI.restartAndInstall(),
                                okText: 'Update Now',
                                cancelText: 'Later'
                            });
                            notification.close('update-downloaded');
                        }}
                    >
                        Install Now
                    </Button>
                ),
                key: 'update-downloaded'
            });
        });

        const unsubscribeError = window.electronAPI.onUpdateError((message) => {
            console.error('Update error:', message);
            // Only show error notification if it's a user-initiated check
            if (updateAvailable) {
                notification.error({
                    message: 'Update Error',
                    description: `Failed to download update: ${message}`,
                    duration: 10
                });
            }
        });

        // Manual check for updates at component mount
        window.electronAPI.checkForUpdates();

        return () => {
            unsubscribeAvailable();
            unsubscribeDownloaded();
            unsubscribeError();
        };
    }, []);

    // Add a menu item to check for updates
    const checkForUpdates = () => {
        notification.info({
            message: 'Checking for Updates',
            description: 'Looking for new versions...',
            duration: 3
        });
        window.electronAPI.checkForUpdates();
    };

    // This component doesn't render anything by itself
    // It just manages update notifications
    return null;
};

export default UpdateNotification;