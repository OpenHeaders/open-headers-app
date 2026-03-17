import React from 'react';
import { Card, Radio, Space, Typography, Divider, Empty, Spin, Checkbox } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { SafetyOutlined, WarningOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface EnvironmentVariablesCardProps {
    exportPurpose: string;
    environmentOption: string;
    onEnvironmentOptionChange: (value: string) => void;
    fileFormat: string;
    onFileFormatChange: (value: string) => void;
    environments: Record<string, Record<string, unknown>>;
    environmentsReady: boolean;
    selectedEnvironments: Record<string, boolean>;
    onEnvironmentSelectionChange: (envName: string, checked: boolean) => void;
    onSelectAllEnvironments: () => void;
    onSelectNoEnvironments: () => void;
}

/**
 * EnvironmentVariablesCard component for environment variables configuration
 * Provides options for exporting environment variables with security considerations
 */
const EnvironmentVariablesCard: React.FC<EnvironmentVariablesCardProps> = ({
    exportPurpose,
    environmentOption,
    onEnvironmentOptionChange,
    fileFormat,
    onFileFormatChange,
    environments,
    environmentsReady,
    selectedEnvironments,
    onEnvironmentSelectionChange,
    onSelectAllEnvironments,
    onSelectNoEnvironments
}) => {
    /**
     * Handle environment option changes with automatic file format adjustment
     */
    const handleEnvironmentOptionChange = (e: RadioChangeEvent) => {
        const newValue = e.target.value;
        onEnvironmentOptionChange(newValue);
        
        // Auto-switch to single file if no environment variables
        if (newValue === 'none' && fileFormat === 'separate') {
            onFileFormatChange('single');
        }
    };

    return (
        <Card 
            size="small" 
            title={
                <Space>
                    <Title level={5} style={{ margin: 0 }}>Environment Variables</Title>
                    {exportPurpose === 'team' && (
                        <SafetyOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                    )}
                </Space>
            }
        >
            {/* Environment variable export options */}
            <Radio.Group
                value={environmentOption}
                onChange={handleEnvironmentOptionChange}
                style={{ width: '100%' }}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    {/* Schema only option - safe for team sharing */}
                    <Radio value="schema" style={{ marginBottom: 8 }}>
                        <Space align="start">
                            <div>
                                <Text strong>Variable Schema Only</Text>
                                {exportPurpose === 'team' && (
                                    <Text type="success" style={{ marginLeft: 8, fontSize: '12px' }}>
                                        Recommended for teams
                                    </Text>
                                )}
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Exports variable names and descriptions. Team members add their own values.
                                </Text>
                            </div>
                        </Space>
                    </Radio>
                    
                    {/* Full values option - includes sensitive data */}
                    <Radio value="full" style={{ marginBottom: 8 }}>
                        <Space align="start">
                            <div>
                                <Space>
                                    <Text strong>Include Values</Text>
                                    <WarningOutlined style={{ color: '#faad14' }} />
                                </Space>
                                <br />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Includes actual values (API keys, passwords, etc). Use only for personal backups.
                                </Text>
                            </div>
                        </Space>
                    </Radio>

                    {/* No environment variables option */}
                    <Radio value="none">
                        <Text>Don't include environment variables</Text>
                    </Radio>
                </Space>
            </Radio.Group>

            {/* Environment Selection for Schema or Full Export */}
            {(environmentOption === 'schema' || environmentOption === 'full') && (
                <>
                    <Divider style={{ margin: '16px 0' }} />
                    <div>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                            <DatabaseOutlined /> Select Environments to Export
                        </Text>
                        {!environmentsReady ? (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <Spin size="small" />
                                <Text type="secondary" style={{ marginLeft: 8 }}>Loading environments...</Text>
                            </div>
                        ) : environments && Object.keys(environments).length > 0 ? (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {Object.keys(environments).map(envName => (
                                    <Checkbox
                                        key={envName}
                                        checked={selectedEnvironments[envName] || false}
                                        onChange={(e) => onEnvironmentSelectionChange(envName, e.target.checked)}
                                    >
                                        <Space>
                                            <Text>{envName}</Text>
                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                ({Object.keys(environments[envName] || {}).length} variables)
                                            </Text>
                                        </Space>
                                    </Checkbox>
                                ))}
                                <div style={{ marginTop: 8 }}>
                                    <Space>
                                        <Text 
                                            type={"link" as any} 
                                            style={{ fontSize: '12px', cursor: 'pointer' }}
                                            onClick={onSelectAllEnvironments}
                                        >
                                            Select All
                                        </Text>
                                        <Text type="secondary">|</Text>
                                        <Text 
                                            type={"link" as any} 
                                            style={{ fontSize: '12px', cursor: 'pointer' }}
                                            onClick={onSelectNoEnvironments}
                                        >
                                            Select None
                                        </Text>
                                    </Space>
                                </div>
                            </Space>
                        ) : (
                            <Empty 
                                description="No environments found" 
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                style={{ padding: '20px 0' }}
                            />
                        )}
                    </div>
                </>
            )}
        </Card>
    );
};

export default EnvironmentVariablesCard;