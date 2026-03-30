import {
  ApiOutlined,
  CheckCircleOutlined,
  ChromeOutlined,
  CompassOutlined,
  GlobalOutlined,
  IeOutlined,
} from '@ant-design/icons';
import { Space, Tag, Tooltip } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/renderer/contexts';

import './BrowserConnectionStatus.css';

interface ClientInfo {
  id: string;
  browser: string;
  browserVersion: string;
  platform: string;
  connectionType: string;
  connectedAt: number;
  lastActivity: number;
  extensionVersion: string;
}

interface ConnectionStatus {
  totalConnections: number;
  browserCounts: Record<string, number>;
  clients: ClientInfo[];
  wsServerRunning: boolean;
}

type BrowserKey = 'chrome' | 'firefox' | 'edge' | 'safari' | 'unknown';

const BrowserConnectionStatus = () => {
  const { settings } = useSettings();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    totalConnections: 0,
    browserCounts: {},
    clients: [],
    wsServerRunning: false,
  });
  const [proxyStatus, setProxyStatus] = useState({ running: false, port: 59212 });
  const [cliStatus, setCliStatus] = useState({ running: false, port: 59213 });
  const [isLoading, setIsLoading] = useState(true);

  // Browser icon mapping
  const getBrowserIcon = (browser: string) => {
    const icons: Record<BrowserKey, React.ReactElement> = {
      chrome: <ChromeOutlined />,
      firefox: <CompassOutlined />,
      edge: <IeOutlined />,
      safari: <GlobalOutlined />,
      unknown: <ApiOutlined />,
    };
    return icons[browser as BrowserKey] || icons.unknown;
  };

  // Browser display name mapping
  const getBrowserName = (browser: string) => {
    const names: Record<BrowserKey, string> = {
      chrome: 'Chrome',
      firefox: 'Firefox',
      edge: 'Edge',
      safari: 'Safari',
      unknown: 'Unknown',
    };
    return names[browser as BrowserKey] || 'Unknown';
  };

  // Fetch connection status
  const fetchConnectionStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.wsGetConnectionStatus) {
        const status = await window.electronAPI.wsGetConnectionStatus();
        setConnectionStatus(status);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch connection status:', error);
      setIsLoading(false);
    }
  }, []);

  // Fetch proxy status
  const fetchProxyStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.proxyStatus) {
        const status = await window.electronAPI.proxyStatus();
        setProxyStatus(status);
      }
    } catch (error) {
      console.error('Failed to fetch proxy status:', error);
    }
  }, []);

  // Fetch CLI server status
  const fetchCliStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.cliApiStatus) {
        const status = await window.electronAPI.cliApiStatus();
        setCliStatus(status);
      }
    } catch (error) {
      console.error('Failed to fetch CLI status:', error);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchConnectionStatus();
    fetchProxyStatus();
    fetchCliStatus();

    // Set up periodic updates
    const interval = setInterval(() => {
      fetchConnectionStatus();
      fetchProxyStatus();
      fetchCliStatus();
    }, 5000);

    // Listen for connection status updates from main process
    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onWsConnectionStatusChanged) {
      unsubscribe = window.electronAPI.onWsConnectionStatusChanged((data) => {
        setConnectionStatus((prev) => ({ ...prev, ...data }));
        setIsLoading(false);
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [fetchConnectionStatus, fetchProxyStatus, fetchCliStatus]);

  if (isLoading) {
    return null;
  }

  const { totalConnections, browserCounts, clients, wsServerRunning } = connectionStatus;

  // Build tooltip content based on developer mode
  const tooltipContent = settings?.developerMode ? (
    // Developer mode: Show detailed technical information
    <div className="connection-tooltip">
      <div className="server-status">
        <Space direction="vertical" size="small">
          <div>
            <Tag color={wsServerRunning ? 'green' : 'red'}>WS Server: {wsServerRunning ? 'Running' : 'Stopped'}</Tag>
          </div>
          <div>
            <Tag color={proxyStatus.running ? 'green' : 'red'}>
              Proxy Server: {proxyStatus.running ? 'Running' : 'Stopped'}
            </Tag>
          </div>
          <div>
            <Tag color={cliStatus.running ? 'green' : 'red'}>
              CLI Server: {cliStatus.running ? 'Running' : 'Stopped'}
            </Tag>
          </div>
        </Space>
      </div>

      {totalConnections > 0 && (
        <>
          <div className="connection-details">
            <strong>Connected Browsers:</strong>
            {Object.entries(browserCounts).map(([browser, count]) => (
              <div key={browser} className="browser-count">
                <Space>
                  {getBrowserIcon(browser)}
                  <span>
                    {getBrowserName(browser)}: {count}
                  </span>
                </Space>
              </div>
            ))}
          </div>

          {clients.length > 0 && (
            <div className="client-list">
              <strong>Active Connections:</strong>
              {clients.slice(0, 5).map((client) => (
                <div key={client.id} className="client-info">
                  <Space size="small">
                    {getBrowserIcon(client.browser)}
                    <span>
                      {getBrowserName(client.browser)}{' '}
                      {client.browserVersion ? `v${client.browserVersion.split('.')[0]}` : ''}
                    </span>
                    <Tag color="blue">{client.connectionType}</Tag>
                  </Space>
                </div>
              ))}
              {clients.length > 5 && <div className="more-clients">...and {clients.length - 5} more</div>}
            </div>
          )}
        </>
      )}

      {totalConnections === 0 && wsServerRunning && (
        <div className="no-connections">No browser extensions connected</div>
      )}
    </div>
  ) : (
    // Non-developer mode: Simple user-friendly message
    <div className="connection-tooltip">
      {totalConnections > 0 ? <div>Browser extension is connected</div> : <div>No browser extension connected</div>}
    </div>
  );

  // Connection status display - keep default styling
  const statusIcon = totalConnections > 0 ? <CheckCircleOutlined /> : <ApiOutlined />;

  return (
    <Tooltip title={tooltipContent} placement="bottomRight">
      <Tag color="default" className="connection-status-tag">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          {statusIcon}
          {settings?.developerMode && totalConnections > 0 && <span>({totalConnections})</span>}
        </span>
      </Tag>
    </Tooltip>
  );
};

export default BrowserConnectionStatus;
