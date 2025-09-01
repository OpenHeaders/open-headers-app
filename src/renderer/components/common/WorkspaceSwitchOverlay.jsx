import React from 'react';
import { Typography, Space, Modal, Spin, Tag } from 'antd';
import { LoadingOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * WorkspaceSwitchOverlay - Simple overlay during workspace transitions
 * 
 * Shows a clean loading state with:
 * - Blurred backdrop for context preservation
 * - Simple spinner and message
 * - 1 second display duration
 */
const WorkspaceSwitchOverlay = ({ 
    visible, 
    targetWorkspace
}) => {
    if (!visible) return null;

    return (
        <Modal
            open={visible}
            centered
            closable={false}
            footer={null}
            width="auto"
            zIndex={2500}
            styles={{ 
                mask: { 
                    backdropFilter: 'blur(8px)',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)'
                },
                body: { padding: 20 }
            }}
        >
            <Space size="small" style={{ display: 'flex', alignItems: 'center' }}>
                <Spin 
                    indicator={<LoadingOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
                />
                <Text>Switching to</Text>
                <Tag 
                    icon={targetWorkspace?.type === 'git' ? <TeamOutlined /> : <UserOutlined />}
                    color={targetWorkspace?.type === 'git' ? 'blue' : 'default'}
                    style={{ margin: 0 }}
                >
                    {targetWorkspace?.name}
                </Tag>
            </Space>
        </Modal>
    );
};

export default WorkspaceSwitchOverlay;