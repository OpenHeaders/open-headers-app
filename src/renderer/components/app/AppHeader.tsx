import React from 'react';
import { Layout, Typography, Button, Space, Dropdown, Tag } from 'antd';
import {
    SettingOutlined,
    ExportOutlined,
    ImportOutlined,
    DownOutlined,
    MenuOutlined,
    QuestionCircleOutlined,
    DownloadOutlined,
    MinusOutlined,
    BorderOutlined,
    CloseOutlined
} from '@ant-design/icons';

const { Header } = Layout;
const { Title } = Typography;

export function AppHeader({
  onExport,
  onImport,
  onCheckForUpdates,
  onOpenSettings,
  onOpenAbout,
  theme
}) {
  const actionsMenuItems = [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: 'Export',
      onClick: onExport
    },
    {
      key: 'import',
      icon: <ImportOutlined />,
      label: 'Import',
      onClick: onImport
    },
    {
      type: 'divider'
    },
    {
      key: 'check-updates',
      icon: <DownloadOutlined />,
      label: 'Check for Updates',
      onClick: onCheckForUpdates
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: onOpenSettings
    },
    {
      key: 'about',
      icon: <QuestionCircleOutlined />,
      label: 'About',
      onClick: onOpenAbout
    }
  ];

  return (
    <Header className="app-header">
      <div className={`logo-title ${window.electronAPI?.platform ? `platform-${window.electronAPI.platform}` : ''}`}>
        <img src="./images/icon128.png" alt="Open Headers Logo" className="app-logo" />
        <div className="title-version">
          <Title level={3}>Open Headers</Title>
        </div>
      </div>

      <Space>
        <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
          <Button icon={<MenuOutlined />}>
            Menu <DownOutlined />
          </Button>
        </Dropdown>
        
        {/* Window controls only for Windows/Linux (not macOS) */}
        {window.electronAPI?.platform !== 'darwin' && (
          <div className="window-controls">
            <Button 
              type="text" 
              size="small" 
              icon={<MinusOutlined />}
              onClick={() => window.electronAPI?.minimizeWindow?.()}
              className="window-control-btn"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<BorderOutlined />}
              onClick={() => window.electronAPI?.maximizeWindow?.()}
              className="window-control-btn"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<CloseOutlined />}
              onClick={() => window.electronAPI?.closeWindow?.()}
              className="window-control-btn window-close-btn"
            />
          </div>
        )}
      </Space>
    </Header>
  );
}