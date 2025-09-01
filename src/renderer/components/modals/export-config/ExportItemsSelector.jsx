import React from 'react';
import { Card, Checkbox, Space, Typography } from 'antd';

const { Text, Title } = Typography;

/**
 * ExportItemsSelector component for selecting configuration items to export
 * Provides checkboxes for different types of configuration data with clear descriptions
 * 
 * @param {Object} selectedItems - Object containing selection state for each item type
 * @param {function} onItemChange - Handler for item selection changes
 */
const ExportItemsSelector = ({ selectedItems, onItemChange }) => {
    return (
        <Card size="small" title={<Title level={5} style={{ margin: 0 }}>What to Export</Title>}>
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* Header Rules Selection */}
                <Checkbox
                    checked={selectedItems.rules}
                    onChange={() => onItemChange('rules')}
                >
                    <Space>
                        <Text>Header Rules</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            (Request/response modification rules)
                        </Text>
                    </Space>
                </Checkbox>
                
                {/* HTTP Sources Selection */}
                <Checkbox
                    checked={selectedItems.sources}
                    onChange={() => onItemChange('sources')}
                >
                    <Space>
                        <Text>HTTP Sources</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            (API endpoints, file paths, configurations)
                        </Text>
                    </Space>
                </Checkbox>
                
                {/* Proxy Rules Selection */}
                <Checkbox
                    checked={selectedItems.proxyRules}
                    onChange={() => onItemChange('proxyRules')}
                >
                    <Space>
                        <Text>Proxy Rules</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            (URL redirects and proxy settings)
                        </Text>
                    </Space>
                </Checkbox>
            </Space>
        </Card>
    );
};

export default ExportItemsSelector;