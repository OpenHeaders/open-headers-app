import { LoadingOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Modal, Space, Spin, Tag, Typography, theme } from 'antd';
import React from 'react';

const { Text } = Typography;
const { useToken } = theme;

/**
 * WorkspaceSwitchOverlay - Simple overlay during workspace transitions
 *
 * Shows a clean loading state with:
 * - Blurred backdrop for context preservation
 * - Simple spinner and message
 * - 1 second display duration
 * - Dark mode support via antd theme tokens
 */
interface WorkspaceSwitchOverlayProps {
  visible: boolean;
  targetWorkspace: { name?: string; type?: string } | null;
}
const WorkspaceSwitchOverlay = ({ visible, targetWorkspace }: WorkspaceSwitchOverlayProps) => {
  const { token } = useToken();

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
          backgroundColor: token.colorBgMask,
        },
        body: { padding: 20 },
      }}
    >
      <Space size="small" style={{ display: 'flex', alignItems: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 14, color: token.colorPrimary }} />} />
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
