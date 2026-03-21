import React from 'react';
import { Typography, Space, Modal, Spin, theme } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { useToken } = theme;

/**
 * AppStartupOverlay - Loading overlay during app initialization
 *
 * Shows a clean loading state with:
 * - Blurred backdrop for smooth startup transition
 * - Simple spinner and message
 * - App icon and branding
 * - Dark mode support via antd theme tokens
 */
interface AppStartupOverlayProps { visible: boolean; }
const AppStartupOverlay = ({
    visible
}: AppStartupOverlayProps) => {
    const { token } = useToken();

    if (!visible) return null;

    return (
        <Modal
            open={visible}
            centered
            closable={false}
            footer={null}
            width="auto"
            styles={{
                mask: {
                    backdropFilter: 'blur(8px)',
                    backgroundColor: token.colorBgMask,
                    transition: 'all 0.3s ease'
                },
                body: {
                    padding: 24,
                    transition: 'all 0.3s ease'
                }
            }}
        >
            <Space size={"middle" as never} style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
                <img src="./images/icon128.png" alt="Open Headers Logo" style={{ width: 32, height: 32 }} />
                <Space size="small" style={{ display: 'flex', alignItems: 'center' }}>
                    <Spin
                        indicator={<LoadingOutlined style={{ fontSize: 14, color: token.colorPrimary }} />}
                    />
                    <Text style={{ fontSize: 16 }}>Loading OpenHeaders</Text>
                </Space>
            </Space>
        </Modal>
    );
};

export default AppStartupOverlay;
