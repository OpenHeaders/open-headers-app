import React from 'react';
import { Card, Radio, Space, Typography } from 'antd';
import { FileOutlined, FolderOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * FileFormatSelector component for selecting export file format
 * Provides options for single file or multiple files export with conditional availability
 * 
 * @param {string} fileFormat - Current file format selection ('single' or 'separate')
 * @param {function} onFileFormatChange - Handler for file format changes
 * @param {string} environmentOption - Environment export option affecting availability
 */
const FileFormatSelector = ({ fileFormat, onFileFormatChange, environmentOption }) => {
    return (
        <Card size="small" title={<Title level={5} style={{ margin: 0 }}>File Format</Title>}>
            <Radio.Group
                value={fileFormat}
                onChange={(e) => onFileFormatChange(e.target.value)}
                style={{ width: '100%' }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    {/* Single file format option */}
                    <Radio value="single">
                        <Space>
                            <FileOutlined />
                            <div>
                                <Text strong>Single File</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Everything in one JSON file - simpler to manage
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                    
                    {/* Multiple files format option - disabled when no environment variables */}
                    <Radio value="separate" disabled={environmentOption === 'none'}>
                        <Space>
                            <FolderOutlined />
                            <div>
                                <Text strong={environmentOption !== 'none'} disabled={environmentOption === 'none'}>
                                    Multiple Files
                                </Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    {environmentOption === 'none' 
                                        ? 'Only available when including environment variables'
                                        : 'Separate files for config and environment schema - better for large teams'
                                    }
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                </Space>
            </Radio.Group>
        </Card>
    );
};

export default FileFormatSelector;