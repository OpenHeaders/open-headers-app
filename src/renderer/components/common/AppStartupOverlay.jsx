import React from 'react';
import { Typography, Space, Modal, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * AppStartupOverlay - Loading overlay during app initialization
 * 
 * Shows a clean loading state with:
 * - Blurred backdrop for smooth startup transition
 * - Simple spinner and message
 * - App icon and branding
 */
const AppStartupOverlay = ({ 
    visible
}) => {
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
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    transition: 'all 0.3s ease'
                },
                body: { 
                    padding: 24,
                    transition: 'all 0.3s ease'
                }
            }}
        >
            <Space size="medium" style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
                <img src="./images/icon128.png" alt="Open Headers Logo" style={{ width: 32, height: 32 }} />
                <Space size="small" style={{ display: 'flex', alignItems: 'center' }}>
                    <Spin 
                        indicator={<LoadingOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
                    />
                    <Text style={{ fontSize: 16 }}>Loading OpenHeaders</Text>
                </Space>
            </Space>
        </Modal>
    );
};

export default AppStartupOverlay;