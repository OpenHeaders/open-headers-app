import React, { useState, useEffect } from 'react';
import { Modal, Space, Button } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { successMessage, errorMessage } from '../../../utils';

import ExportFormatSelector from './ExportFormatSelector';
import VideoFormatSelector from './VideoFormatSelector';
import FFmpegInstallCard from './FFmpegInstallCard';
import ExportProgressCard from './ExportProgressCard';
import ExportInfoCard from './ExportInfoCard';

/**
 * RecordingExportModal component for exporting recorded sessions
 * 
 * Main orchestrator component that provides a comprehensive interface for exporting
 * recorded sessions in multiple formats. Coordinates between multiple sub-components
 * to handle format selection, FFmpeg installation, and progress tracking.
 * 
 * Export Options:
 * - JSON: Complete session data with DOM events, console logs, network activity
 * - Video: Browser recording as WebM (native) or MP4 (converted)
 * 
 * Features:
 * - Intelligent format selection based on recording availability
 * - Automatic FFmpeg installation for MP4 conversion
 * - Real-time progress tracking for all export operations
 * - Error handling with user-friendly messages
 * - Modal state management with proper cleanup
 * 
 * Component Architecture:
 * This component acts as the main coordinator, delegating UI rendering to:
 * - ExportFormatSelector: JSON vs Video selection
 * - VideoFormatSelector: WebM vs MP4 selection
 * - FFmpegInstallCard: FFmpeg installation interface
 * - ExportProgressCard: Progress display
 * - ExportInfoCard: Helpful tips and information
 * 
 * @param {boolean} visible - Whether the modal is visible
 * @param {function} onCancel - Handler for modal close/cancel
 * @param {Object} record - Recording data object containing session information
 * @param {boolean} record.hasVideo - Whether video recording is available
 * @param {string} record.id - Unique identifier for the recording
 * @param {number} record.timestamp - Recording timestamp
 * @param {function} onExportJson - Handler for JSON export completion
 */
const RecordingExportModal = ({ visible, onCancel, record, onExportJson }) => {
    // Export configuration state
    const [exportType, setExportType] = useState('json');
    const [videoFormat, setVideoFormat] = useState('webm');
    
    // Export process state
    const [isExporting, setIsExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState(''); // 'downloading' | 'converting' | 'saving'
    
    // FFmpeg related state
    const [ffmpegAvailable, setFfmpegAvailable] = useState(null);
    const [installStatus, setInstallStatus] = useState(''); // 'downloading' | 'extracting' | 'verifying'
    
    // Progress tracking state
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [conversionProgress, setConversionProgress] = useState(0);
    const [downloadSize, setDownloadSize] = useState({ downloaded: 0, total: 0 });
    
    /**
     * Check FFmpeg availability when modal opens and MP4 export is selected
     */
    useEffect(() => {
        if (visible && exportType === 'video' && videoFormat === 'mp4') {
            checkFFmpegAvailability().catch(error => {
                console.error('FFmpeg availability check failed:', error);
            });
        } else if (exportType === 'video' && videoFormat === 'webm') {
            // WebM doesn't need FFmpeg
            setFfmpegAvailable(true);
        }
    }, [visible, exportType, videoFormat]);

    /**
     * Reset states when modal closes
     */
    useEffect(() => {
        if (!visible) {
            setIsExporting(false);
            setExportStatus('');
            setDownloadProgress(0);
            setConversionProgress(0);
            setFfmpegAvailable(null);
            setInstallStatus('');
            setDownloadSize({ downloaded: 0, total: 0 });
        }
    }, [visible]);

    /**
     * Check if FFmpeg is available on the system
     */
    const checkFFmpegAvailability = async () => {
        try {
            console.log('[Recording Export] Checking FFmpeg availability...');
            const result = await window.electronAPI.checkFFmpeg();
            console.log('[Recording Export] FFmpeg check result:', result);
            
            // Handle both boolean and object responses
            const available = typeof result === 'boolean' ? result : (result?.available === true);
            console.log('[Recording Export] FFmpeg available:', available);
            setFfmpegAvailable(available);
        } catch (error) {
            console.error('[Recording Export] Failed to check FFmpeg:', error);
            setFfmpegAvailable(false);
        }
    };

    /**
     * Handle the main export process
     */
    const handleExport = async () => {
        if (exportType === 'json') {
            onExportJson(record);
            onCancel();
        } else {
            await handleVideoExport();
        }
    };

    /**
     * Handle video export process with format conversion
     */
    const handleVideoExport = async () => {
        setIsExporting(true);
        setExportStatus('');
        
        try {
            // Generate filename
            const timestamp = new Date(record.timestamp).toISOString().replace(/:/g, '-').split('.')[0];
            const extension = videoFormat === 'mp4' ? 'mp4' : 'webm';
            const filename = `open-headers_recording_${timestamp}.${extension}`;
            
            // Show save dialog
            const filePath = await window.electronAPI.saveFileDialog({
                title: 'Export Video Recording',
                buttonLabel: 'Export',
                defaultPath: filename,
                filters: [
                    { name: `${extension.toUpperCase()} Video`, extensions: [extension] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!filePath) {
                setIsExporting(false);
                return;
            }

            // Get recording path
            const appPath = await window.electronAPI.getAppPath();
            const recordingPath = `${appPath}/recordings/${record.id}/video.webm`;

            if (videoFormat === 'webm') {
                // Direct copy for WebM
                await handleWebMExport(recordingPath, filePath);
            } else {
                // MP4 conversion
                await handleMP4Export(recordingPath, filePath);
            }
        } catch (error) {
            console.error('Failed to export video:', error);
            errorMessage('Failed to export video: ' + error.message);
        } finally {
            setIsExporting(false);
            setExportStatus('');
            setDownloadProgress(0);
            setConversionProgress(0);
        }
    };

    /**
     * Handle WebM export (direct copy)
     */
    const handleWebMExport = async (recordingPath, filePath) => {
        setExportStatus('saving');
        try {
            // Read video file as binary (Buffer)
            const videoData = await window.electronAPI.readFile(recordingPath, 'buffer');
            await window.electronAPI.writeFile(filePath, videoData);
            successMessage('Video exported as WebM successfully');
            onCancel();
        } catch (error) {
            throw new Error(`Failed to copy video file: ${error.message}`);
        }
    };

    /**
     * Handle MP4 export (with FFmpeg conversion)
     */
    const handleMP4Export = async (recordingPath, filePath) => {
        // Download FFmpeg if not available
        if (!ffmpegAvailable) {
            setExportStatus('downloading');
            setDownloadProgress(0);
            
            // Listen for download progress
            const unsubscribe = window.electronAPI.onFFmpegDownloadProgress((progress) => {
                setDownloadProgress(Math.round(progress * 100));
            });
            
            try {
                await window.electronAPI.downloadFFmpeg();
                setFfmpegAvailable(true);
            } finally {
                if (unsubscribe) unsubscribe();
            }
        }
        
        // Convert to MP4
        setExportStatus('converting');
        setConversionProgress(0);
        
        // Listen for conversion progress
        const unsubscribe = window.electronAPI.onVideoConversionProgress((progress) => {
            setConversionProgress(Math.round(progress * 100));
        });
        
        try {
            const result = await window.electronAPI.convertVideo(recordingPath, filePath);
            if (result && result.success) {
                successMessage('Video exported as MP4 successfully');
                onCancel();
            } else {
                throw new Error(result?.error || 'Conversion failed');
            }
        } finally {
            if (unsubscribe) unsubscribe();
        }
    };

    /**
     * Handle successful FFmpeg installation
     */
    const handleFFmpegInstalled = () => {
        setFfmpegAvailable(true);
    };

    /**
     * Check if export button should be disabled
     */
    const isExportDisabled = () => {
        return (exportType === 'video' && !record.hasVideo) || 
               isExporting ||
               (exportType === 'video' && videoFormat === 'mp4' && ffmpegAvailable === false);
    };

    // Don't render if no record
    if (!record) return null;

    return (
        <Modal
            title="Export Recording"
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button 
                    key="cancel" 
                    onClick={onCancel}
                    disabled={isExporting}
                >
                    Cancel
                </Button>,
                <Button
                    key="export"
                    type="primary"
                    icon={isExporting ? <LoadingOutlined /> : <DownloadOutlined />}
                    onClick={handleExport}
                    disabled={isExportDisabled()}
                    loading={isExporting}
                >
                    {isExporting ? 'Exporting...' : 'Export'}
                </Button>
            ]}
            closable={!isExporting}
            maskClosable={!isExporting}
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {/* Export Format Selection */}
                <ExportFormatSelector
                    exportType={exportType}
                    onExportTypeChange={setExportType}
                    record={record}
                    isExporting={isExporting}
                />

                {/* Export Information */}
                <ExportInfoCard exportType={exportType} />

                {/* Video Format Selection */}
                {exportType === 'video' && record.hasVideo && (
                    <VideoFormatSelector
                        videoFormat={videoFormat}
                        onVideoFormatChange={setVideoFormat}
                        isExporting={isExporting}
                    />
                )}

                {/* FFmpeg Installation Card */}
                {exportType === 'video' && videoFormat === 'mp4' && ffmpegAvailable === false && (
                    <FFmpegInstallCard
                        onFFmpegInstalled={handleFFmpegInstalled}
                        installStatus={installStatus}
                        downloadProgress={downloadProgress}
                        downloadSize={downloadSize}
                        onInstallStatusChange={setInstallStatus}
                        onDownloadProgressChange={setDownloadProgress}
                        onDownloadSizeChange={setDownloadSize}
                    />
                )}

                {/* Export Progress */}
                <ExportProgressCard
                    exportStatus={exportStatus}
                    downloadProgress={downloadProgress}
                    conversionProgress={conversionProgress}
                />
            </Space>
        </Modal>
    );
};

export default RecordingExportModal;