import React from 'react';
import { Card, Checkbox, Space, Typography, Divider, Alert } from 'antd';
import { GitlabOutlined, WarningOutlined, InfoCircleOutlined, KeyOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * WorkspaceConfigCard component for workspace configuration options
 * Handles Git workspace configuration and credentials inclusion with security warnings
 * 
 * @param {boolean} isGitWorkspace - Whether current workspace is a Git workspace
 * @param {boolean} includeWorkspace - Whether to include workspace configuration
 * @param {boolean} includeCredentials - Whether to include authentication credentials
 * @param {function} onIncludeWorkspaceChange - Handler for workspace inclusion changes
 * @param {function} onIncludeCredentialsChange - Handler for credentials inclusion changes
 */
const WorkspaceConfigCard = ({ 
    isGitWorkspace,
    includeWorkspace,
    includeCredentials,
    onIncludeWorkspaceChange,
    onIncludeCredentialsChange
}) => {
    // Don't render if not a Git workspace
    if (!isGitWorkspace) {
        return null;
    }

    return (
        <Card 
            size="small" 
            title={
                <Space>
                    <Title level={5} style={{ margin: 0 }}>Workspace Configuration</Title>
                    <GitlabOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                </Space>
            }
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* Main workspace configuration checkbox */}
                <Checkbox
                    checked={includeWorkspace}
                    onChange={(e) => {
                        onIncludeWorkspaceChange(e.target.checked);
                        // Auto-disable credentials when workspace is disabled
                        if (!e.target.checked) {
                            onIncludeCredentialsChange(false);
                        }
                    }}
                >
                    <Space>
                        <Text>Include Git workspace configuration</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            (Repository URL, branch, config path)
                        </Text>
                    </Space>
                </Checkbox>
                
                {/* Credentials section - only shown when workspace is included */}
                {includeWorkspace && (
                    <div style={{ marginLeft: 24 }}>
                        <Checkbox
                            checked={includeCredentials}
                            onChange={(e) => onIncludeCredentialsChange(e.target.checked)}
                        >
                            <Space>
                                <Text>Include authentication credentials</Text>
                                <WarningOutlined style={{ color: '#faad14' }} />
                            </Space>
                        </Checkbox>
                        
                        {/* Security warning for credentials */}
                        {includeCredentials && (
                            <Alert
                                message="Security Warning"
                                description={
                                    <div>
                                        <Text>Including credentials will export sensitive authentication data such as:</Text>
                                        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                            <li>Personal access tokens</li>
                                            <li>SSH private keys and passphrases</li>
                                            <li>Usernames and passwords</li>
                                        </ul>
                                        <Text strong>Only share this file with trusted team members through secure channels.</Text>
                                    </div>
                                }
                                type="warning"
                                showIcon
                                icon={<KeyOutlined />}
                                style={{ marginTop: 8 }}
                            />
                        )}
                    </div>
                )}
                
                <Divider style={{ margin: '12px 0' }} />
                
                {/* Informational note about workspace benefits */}
                <Text type="secondary" style={{ fontSize: '12px' }}>
                    <InfoCircleOutlined /> When workspace configuration is included, team members can import 
                    the file and immediately start syncing from the same Git repository without manual setup.
                </Text>
            </Space>
        </Card>
    );
};

export default WorkspaceConfigCard;