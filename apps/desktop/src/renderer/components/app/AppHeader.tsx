import {
  BorderOutlined,
  CloseOutlined,
  DownloadOutlined,
  DownOutlined,
  ExportOutlined,
  ImportOutlined,
  MenuOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Button, Dropdown, Layout, Space, Typography } from 'antd';
import type { GlobalToken } from 'antd/es/theme/interface';

const { Header } = Layout;
const { Title } = Typography;

interface AppHeaderProps {
  onExport: () => void;
  onImport: () => void;
  onCheckForUpdates: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  theme: GlobalToken;
}

export function AppHeader({
  onExport,
  onImport,
  onCheckForUpdates,
  onOpenSettings,
  onOpenAbout,
  theme,
}: AppHeaderProps) {
  const actionsMenuItems: NonNullable<MenuProps['items']> = [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: 'Export',
      onClick: onExport,
    },
    {
      key: 'import',
      icon: <ImportOutlined />,
      label: 'Import',
      onClick: onImport,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'check-updates',
      icon: <DownloadOutlined />,
      label: 'Check for Updates',
      onClick: onCheckForUpdates,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: onOpenSettings,
    },
    {
      key: 'about',
      icon: <QuestionCircleOutlined />,
      label: 'About',
      onClick: onOpenAbout,
    },
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
