import React from 'react';
import { Layout, Space, Tag, Typography } from 'antd';
import WorkspaceStatus from '../status/WorkspaceStatus';
import EnvironmentStatus from '../status/EnvironmentStatus';
import BrowserConnectionStatus from '../status/BrowserConnectionStatus';

const { Footer } = Layout;
const { Text } = Typography;

export function AppFooter({ appVersion, theme, debugComponents }) {
  return (
    <Footer className="app-footer" style={{
      padding: '8px 24px',
      height: 'auto'
    }}>
      <div className="footer-content">
        <div className="footer-left">
          <Space size="small">
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Open Headers
            </Text>
            {appVersion && (
              <Tag color="default" size="small" style={{ fontSize: '11px', lineHeight: '18px' }}>
                v{appVersion}
              </Tag>
            )}
          </Space>
        </div>
        
        <div className="footer-center">
          <Space size="small">
            {debugComponents}
          </Space>
        </div>
        
        <div className="footer-right">
          <Space size="small">
            <WorkspaceStatus />
            <EnvironmentStatus />
            <BrowserConnectionStatus />
          </Space>
        </div>
      </div>
    </Footer>
  );
}