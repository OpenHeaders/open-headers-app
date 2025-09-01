import React from 'react';
import { Card, Checkbox, Space, Typography, Badge, Tooltip, Alert } from 'antd';
import { InfoCircleOutlined, QuestionCircleOutlined, WarningOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * ImportItemsSelector component for selecting configuration items to import
 * Provides checkboxes for different data types with counts, descriptions, and warnings
 * 
 * @param {Object} fileInfo - Information about the selected files
 * @param {Object} combinedEnvInfo - Combined environment information from all files
 * @param {Object} selectedItems - Currently selected items to import
 * @param {function} onItemChange - Handler for item selection changes
 * @param {string} importMode - Current import mode ('merge' or 'replace')
 */
const ImportItemsSelector = ({ 
    fileInfo, 
    combinedEnvInfo, 
    selectedItems, 
    onItemChange,
    importMode
}) => {
    return (
        <Card size="small" title={
            <Space>
                <Title level={5} style={{ margin: 0 }}>Select What to Import</Title>
                <Tooltip title="Choose which parts of the configuration you want to import. Unselected items will be ignored even if they exist in the file.">
                    <InfoCircleOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />
                </Tooltip>
            </Space>
        }>
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* HTTP Sources */}
                {fileInfo && fileInfo.hasSources && (
                    <Checkbox
                        checked={selectedItems.sources}
                        onChange={() => onItemChange('sources')}
                    >
                        <Space>
                            <Text>HTTP Sources</Text>
                            <Badge count={fileInfo.sourceCount} showZero style={{ backgroundColor: '#95de64' }} />
                            <Tooltip title="API endpoints and HTTP request configurations">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    </Checkbox>
                )}

                {/* Header Rules */}
                {fileInfo && fileInfo.hasRules && (
                    <Checkbox
                        checked={selectedItems.rules}
                        onChange={() => onItemChange('rules')}
                    >
                        <Space>
                            <Text>Header Rules</Text>
                            <Badge count={fileInfo.ruleCount} showZero style={{ backgroundColor: '#95de64' }} />
                            <Tooltip title="Rules for modifying HTTP headers, URLs, and page content">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    </Checkbox>
                )}

                {/* Proxy Rules */}
                {fileInfo && fileInfo.hasProxyRules && (
                    <Checkbox
                        checked={selectedItems.proxyRules}
                        onChange={() => onItemChange('proxyRules')}
                    >
                        <Space>
                            <Text>Proxy Rules</Text>
                            <Badge count={fileInfo.proxyRuleCount} showZero style={{ backgroundColor: '#95de64' }} />
                            <Tooltip title="URL redirection and proxy configuration rules">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    </Checkbox>
                )}

                {/* Environment Variables */}
                {(combinedEnvInfo.hasEnvironmentSchema || combinedEnvInfo.hasEnvironments) && (
                    <Checkbox
                        checked={selectedItems.environments}
                        onChange={() => onItemChange('environments')}
                    >
                        <Space>
                            <Text>Environment Variables</Text>
                            <Badge count={combinedEnvInfo.variableCount} showZero style={{ backgroundColor: '#95de64' }} />
                            {combinedEnvInfo.hasEnvironments && (
                                <Tooltip title="This file contains actual environment values which may include sensitive data">
                                    <WarningOutlined style={{ color: '#faad14' }} />
                                </Tooltip>
                            )}
                            <Tooltip title="Variable definitions and their values for different environments">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    </Checkbox>
                )}
            </Space>
            
            {/* Environment merge info */}
            {selectedItems.environments && (
                <Alert
                    message="Environment Variables Import Behavior"
                    description={
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            {importMode === 'merge' 
                                ? 'Variables in the import file will be skipped if they already exist. New variables will be added.'
                                : 'Variables in the import file will overwrite existing ones with the same name. Variables not in the import file will remain unchanged.'}
                        </Text>
                    }
                    type="info"
                    showIcon={false}
                    style={{ marginTop: 8 }}
                />
            )}
        </Card>
    );
};

export default ImportItemsSelector;