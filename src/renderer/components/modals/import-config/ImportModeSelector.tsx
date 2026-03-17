import React from 'react';
import { Card, Radio, Space, Typography } from 'antd';
import { MergeOutlined, SwapOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * ImportModeSelector component for selecting import mode
 * Handles merge vs replace mode selection with clear descriptions
 */
const ImportModeSelector = ({ importMode, onImportModeChange }) => {
    return (
        <Card size="small" title={<Title level={5} style={{ margin: 0 }}>Import Mode</Title>}>
            <Radio.Group
                value={importMode}
                onChange={(e) => onImportModeChange(e.target.value)}
                style={{ width: '100%' }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Radio value="merge">
                        <Space>
                            <MergeOutlined />
                            <div>
                                <Text strong>Merge with Existing</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Add new items, skip duplicates
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                    <Radio value="replace">
                        <Space>
                            <SwapOutlined />
                            <div>
                                <Text strong>Replace Existing</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Remove all existing items and import fresh (except environments)
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                </Space>
            </Radio.Group>
        </Card>
    );
};

export default ImportModeSelector;