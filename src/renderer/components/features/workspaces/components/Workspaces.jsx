import React, { useState, useCallback } from 'react';
import { Card, Button, Space, Typography, Alert, Divider, Modal, Input, App, Checkbox, Segmented, Tooltip } from 'antd';
import { PlusOutlined, UserAddOutlined, CopyOutlined, TeamOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useWorkspaces, useSettings } from '../../../../contexts';
import { useWorkspaceActions } from '../hooks';
import WorkspacesTable from './WorkspacesTable';
import WorkspaceModal from './WorkspaceModal';
import WorkspaceEditModal from './WorkspaceEditModal';

const { Title, Text } = Typography;

// Constants
const COMPONENT_PADDING = '24px';
const TITLE_MARGIN = 0;
const TUTORIAL_MARGIN = '8px 0';
const TUTORIAL_PADDING = '20px';
const DIVIDER_MARGIN = '12px 0';



// Styles object for better maintainability
const styles = {
    container: { padding: COMPONENT_PADDING },
    headerContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    title: { margin: TITLE_MARGIN },
    tutorialList: { margin: TUTORIAL_MARGIN, paddingLeft: TUTORIAL_PADDING },
    tutorialDivider: { margin: DIVIDER_MARGIN },
    spaceVertical: { width: '100%' }
};

/**
 * Main Workspaces component for managing personal and team workspaces
 * 
 * This component serves as the main orchestrator for workspace management,
 * handling the display of workspaces in a table format and providing
 * functionality for creating, editing, and managing both personal and
 * team workspaces with Git synchronization capabilities.
 * 
 * Features:
 * - Display workspaces in a comprehensive table
 * - Create new personal or team workspaces
 * - Edit existing workspace configurations
 * - Git repository integration with authentication
 * - Real-time sync status monitoring
 * - Workspace cloning and deletion
 * - Connection testing for Git repositories
 * 
 * @returns {JSX.Element} The main Workspaces component
 */
const Workspaces = () => {
    const { message, modal } = App.useApp();
    const workspaceContext = useWorkspaces();
    const { settings } = useSettings();
    const {
        workspaces,
        activeWorkspaceId,
        switchWorkspace,
        syncStatus,
        updateWorkspace
    } = workspaceContext;
    
    // Component state
    const [modalVisible, setModalVisible] = useState(false);
    const [editingWorkspace, setEditingWorkspace] = useState(null);
    
    // Workspace actions hook
    const {
        handleDeleteWorkspace,
        handleCloneToPersonal,
        handleSyncWorkspace
    } = useWorkspaceActions(workspaceContext);
    
    
    /**
     * Handles adding a new workspace
     */
    const handleAddWorkspace = useCallback(() => {
        setEditingWorkspace(null);
        setModalVisible(true);
    }, []);
    
    /**
     * Handles editing an existing workspace
     * @param {Object} workspace - Workspace object to edit
     */
    const handleEditWorkspace = (workspace) => {
        setEditingWorkspace(workspace);
        setModalVisible(true);
    };
    
    /**
     * Handles modal close/cancel
     */
    const handleModalClose = useCallback(() => {
        setModalVisible(false);
        setEditingWorkspace(null);
    }, []);
    
    /**
     * Handles successful workspace creation
     * @param {string} workspaceId - ID of the created workspace
     */
    const handleWorkspaceSuccess = (workspaceId) => {
        console.log('Workspace created successfully:', workspaceId);
        setModalVisible(false);
        setEditingWorkspace(null);
    };

    /**
     * Handles sharing a workspace by generating and displaying invite links
     * @param {Object} workspace - Workspace object to share
     */
    const handleShareWorkspace = async (workspace) => {
        try {
            // Generate initial invite without auth data
            const result = await window.electronAPI.generateTeamWorkspaceInvite({
                ...workspace,
                includeAuthData: false
            });
            
            if (result.success) {
                let currentAppLink = result.links.appLink;
                
                modal.info({
                    title: (
                        <Space>
                            Share access to Team Workspace <TeamOutlined /> {workspace.name}
                        </Space>
                    ),
                    content: (
                        <div>
                            {React.createElement(() => {
                                const [linkType, setLinkType] = useState('web');
                                const [includeAuth, setIncludeAuth] = useState(false);
                                const [appLink, setAppLink] = useState(currentAppLink);
                                
                                const handleChange = async (type, auth) => {
                                    if (type === 'web' && auth) {
                                        // Web links cannot include auth
                                        auth = false;
                                        setIncludeAuth(false);
                                    }
                                    
                                    setLinkType(type);
                                    
                                    if (type === 'app') {
                                        const newResult = await window.electronAPI.generateTeamWorkspaceInvite({
                                            ...workspace,
                                            includeAuthData: auth
                                        });
                                        
                                        if (newResult.success) {
                                            setAppLink(newResult.links.appLink);
                                        }
                                    }
                                };
                                
                                const getLinkValue = () => {
                                    if (linkType === 'web') {
                                        return result.links.webLink;
                                    }
                                    return appLink;
                                };
                                
                                return (
                                    <Space direction="vertical" style={{ width: '100%' }} size={20}>
                                        <div style={{ marginTop: 8 }}>
                                            <Segmented
                                            value={linkType}
                                            onChange={(value) => handleChange(value, includeAuth)}
                                            options={[
                                                { 
                                                    label: (
                                                        <div style={{ padding: '4px 0' }}>
                                                            <div>First-time users</div>
                                                            <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 'normal' }}>
                                                                No app installed yet
                                                            </div>
                                                        </div>
                                                    ),
                                                    value: 'web'
                                                },
                                                { 
                                                    label: (
                                                        <div style={{ padding: '4px 0' }}>
                                                            <div>Existing users</div>
                                                            <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 'normal' }}>
                                                                Have app installed
                                                            </div>
                                                        </div>
                                                    ),
                                                    value: 'app'
                                                }
                                            ]}
                                            block
                                            size="large"
                                        />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 32, alignItems: 'center' }}>
                                            {linkType === 'app' && (
                                                <Checkbox
                                                    checked={includeAuth}
                                                    onChange={async (e) => {
                                                        const checked = e.target.checked;
                                                        setIncludeAuth(checked);
                                                        await handleChange('app', checked);
                                                    }}
                                                    style={{ display: 'flex', alignItems: 'center' }}
                                                >
                                                    <span style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        Include Git authentication credentials
                                                        <Tooltip 
                                                            title="Includes personal access tokens, passwords, or SSH keys configured for this workspace"
                                                            placement="top"
                                                        >
                                                            <QuestionCircleOutlined style={{ fontSize: 12, color: '#1890ff', cursor: 'help', verticalAlign: 'middle' }} />
                                                        </Tooltip>
                                                    </span>
                                                </Checkbox>
                                            )}
                                        </div>

                                        <div style={{ 
                                            background: '#f0f9ff', 
                                            border: '1px solid #bae6fd',
                                            borderRadius: 8,
                                            padding: '12px 16px',
                                            marginBottom: 16
                                        }}>
                                            <Typography.Text style={{ fontSize: 13, color: '#0369a1' }}>
                                                <strong>What happens next:</strong>
                                            </Typography.Text>
                                            <ul style={{ 
                                                margin: '8px 0 0 0', 
                                                paddingLeft: 20,
                                                fontSize: 13,
                                                color: '#0369a1'
                                            }}>
                                                <li style={{ marginBottom: 4 }}>
                                                    Recipient opens this link in their browser
                                                </li>
                                                <li>
                                                    {linkType === 'web' 
                                                        ? 'They see workspace details, download & install the app, then click to join'
                                                        : 'Browser automatically opens OpenHeaders app to join workspace'}
                                                </li>
                                            </ul>
                                        </div>

                                        <div style={{ 
                                            background: '#fafafa', 
                                            border: '1px solid #e8e8e8',
                                            borderRadius: 8,
                                            padding: 16
                                        }}>
                                            <Input.TextArea
                                                value={getLinkValue()}
                                                readOnly
                                                autoSize={{ minRows: 2, maxRows: 3 }}
                                                style={{ 
                                                    border: 'none',
                                                    background: 'transparent',
                                                    padding: 0,
                                                    resize: 'none',
                                                    fontFamily: 'monospace',
                                                    fontSize: 13,
                                                    color: '#262626'
                                                }}
                                            />
                                        </div>

                                        <Button
                                            icon={<CopyOutlined />}
                                            onClick={() => {
                                                navigator.clipboard.writeText(getLinkValue());
                                                message.success('Link copied to clipboard');
                                            }}
                                            type="primary"
                                            size="large"
                                            block
                                        >
                                            Copy Invite Link
                                        </Button>

                                        {includeAuth && (
                                            <Alert
                                                message="This link contains sensitive authentication data"
                                                type="warning"
                                                showIcon
                                                banner
                                            />
                                        )}
                                    </Space>
                                );
                            })}
                        </div>
                    ),
                    width: 800,
                    centered: true,
                    okText: 'Close'
                });
            } else {
                message.error(`Failed to generate invite: ${result.error}`);
            }
        } catch (error) {
            console.error('Error sharing workspace:', error);
            message.error('Failed to generate workspace invite');
        }
    };
    
    /**
     * Renders the tutorial alert for new users
     * 
     * Displays an informational alert explaining workspaces, their types,
     * and privacy information. Only shown if tutorial mode is enabled
     * in user settings.
     * 
     * @returns {JSX.Element|null} Tutorial alert component or null if disabled
     */
    const renderTutorialAlert = () => {
        if (settings?.tutorialMode === false) {
            return null;
        }
        
        return (
            <Alert
                message="About Workspaces"
                description={
                    <Space direction="vertical">
                        <Text>
                            Workspaces allow you to organize and share configurations:
                        </Text>
                        <ul style={styles.tutorialList}>
                            <li><Text><strong>Personal Workspace:</strong> Your local configuration (default)</Text></li>
                            <li><Text><strong>Team Workspaces:</strong> Git-based shared configurations that sync automatically (read-only)</Text></li>
                        </ul>
                        <Text>
                            Team workspaces support various Git sources: remote providers (GitHub, GitLab, Bitbucket), 
                            local repositories, network shares, and self-hosted Git servers.
                        </Text>
                        <Text type="secondary">
                            💡 Tip: Disable auto-sync or Clone a team workspace to a personal workspace to test changes without being overwritten by auto-sync.
                        </Text>
                        <Divider style={styles.tutorialDivider} />
                        <Text type="primary">
                            <strong>🔒 Privacy First:</strong> All workspace data is stored locally on your device. 
                            There is <strong>no</strong> analytics, telemetry, or usage data collection. 
                            Your configurations, API keys, and workspace settings never leave your device.
                        </Text>
                    </Space>
                }
                type="info"
                showIcon
                closable
            />
        );
    };
    
    return (
        <div style={styles.container}>
            <Card>
                <Space direction="vertical" style={styles.spaceVertical} size="large">
                    <div style={styles.headerContainer}>
                        <Space>
                            <Title level={4} style={styles.title}>Workspaces</Title>
                            <Text type="secondary">
                                Manage your personal and team workspaces
                            </Text>
                        </Space>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddWorkspace}
                        >
                            Add Workspace
                        </Button>
                    </div>
                    
                    {renderTutorialAlert()}
                    
                    <WorkspacesTable
                        workspaces={workspaces}
                        activeWorkspaceId={activeWorkspaceId}
                        syncStatus={syncStatus}
                        onSyncWorkspace={handleSyncWorkspace}
                        onEditWorkspace={handleEditWorkspace}
                        onDeleteWorkspace={handleDeleteWorkspace}
                        onCloneToPersonal={handleCloneToPersonal}
                        onSwitchWorkspace={switchWorkspace}
                        onShareWorkspace={handleShareWorkspace}
                        onUpdateWorkspace={updateWorkspace}
                    />
                </Space>
            </Card>
            
            <WorkspaceModal
                visible={modalVisible && !editingWorkspace}
                editingWorkspace={null}
                onCancel={handleModalClose}
                onSuccess={handleWorkspaceSuccess}
            />
            
            <WorkspaceEditModal
                visible={modalVisible && editingWorkspace}
                workspace={editingWorkspace}
                onCancel={handleModalClose}
                onSuccess={handleWorkspaceSuccess}
            />
        </div>
    );
};

export default Workspaces;