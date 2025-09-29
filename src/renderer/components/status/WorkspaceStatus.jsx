import { useWorkspaces } from '../../contexts';
import React, { useState } from 'react';
import { Space, Tag, Dropdown, Button, Tooltip } from 'antd';
import { 
    TeamOutlined, 
    UserOutlined, 
    SyncOutlined, 
    CheckOutlined,
    ExclamationCircleOutlined,
    DownOutlined,
    UserAddOutlined
} from '@ant-design/icons';
import TeamWorkspaceShareInviteModal from '../modals/TeamWorkspaceShareInviteModal';

const WorkspaceStatus = () => {
    const { workspaces, activeWorkspaceId, syncStatus, switchWorkspace } = useWorkspaces();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [shareModalVisible, setShareModalVisible] = useState(false);
    
    // Find the active workspace
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    
    if (!activeWorkspace) {
        return null;
    }
    
    const isGitWorkspace = activeWorkspace.type === 'git';
    const icon = isGitWorkspace ? <TeamOutlined /> : <UserOutlined />;
    const color = isGitWorkspace ? 'blue' : 'default';
    const syncInfo = syncStatus[activeWorkspaceId];
    const isSyncing = syncInfo?.syncing;
    
    // Build menu items for workspace dropdown
    const menuItems = workspaces.map(workspace => {
        const isActive = workspace.id === activeWorkspaceId;
        const wsIcon = workspace.type === 'git' ? <TeamOutlined /> : <UserOutlined />;
        const wsSyncInfo = syncStatus[workspace.id];
        const hasError = wsSyncInfo?.error;
        
        return {
            key: workspace.id,
            label: (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                        {wsIcon}
                        <span>{workspace.name}</span>
                        {workspace.type === 'git' && wsSyncInfo?.syncing && (
                            <SyncOutlined spin style={{ fontSize: 12 }} />
                        )}
                        {hasError && (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                        )}
                    </Space>
                    {isActive && <CheckOutlined style={{ color: '#1890ff' }} />}
                </Space>
            ),
            onClick: () => {
                if (!isActive) {
                    switchWorkspace(workspace.id);
                }
                setDropdownOpen(false);
            }
        };
    });
    
    // Group workspaces by type
    const personalWorkspaces = menuItems.filter(item => {
        const workspace = workspaces.find(w => w.id === item.key);
        return workspace?.type === 'personal';
    });
    
    const teamWorkspaces = menuItems.filter(item => {
        const workspace = workspaces.find(w => w.id === item.key);
        return workspace?.type === 'git';
    });
    
    // Build final menu with groups
    const finalMenuItems = [];
    
    if (personalWorkspaces.length > 0) {
        finalMenuItems.push(
            { key: 'personal-header', type: 'group', label: 'Personal Workspaces' },
            ...personalWorkspaces
        );
    }
    
    if (teamWorkspaces.length > 0) {
        if (personalWorkspaces.length > 0) {
            finalMenuItems.push({ key: 'divider', type: 'divider' });
        }
        finalMenuItems.push(
            { key: 'team-header', type: 'group', label: 'Team Workspaces' },
            ...teamWorkspaces
        );
    }
    
    const menu = { items: finalMenuItems };
    
    const handleShareWorkspace = () => {
        setShareModalVisible(true);
    };
    
    return (
        <Space size={4}>
            {isGitWorkspace && (
                <Tooltip title="Invite another user to the current team workspace">
                    <Button
                        type="text"
                        icon={<UserAddOutlined />}
                        size="small"
                        onClick={handleShareWorkspace}
                        style={{ height: 22, padding: '0 6px' }}
                    />
                </Tooltip>
            )}
            <Dropdown 
                menu={menu} 
                trigger={['click']}
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
                placement="bottomRight"
            >
                <Tag 
                    icon={icon} 
                    color={color} 
                    style={{ 
                        margin: 0, 
                        cursor: 'pointer',
                        paddingRight: 4
                    }}
                >
                    <Space size={4}>
                        <span>{activeWorkspace.name}</span>
                        {isSyncing && <SyncOutlined spin style={{ fontSize: 12 }} />}
                        <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
                    </Space>
                </Tag>
            </Dropdown>
            
            <TeamWorkspaceShareInviteModal
                visible={shareModalVisible}
                workspace={activeWorkspace}
                onClose={() => setShareModalVisible(false)}
            />
        </Space>
    );
};

export default WorkspaceStatus;