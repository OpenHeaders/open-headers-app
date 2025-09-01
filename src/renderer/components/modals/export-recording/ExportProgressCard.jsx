import React from 'react';
import { Progress, Space, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * ExportProgressCard component for showing export progress
 * 
 * Displays contextual progress indicators for different stages of the export process.
 * Automatically hides when no export is active and shows relevant UI based on current status.
 * 
 * Export Stages:
 * - 'downloading': FFmpeg download progress with percentage bar
 * - 'converting': Video conversion progress with percentage bar
 * - 'saving': File saving with spinner animation (no percentage)
 * 
 * The component provides visual feedback to users during potentially long-running operations,
 * helping them understand what's happening and roughly how long it might take.
 * 
 * @param {string} exportStatus - Current export status ('downloading', 'converting', 'saving', or empty)
 * @param {number} downloadProgress - Download progress percentage (0-100) for FFmpeg installation
 * @param {number} conversionProgress - Video conversion progress percentage (0-100) for MP4 conversion
 */
const ExportProgressCard = ({ exportStatus, downloadProgress, conversionProgress }) => {
    // Hide component when no export is active
    if (!exportStatus) return null;

    return (
        <div style={{ marginTop: '16px' }}>
            {/* FFmpeg Download Progress - Only for MP4 export when FFmpeg not installed */}
            {exportStatus === 'downloading' && (
                <div>
                    <Text type="secondary">Downloading FFmpeg...</Text>
                    <Progress percent={downloadProgress} status="active" />
                </div>
            )}
            
            {/* Video Conversion Progress - Only for MP4 export during FFmpeg conversion */}
            {exportStatus === 'converting' && (
                <div>
                    <Text type="secondary">Converting to MP4...</Text>
                    <Progress percent={conversionProgress} status="active" />
                </div>
            )}
            
            {/* Video Saving Progress - For both WebM and MP4 during file write */}
            {exportStatus === 'saving' && (
                <div>
                    <Space>
                        <LoadingOutlined />
                        <Text type="secondary">Saving video...</Text>
                    </Space>
                </div>
            )}
        </div>
    );
};

export default ExportProgressCard;