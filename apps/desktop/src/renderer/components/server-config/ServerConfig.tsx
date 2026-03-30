import { CodeOutlined, DatabaseOutlined, LinkOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { useState } from 'react';
import CliServer from '@/renderer/components/cli/CliServer';
import ConnectionsServer from '@/renderer/components/connections/ConnectionsServer';
import ProxyServer from '@/renderer/components/proxy/ProxyServer';

interface ServerConfigProps {
  activeParentTab: string;
}
const ServerConfig = ({ activeParentTab }: ServerConfigProps) => {
  const [activeTab, setActiveTab] = useState('websocket');

  const items = [
    {
      key: 'websocket',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LinkOutlined />
          WebSocket
        </span>
      ),
      children: <ConnectionsServer active={activeParentTab === 'server-config' && activeTab === 'websocket'} />,
    },
    {
      key: 'proxy',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <DatabaseOutlined />
          Proxy
        </span>
      ),
      children: <ProxyServer />,
    },
    {
      key: 'cli',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CodeOutlined />
          CLI
        </span>
      ),
      children: <CliServer active={activeParentTab === 'server-config' && activeTab === 'cli'} />,
    },
  ];

  return <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} type="card" style={{ height: '100%' }} />;
};

export default ServerConfig;
