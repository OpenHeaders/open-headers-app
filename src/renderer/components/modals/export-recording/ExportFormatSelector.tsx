import React from 'react';
import { Radio, Space, Typography, theme } from 'antd';
import { FileOutlined, VideoCameraOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;
const { useToken } = theme;

/**
 * ExportFormatSelector component for selecting recording export format
 * 
 * Provides a user-friendly interface for choosing between JSON session recording
 * and video export formats. Includes visual feedback for availability and state.
 * 
 * Features:
 * - JSON export: Complete session data with DOM events, console logs, network activity
 * - Video export: Browser recording as video file (requires video recording to be available)
 * - Visual state indicators: Different styling for selected, disabled, and available states
 * - Accessibility: Proper ARIA attributes and keyboard navigation support
 * 
 * @param {string} exportType - Current selected export type ('json' or 'video')
 * @param {function} onExportTypeChange - Callback function when export type selection changes
 * @param {Object} record - Recording data object containing metadata about the session
 * @param {boolean} record.hasVideo - Whether video recording is available for this session
 * @param {boolean} isExporting - Whether export process is currently in progress (disables controls)
 */
const ExportFormatSelector = ({ exportType, onExportTypeChange, record, isExporting }) => {
    const { token } = useToken();
    return (
        <div>
            <Title level={5} style={{ marginBottom: 0 }}>Export Format</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>Choose how you want to export this recording</Text>
            
            <Radio.Group 
                value={exportType} 
                onChange={(e) => onExportTypeChange(e.target.value)}
                style={{ width: '100%', marginTop: 16 }}
                disabled={isExporting}
            >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {/* JSON Export Option - Always available */}
                    <Radio value="json" style={{ 
                        width: '100%',
                        padding: '14px',
                        // Theme-aware backgrounds
                        background: exportType === 'json' ? token.colorSuccessBg : token.colorBgContainer,
                        borderRadius: '8px',
                        // Theme-aware borders
                        border: exportType === 'json' ? `1px solid ${token.colorSuccessBorder}` : `1px solid ${token.colorBorder}`,
                        transition: 'all 0.2s'
                    }}>
                        <Space align="start">
                            <FileOutlined style={{ fontSize: 22, color: '#1890ff', marginTop: 2 }} />
                            <div>
                                <Text strong style={{ fontSize: 14 }}>Session Recording (JSON)</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
                                    Complete recording with DOM events, console logs, network activity, storage changes, and other metadata.
                                    Can be imported back for playback.
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                    
                    {/* Video Export Option - Only available when video recording exists */}
                    <Radio 
                        value="video" 
                        style={{ 
                            width: '100%',
                            padding: '14px',
                            // Theme-aware backgrounds
                            background: !record.hasVideo ? token.colorBgTextDisabled : exportType === 'video' ? token.colorSuccessBg : token.colorBgContainer,
                            borderRadius: '8px',
                            // Theme-aware borders
                            border: !record.hasVideo ? `1px solid ${token.colorBorder}` : exportType === 'video' ? `1px solid ${token.colorSuccessBorder}` : `1px solid ${token.colorBorder}`,
                            transition: 'all 0.2s',
                            cursor: !record.hasVideo ? 'not-allowed' : 'pointer'
                        }}
                        disabled={!record.hasVideo}
                    >
                        <Space align="start">
                            <VideoCameraOutlined 
                                style={{ 
                                    fontSize: 22, 
                                    // Theme-aware icon colors
                                    color: record.hasVideo ? token.colorSuccess : token.colorTextDisabled,
                                    marginTop: 2
                                }} 
                            />
                            <div>
                                <Text strong style={{ 
                                    fontSize: 14,
                                    // Theme-aware text color
                                    color: !record.hasVideo ? token.colorTextDisabled : undefined 
                                }}>
                                    Video Recording
                                </Text>
                                <br />
                                <Text 
                                    type="secondary" 
                                    style={{ 
                                        fontSize: 12,
                                        lineHeight: 1.5,
                                        // Theme-aware text color
                                        color: !record.hasVideo ? token.colorTextDisabled : undefined 
                                    }}
                                >
                                    {/* Dynamic description based on video availability */}
                                    {record.hasVideo 
                                        ? 'Export the browser recording as a video file for easy sharing' 
                                        : 'No video recording available for this session'}
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                </Space>
            </Radio.Group>
        </div>
    );
};

export default ExportFormatSelector;