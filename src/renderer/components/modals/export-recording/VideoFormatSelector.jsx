import React from 'react';
import { Radio, Space, Typography, theme } from 'antd';
import { FileOutlined, VideoCameraOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { useToken } = theme;

/**
 * VideoFormatSelector component for selecting video export format
 * 
 * Provides a choice between WebM (native recording format) and MP4 (converted format).
 * Each format has distinct advantages and use cases:
 * 
 * WebM Format:
 * - Original recording format (no conversion needed)
 * - Instant export with smaller file sizes
 * - Best for quick sharing and web playback
 * 
 * MP4 Format:
 * - Universal compatibility across all video players
 * - Requires FFmpeg conversion (may need installation)
 * - Best for sharing with non-technical users
 * 
 * @param {string} videoFormat - Currently selected video format ('webm' or 'mp4')
 * @param {function} onVideoFormatChange - Callback function when format selection changes
 * @param {boolean} isExporting - Whether export process is active (disables format selection)
 */
const VideoFormatSelector = ({ videoFormat, onVideoFormatChange, isExporting }) => {
    const { token } = useToken();
    return (
        <div style={{ 
            marginTop: '16px',
            padding: '16px',
            // Theme-aware background and border
            background: token.colorFillAlter,
            borderRadius: '8px',
            border: `1px solid ${token.colorBorder}`
        }}>
            <Text strong style={{ marginBottom: '12px', display: 'block', fontSize: '14px' }}>
                Choose Video Format:
            </Text>
            
            <Radio.Group 
                value={videoFormat} 
                onChange={(e) => onVideoFormatChange(e.target.value)}
                disabled={isExporting}
                style={{ width: '100%' }}
            >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {/* WebM Format Option - Native recording format */}
                    <Radio value="webm" style={{ 
                        width: '100%',
                        padding: '12px',
                        // Theme-aware backgrounds
                        background: videoFormat === 'webm' ? token.colorPrimaryBg : token.colorBgContainer,
                        borderRadius: '6px',
                        // Theme-aware borders
                        border: videoFormat === 'webm' ? `1px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                        transition: 'all 0.2s'
                    }}>
                        <Space align="start">
                            <FileOutlined style={{ fontSize: 18, color: token.colorSuccess, marginTop: 2 }} />
                            <div>
                                <Text strong style={{ fontSize: 13 }}>WebM (Native Format)</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Original recording • Instant export • Smaller file size
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                    
                    {/* MP4 Format Option - Universal compatibility (requires FFmpeg) */}
                    <Radio value="mp4" style={{ 
                        width: '100%',
                        padding: '12px',
                        // Theme-aware backgrounds
                        background: videoFormat === 'mp4' ? token.colorPrimaryBg : token.colorBgContainer,
                        borderRadius: '6px',
                        // Theme-aware borders
                        border: videoFormat === 'mp4' ? `1px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                        transition: 'all 0.2s'
                    }}>
                        <Space align="start">
                            <VideoCameraOutlined style={{ fontSize: 18, color: token.colorPrimary, marginTop: 2 }} />
                            <div>
                                <Text strong style={{ fontSize: 13 }}>MP4</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Universal compatibility • Works in all video players
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                </Space>
            </Radio.Group>
        </div>
    );
};

export default VideoFormatSelector;