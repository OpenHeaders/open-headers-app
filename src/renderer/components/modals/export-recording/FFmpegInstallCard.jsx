import React from 'react';
import { Alert, Button, Space, Typography, Progress } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { successMessage, errorMessage } from '../../../utils';

const { Text } = Typography;

/**
 * FFmpegInstallCard component for FFmpeg installation when needed for MP4 export
 * 
 * Provides a user-friendly interface for installing FFmpeg when it's not available on the system.
 * FFmpeg is required for converting WebM recordings to MP4 format. This component handles:
 * 
 * Installation Process:
 * - Automatic download of FFmpeg binary for the current platform
 * - Real-time progress updates during download (~32MB for macOS)
 * - Extraction and verification of the installed binary
 * - Error handling with user-friendly messages
 * 
 * UI Features:
 * - Warning-style alert to indicate FFmpeg is required
 * - Progress bars for download and extraction phases
 * - Clear messaging about what's happening at each stage
 * - One-click installation with automatic setup
 * 
 * @param {function} onFFmpegInstalled - Callback function called when FFmpeg is successfully installed
 * @param {string} installStatus - Current installation status ('downloading', 'extracting', 'verifying', or empty)
 * @param {number} downloadProgress - Download progress percentage (0-100)
 * @param {Object} downloadSize - Download size information object
 * @param {number} downloadSize.downloaded - Bytes downloaded so far
 * @param {number} downloadSize.total - Total bytes to download
 * @param {function} onInstallStatusChange - Handler for installation status changes
 * @param {function} onDownloadProgressChange - Handler for download progress changes
 * @param {function} onDownloadSizeChange - Handler for download size changes
 */
const FFmpegInstallCard = ({ 
    onFFmpegInstalled, 
    installStatus, 
    downloadProgress, 
    downloadSize,
    onInstallStatusChange,
    onDownloadProgressChange,
    onDownloadSizeChange
}) => {
    /**
     * Verify FFmpeg installation
     */
    const verifyFFmpegInstallation = async () => {
        const checkResult = await window.electronAPI.checkFFmpeg();
        return typeof checkResult === 'boolean' ? checkResult : (checkResult?.available === true);
    };
    /**
     * Handle FFmpeg installation process
     */
    const handleInstallFFmpeg = async () => {
        onInstallStatusChange('downloading');
        onDownloadProgressChange(0);
        onDownloadSizeChange({ downloaded: 0, total: 0 });
        
        // Set up progress listeners
        const unsubscribeProgress = window.electronAPI.onFFmpegDownloadProgress((progress) => {
            if (typeof progress === 'object' && progress.percent !== undefined) {
                onDownloadProgressChange(Math.round(progress.percent));
                if (progress.downloaded && progress.total) {
                    onDownloadSizeChange({ 
                        downloaded: progress.downloaded, 
                        total: progress.total 
                    });
                }
            } else {
                // Legacy format - just a number 0-1
                onDownloadProgressChange(Math.round(progress * 100));
            }
        });
        
        const unsubscribeStatus = window.electronAPI.onFFmpegInstallStatus((status) => {
            if (status && status.phase) {
                onInstallStatusChange(status.phase);
            }
        });
        
        try {
            // Small delay for UI update
            await new Promise((resolve) => setTimeout(resolve, 100));
            
            // Start download
            await window.electronAPI.downloadFFmpeg();
            
            // Verify installation
            const isInstalled = await verifyFFmpegInstallation();
            
            if (isInstalled) {
                onFFmpegInstalled();
                successMessage('FFmpeg installed successfully!');
            } else {
                errorMessage('FFmpeg installation verification failed');
            }
        } catch (error) {
            console.error('[FFmpeg Install] Installation error:', error);
            errorMessage('Failed to install FFmpeg: ' + (error.message || 'Unknown error'));
        } finally {
            // Cleanup listeners
            if (unsubscribeProgress) unsubscribeProgress();
            if (unsubscribeStatus) unsubscribeStatus();
            onInstallStatusChange('');
            onDownloadProgressChange(0);
            onDownloadSizeChange({ downloaded: 0, total: 0 });
        }
    };

    return (
        <Alert
            message="FFmpeg Not Found"
            description={
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div>
                        <Text>MP4 export requires FFmpeg to convert the video.</Text>
                        <br />
                        <Text type="secondary">
                            Would you like to download and install it automatically? (One-time setup, ~32MB for macOS)
                        </Text>
                    </div>
                    
                    {/* Installation Progress */}
                    {installStatus ? (
                        <div style={{ width: '100%' }}>
                            {installStatus === 'downloading' && (
                                <>
                                    <Text type="secondary">
                                        Downloading FFmpeg... 
                                        {downloadSize.total > 0 && (
                                            <span> 
                                                ({Math.round(downloadSize.downloaded / 1024 / 1024)}MB / {Math.round(downloadSize.total / 1024 / 1024)}MB)
                                            </span>
                                        )}
                                    </Text>
                                    <Progress percent={downloadProgress} status="active" size="small" />
                                </>
                            )}
                            {installStatus === 'extracting' && (
                                <>
                                    <Text type="secondary">Extracting FFmpeg files...</Text>
                                    <Progress percent={100} status="active" size="small" showInfo={false} />
                                </>
                            )}
                            {installStatus === 'verifying' && (
                                <>
                                    <Text type="secondary">Verifying installation...</Text>
                                    <Progress percent={100} status="active" size="small" showInfo={false} />
                                </>
                            )}
                        </div>
                    ) : (
                        /* Install Button */
                        <Button 
                            type="primary" 
                            size="small"
                            onClick={handleInstallFFmpeg}
                            icon={<DownloadOutlined />}
                        >
                            Install FFmpeg
                        </Button>
                    )}
                </Space>
            }
            type="warning"
            showIcon
            style={{ marginTop: '12px' }}
        />
    );
};

export default FFmpegInstallCard;