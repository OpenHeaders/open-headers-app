import { Layout, Space, Tag, Typography } from 'antd';
import type React from 'react';
import BrowserConnectionStatus from '@/renderer/components/status/BrowserConnectionStatus';
import EnvironmentStatus from '@/renderer/components/status/EnvironmentStatus';
import WorkspaceStatus from '@/renderer/components/status/WorkspaceStatus';

const { Footer } = Layout;
const { Text } = Typography;

interface AppFooterProps {
  appVersion: string;
  debugComponents: React.ReactNode;
}
export function AppFooter({ appVersion: appVersionProp, debugComponents }: AppFooterProps) {
  // Use startupData for instant version on first render, then prop once loaded via IPC
  const appVersion = appVersionProp || window.startupData?.version || '';
  return (
    <Footer
      className="app-footer"
      style={{
        padding: '8px 24px',
        height: 'auto',
      }}
    >
      <div className="footer-content">
        <div className="footer-left">
          <Space size="small">
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Open Headers
            </Text>
            {appVersion && (
              <Tag color="default" style={{ fontSize: '11px', lineHeight: '18px' }}>
                v{appVersion}
              </Tag>
            )}
          </Space>
        </div>

        <div className="footer-center">
          <Space size="small">{debugComponents}</Space>
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
