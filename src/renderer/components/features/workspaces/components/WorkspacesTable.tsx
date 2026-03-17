import React, { useState, useEffect } from 'react';
import { Table, Space, Typography, Tag, Button, Tooltip, Switch, App } from 'antd';
import {
    TeamOutlined,
    UserOutlined,
    SyncOutlined,
    ExclamationCircleOutlined,
    CheckCircleOutlined,
    DisconnectOutlined,
    EditOutlined,
    DeleteOutlined,
    CopyOutlined,
    UserAddOutlined,
    GithubOutlined,
    GitlabOutlined,
    GlobalOutlined,
    KeyOutlined,
    LockOutlined
} from '@ant-design/icons';
import { getTimeAgo, extractRepoName, getProviderIcon } from '../utils';
import { AUTH_TYPES, WORKSPACE_TYPES } from '../constants';
import TeamWorkspaceShareInviteModal from '../../../modals/TeamWorkspaceShareInviteModal';

const { Text } = Typography;

/**
 * Table component for displaying workspaces
 * @param {Object} props - Component props
 * @param {Array} props.workspaces - Array of workspace objects
 * @param {string} props.activeWorkspaceId - ID of the currently active workspace
 * @param {Object} props.syncStatus - Sync status for each workspace
 * @param {Function} props.onSyncWorkspace - Handler for workspace sync
 * @param {Function} props.onEditWorkspace - Handler for workspace editing
 * @param {Function} props.onDeleteWorkspace - Handler for workspace deletion
 * @param {Function} props.onCloneToPersonal - Handler for cloning to personal workspace
 * @param {Function} props.onSwitchWorkspace - Handler for switching workspace
 * @param {Function} props.onUpdateWorkspace - Handler for updating workspace settings
 * @returns {JSX.Element} WorkspacesTable component
 */
const WorkspacesTable = ({
    workspaces,
    activeWorkspaceId,
    syncStatus,
    onSyncWorkspace,
    onEditWorkspace,
    onDeleteWorkspace,
    onCloneToPersonal,
    onSwitchWorkspace,
    onUpdateWorkspace
}) => {
    const { message } = App.useApp();
    const [shareModalVisible, setShareModalVisible] = useState(false);
    const [selectedWorkspace, setSelectedWorkspace] = useState(null);
    const [, forceUpdate] = useState({});
    
    // Update relative time display with dynamic intervals
    useEffect(() => {
        let interval;
        
        const startInterval = () => {
            if (document.visibilityState === 'visible') {
                const gitWorkspacesWithSyncTimes = workspaces.filter(
                    w => w.type === WORKSPACE_TYPES.GIT && syncStatus[w.id]?.lastSync
                );
                
                if (gitWorkspacesWithSyncTimes.length > 0) {
                    const now = new Date();
                    let updateInterval = 24 * 60 * 60 * 1000; // Default: 24 hours
                    
                    // Choose the fastest update interval needed
                    gitWorkspacesWithSyncTimes.forEach(w => {
                        const lastSync = new Date(syncStatus[w.id].lastSync);
                        const timeDiff = (now - lastSync) / 1000;
                        
                        if (timeDiff < 60 && updateInterval > 1000) {
                            updateInterval = 1000; // Update every second
                        } else if (timeDiff < 3600 && updateInterval > 60000) {
                            updateInterval = 60000; // Update every minute
                        } else if (timeDiff < 86400 && updateInterval > 3600000) {
                            updateInterval = 3600000; // Update every hour
                        }
                    });
                    
                    interval = setInterval(() => {
                        forceUpdate({});
                    }, updateInterval);
                }
            }
        };
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && interval) {
                clearInterval(interval);
                interval = null;
            } else if (document.visibilityState === 'visible') {
                if (interval) clearInterval(interval);
                startInterval();
            }
        };
        
        const restartInterval = () => {
            if (interval) clearInterval(interval);
            startInterval();
        };
        
        // Calculate when to switch update frequencies
        const getRestartCheckInterval = () => {
            const now = new Date();
            const gitWorkspacesWithSyncTimes = workspaces.filter(
                w => w.type === WORKSPACE_TYPES.GIT && syncStatus[w.id]?.lastSync
            );
            
            if (gitWorkspacesWithSyncTimes.length === 0) return 60000;
            
            let minTimeToNextThreshold = Infinity;
            
            gitWorkspacesWithSyncTimes.forEach(w => {
                const lastSync = new Date(syncStatus[w.id].lastSync);
                const timeDiff = (now - lastSync) / 1000;
                
                if (timeDiff < 60) {
                    minTimeToNextThreshold = Math.min(minTimeToNextThreshold, (60 - timeDiff) * 1000 + 100);
                } else if (timeDiff < 3600) {
                    minTimeToNextThreshold = Math.min(minTimeToNextThreshold, (3600 - timeDiff) * 1000 + 100);
                } else if (timeDiff < 86400) {
                    minTimeToNextThreshold = Math.min(minTimeToNextThreshold, (86400 - timeDiff) * 1000 + 100);
                }
            });
            
            return Math.max(1000, Math.min(60000, minTimeToNextThreshold));
        };
        
        startInterval();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Schedule dynamic restart checks
        let restartTimer;
        const scheduleRestartCheck = () => {
            const checkInterval = getRestartCheckInterval();
            restartTimer = setTimeout(() => {
                restartInterval();
                scheduleRestartCheck();
            }, checkInterval);
        };
        scheduleRestartCheck();
        
        return () => {
            if (interval) clearInterval(interval);
            if (restartTimer) clearTimeout(restartTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [workspaces, syncStatus]);
    
    const handleShareWorkspace = (workspace) => {
        setSelectedWorkspace(workspace);
        setShareModalVisible(true);
    };
    
    /**
     * Renders the workspace name with appropriate icon and status
     * @param {string} name - Workspace name
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered name cell
     */
    const renderNameCell = (name, record) => (
        <Space>
            {record.type === WORKSPACE_TYPES.GIT ? <TeamOutlined /> : <UserOutlined />}
            <Text strong={record.id === activeWorkspaceId}>{name}</Text>
            {record.id === activeWorkspaceId && (
                <Tag color="green">Active</Tag>
            )}
        </Space>
    );

    /**
     * Renders the workspace type with appropriate styling
     * @param {string} type - Workspace type
     * @returns {JSX.Element} Rendered type cell
     */
    const renderTypeCell = (type) => (
        <Tag color={type === WORKSPACE_TYPES.GIT ? 'blue' : 'default'}>
            {type === WORKSPACE_TYPES.GIT ? 'Team' : 'Personal'}
        </Tag>
    );

    /**
     * Renders the sync status with appropriate icon and tooltip
     * @param {any} _ - Unused parameter
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered sync status cell
     */
    const renderSyncStatusCell = (_, record) => {
        if (record.type !== WORKSPACE_TYPES.GIT) {
            return <Text type="default">-</Text>;
        }

        const status = syncStatus[record.id];
        if (!status) {
            return <Tag icon={<DisconnectOutlined />}>Not synced</Tag>;
        }

        if (status.syncing) {
            return <Tag icon={<SyncOutlined spin />} color="processing">Syncing...</Tag>;
        }

        if (status.error) {
            return (
                <Tooltip title={status.error}>
                    <Tag icon={<ExclamationCircleOutlined />} color="error">Error</Tag>
                </Tooltip>
            );
        }

        if (status.lastSync) {
            const lastSyncDate = new Date(status.lastSync);
            const timeAgo = getTimeAgo(lastSyncDate);
            return (
                <Tooltip title={`Last synced: ${lastSyncDate.toLocaleString()}`}>
                    <Tag icon={<CheckCircleOutlined />} color="default">{timeAgo}</Tag>
                </Tooltip>
            );
        }

        return <Tag icon={<DisconnectOutlined />}>Not synced</Tag>;
    };

    /**
     * Renders the repository information with appropriate icon
     * @param {string} url - Repository URL
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered repository cell
     */
    const renderRepositoryCell = (url, record) => {
        if (record.type !== WORKSPACE_TYPES.GIT || !url) {
            return <Text type="secondary">-</Text>;
        }
        
        const repoName = extractRepoName(url);
        const iconType = getProviderIcon(url);
        
        let IconComponent = GlobalOutlined;
        if (iconType === 'GithubOutlined') IconComponent = GithubOutlined;
        else if (iconType === 'GitlabOutlined') IconComponent = GitlabOutlined;
        
        return (
            <Tooltip title={url}>
                <Space>
                    <IconComponent />
                    <Text ellipsis style={{ maxWidth: 200 }}>{repoName}</Text>
                </Space>
            </Tooltip>
        );
    };

    /**
     * Renders the authentication information
     * @param {any} _ - Unused parameter
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered auth cell
     */
    const renderAuthCell = (_, record) => {
        if (record.type !== WORKSPACE_TYPES.GIT) {
            return <Text type="secondary">-</Text>;
        }
        
        const authType = record.authType || AUTH_TYPES.NONE;
        
        let IconComponent = null;
        switch (authType) {
            case AUTH_TYPES.SSH_KEY:
                IconComponent = KeyOutlined;
                break;
            case AUTH_TYPES.TOKEN:
                IconComponent = LockOutlined;
                break;
            case AUTH_TYPES.BASIC:
                IconComponent = UserOutlined;
                break;
            default:
                return <Text type="secondary">Public</Text>;
        }
        
        return (
            <Tooltip title={`Authentication: ${authType}`}>
                <Tag icon={<IconComponent />}>{authType}</Tag>
            </Tooltip>
        );
    };

    /**
     * Renders the auto-sync toggle for team workspaces
     * @param {any} _ - Unused parameter
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered auto-sync cell
     */
    const renderAutoSyncCell = (_, record) => {
        if (record.type !== WORKSPACE_TYPES.GIT) {
            return <Text type="secondary">-</Text>;
        }
        
        const handleToggle = async (checked) => {
            if (onUpdateWorkspace) {
                const result = await onUpdateWorkspace(record.id, { autoSync: checked });
                if (result) {
                    message.success(`Auto-sync ${checked ? 'enabled' : 'disabled'} for "${record.name}"`);
                } else {
                    message.error('Failed to update auto-sync setting');
                }
            }
        };
        
        return (
            <Tooltip title={'Automatically sync remote config every 1 hour. All local changes are overridden except environment values.'}>
                <Switch
                    checked={record.autoSync !== false}
                    onChange={handleToggle}
                    size="small"
                />
            </Tooltip>
        );
    };

    /**
     * Renders the action buttons for each workspace with consistent alignment
     * @param {any} _ - Unused parameter
     * @param {Object} record - Workspace record
     * @returns {JSX.Element} Rendered actions cell
     */
    const renderActionsCell = (_, record) => {
        const isGitWorkspace = record.type === WORKSPACE_TYPES.GIT;
        const isDefaultPersonal = record.id === 'default-personal' || record.isDefault;
        const isActiveWorkspace = record.id === activeWorkspaceId;
        
        return (
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '24px 24px 24px 24px 24px 60px',
                gap: '4px',
                alignItems: 'center',
                width: '100%'
            }}>
                {/* Position 1: Sync button - Active Git workspaces only */}
                {isGitWorkspace ? (
                    <Tooltip title={isActiveWorkspace
                        ? "Sync manually now"
                        : "Switch to this workspace to sync manually"
                    }>
                        <Button
                            type="text"
                            icon={<SyncOutlined />}
                            size="small"
                            onClick={() => onSyncWorkspace(record)}
                            loading={syncStatus[record.id]?.syncing}
                            disabled={!isActiveWorkspace}
                        />
                    </Tooltip>
                ) : (
                    <div />
                )}
                
                {/* Position 2: Share button - Git workspaces only */}
                {isGitWorkspace ? (
                    <Tooltip title="Invite another user to the current team workspace">
                        <Button
                            type="text"
                            icon={<UserAddOutlined />}
                            size="small"
                            onClick={() => handleShareWorkspace(record)}
                        />
                    </Tooltip>
                ) : (
                    <div />
                )}
                
                {/* Position 3: Clone button - Git workspaces only */}
                {isGitWorkspace ? (
                    <Tooltip title="Clone to personal workspace">
                        <Button
                            type="text"
                            icon={<CopyOutlined />}
                            size="small"
                            onClick={() => onCloneToPersonal(record)}
                        />
                    </Tooltip>
                ) : (
                    <div />
                )}
                
                {/* Position 4: Edit button - Non-default workspaces only */}
                {!isDefaultPersonal ? (
                    <Tooltip title="Edit">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => onEditWorkspace(record)}
                        />
                    </Tooltip>
                ) : (
                    <div />
                )}
                
                {/* Position 5: Delete button - Non-default workspaces only */}
                {!isDefaultPersonal ? (
                    <Tooltip title="Delete">
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            onClick={() => onDeleteWorkspace(record)}
                        />
                    </Tooltip>
                ) : (
                    <div />
                )}
                
                {/* Position 6: Switch button - Non-active workspaces only */}
                {!isActiveWorkspace ? (
                    <Button
                        type="primary"
                        size="small"
                        onClick={() => onSwitchWorkspace(record.id)}
                    >
                        Switch
                    </Button>
                ) : (
                    <div />
                )}
            </div>
        );
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: renderNameCell
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            width: 100,
            render: renderTypeCell
        },
        {
            title: 'Sync Status',
            key: 'syncStatus',
            width: 150,
            render: renderSyncStatusCell
        },
        {
            title: 'Repository',
            dataIndex: 'gitUrl',
            key: 'gitUrl',
            render: renderRepositoryCell
        },
        {
            title: 'Auth',
            key: 'auth',
            width: 100,
            render: renderAuthCell
        },
        {
            title: 'Auto-Sync',
            key: 'autoSync',
            width: 100,
            render: renderAutoSyncCell
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 220,
            render: renderActionsCell
        }
    ];

    return (
        <>
            <Table
                dataSource={workspaces}
                columns={columns}
                rowKey="id"
                pagination={false}
            />
            
            <TeamWorkspaceShareInviteModal
                visible={shareModalVisible}
                workspace={selectedWorkspace}
                onClose={() => {
                    setShareModalVisible(false);
                    setSelectedWorkspace(null);
                }}
            />
        </>
    );
};

export default WorkspacesTable;
