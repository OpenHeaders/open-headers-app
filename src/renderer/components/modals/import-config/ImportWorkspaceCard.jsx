import React from 'react';
import { Card, Checkbox, Space, Typography, Alert, Tooltip } from 'antd';
import { GitlabOutlined, QuestionCircleOutlined, KeyOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * ImportWorkspaceCard component for workspace configuration import
 * Handles Git workspace configuration import with credentials and conflict detection
 */
const ImportWorkspaceCard = ({ 
    workspaceInfo, 
    importWorkspace, 
    onImportWorkspaceChange,
    workspaces
}) => {
    // Don't render if no workspace info
    if (!workspaceInfo) {
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
                <Checkbox
                    checked={importWorkspace}
                    onChange={(e) => onImportWorkspaceChange(e.target.checked)}
                >
                    <Space>
                        <Text>Import Git workspace configuration</Text>
                        <Tooltip title="This will create a new Git workspace that syncs with the same repository">
                            <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                        </Tooltip>
                    </Space>
                </Checkbox>
                
                {importWorkspace && (
                    <div style={{ marginLeft: 24 }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Text type="secondary">Repository Details:</Text>
                            <div style={{ paddingLeft: 16 }}>
                                <Text style={{ display: 'block' }}>
                                    <strong>Name:</strong> {workspaceInfo.name}
                                </Text>
                                <Text style={{ display: 'block' }}>
                                    <strong>Repository:</strong> {workspaceInfo.gitUrl}
                                </Text>
                                <Text style={{ display: 'block' }}>
                                    <strong>Branch:</strong> {workspaceInfo.gitBranch || 'main'}
                                </Text>
                                <Text style={{ display: 'block' }}>
                                    <strong>Config Path:</strong> {workspaceInfo.gitPath || 'config/open-headers.json'}
                                </Text>
                                <Text style={{ display: 'block' }}>
                                    <strong>Auth Type:</strong> {workspaceInfo.authType || 'none'}
                                </Text>
                                {workspaceInfo.authData && (
                                    <Alert
                                        message={
                                            <Space>
                                                <KeyOutlined />
                                                <Text>Contains authentication credentials</Text>
                                            </Space>
                                        }
                                        description="The file includes authentication credentials that will be imported with the workspace."
                                        type="warning"
                                        showIcon={false}
                                        style={{ marginTop: 8 }}
                                    />
                                )}
                            </div>
                            
                            {/* Check for existing workspace with same name */}
                            {workspaces && workspaces.some(w => w.name === workspaceInfo.name) && (
                                <Alert
                                    message="Workspace Name Conflict"
                                    description={`A workspace named "${workspaceInfo.name}" already exists. It will be renamed to "${workspaceInfo.name} (Imported)" to avoid conflicts.`}
                                    type="info"
                                    showIcon
                                    style={{ marginTop: 8 }}
                                />
                            )}
                        </Space>
                    </div>
                )}
            </Space>
        </Card>
    );
};

export default ImportWorkspaceCard;