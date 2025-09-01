import { useSettings } from '../../contexts';
import React, { useState, useEffect } from 'react';
import { Tooltip, Space, Tag } from 'antd';
import {
    ChromeOutlined,
    GlobalOutlined,
    CompassOutlined,
    IeOutlined,
    ApiOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';

import './BrowserConnectionStatus.css';

const BrowserConnectionStatus = () => {
    const { settings } = useSettings();
    const [connectionStatus, setConnectionStatus] = useState({
        totalConnections: 0,
        browserCounts: {},
        clients: [],
        wsServerRunning: false,
        wssServerRunning: false
    });
    const [proxyStatus, setProxyStatus] = useState({ running: false, port: 59212 });
    const [isLoading, setIsLoading] = useState(true);

    // Browser icon mapping
    const getBrowserIcon = (browser) => {
        const icons = {
            'chrome': <ChromeOutlined />,
            'firefox': <CompassOutlined />,
            'edge': <IeOutlined />,
            'safari': <GlobalOutlined />,
            'unknown': <ApiOutlined />
        };
        return icons[browser] || icons['unknown'];
    };

    // Browser display name mapping
    const getBrowserName = (browser) => {
        const names = {
            'chrome': 'Chrome',
            'firefox': 'Firefox',
            'edge': 'Edge',
            'safari': 'Safari',
            'unknown': 'Unknown'
        };
        return names[browser] || 'Unknown';
    };

    // Fetch connection status
    const fetchConnectionStatus = async () => {
        try {
            if (window.electronAPI && window.electronAPI.wsGetConnectionStatus) {
                const status = await window.electronAPI.wsGetConnectionStatus();
                setConnectionStatus(status);
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Failed to fetch connection status:', error);
            setIsLoading(false);
        }
    };

    // Fetch proxy status
    const fetchProxyStatus = async () => {
        try {
            if (window.electronAPI && window.electronAPI.proxyStatus) {
                const status = await window.electronAPI.proxyStatus();
                setProxyStatus(status);
            }
        } catch (error) {
            console.error('Failed to fetch proxy status:', error);
        }
    };

    useEffect(() => {
        // Initial fetch
        fetchConnectionStatus();
        fetchProxyStatus();

        // Set up periodic updates
        const interval = setInterval(() => {
            fetchConnectionStatus();
            fetchProxyStatus();
        }, 5000);

        // Listen for connection status updates from main process
        let unsubscribe;
        const handleStatusUpdate = (status) => {
            setConnectionStatus(status);
            setIsLoading(false);
        };

        if (window.electronAPI && window.electronAPI.onWsConnectionStatusChanged) {
            unsubscribe = window.electronAPI.onWsConnectionStatusChanged(handleStatusUpdate);
        }

        return () => {
            clearInterval(interval);
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    if (isLoading) {
        return null;
    }

    const { totalConnections, browserCounts, clients, wsServerRunning, wssServerRunning } = connectionStatus;

    // Build tooltip content based on developer mode
    const tooltipContent = settings?.developerMode ? (
        // Developer mode: Show detailed technical information
        <div className="connection-tooltip">
            <div className="server-status">
                <Space direction="vertical" size="small">
                    <div>
                        <Tag color={wsServerRunning ? "green" : "red"}>
                            WS Server: {wsServerRunning ? "Running" : "Stopped"}
                        </Tag>
                    </div>
                    <div>
                        <Tag color={wssServerRunning ? "green" : "red"}>
                            WSS Server: {wssServerRunning ? "Running" : "Stopped"}
                        </Tag>
                    </div>
                    <div>
                        <Tag color={proxyStatus.running ? "green" : "red"}>
                            Proxy Server: {proxyStatus.running ? "Running" : "Stopped"}
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
                                    <span>{getBrowserName(browser)}: {count}</span>
                                </Space>
                            </div>
                        ))}
                    </div>
                    
                    {clients.length > 0 && (
                        <div className="client-list">
                            <strong>Active Connections:</strong>
                            {clients.slice(0, 5).map((client, index) => (
                                <div key={client.id} className="client-info">
                                    <Space size="small">
                                        {getBrowserIcon(client.browser)}
                                        <span>{getBrowserName(client.browser)} {client.browserVersion ? `v${client.browserVersion.split('.')[0]}` : ''}</span>
                                        <Tag size="small" color={client.connectionType === 'WSS' ? 'green' : 'blue'}>
                                            {client.connectionType}
                                        </Tag>
                                    </Space>
                                </div>
                            ))}
                            {clients.length > 5 && (
                                <div className="more-clients">
                                    ...and {clients.length - 5} more
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
            
            {totalConnections === 0 && (wsServerRunning || wssServerRunning) && (
                <div className="no-connections">
                    No browser extensions connected
                </div>
            )}
        </div>
    ) : (
        // Non-developer mode: Simple user-friendly message
        <div className="connection-tooltip">
            {totalConnections > 0 ? (
                <div>Browser extension is connected</div>
            ) : (
                <div>No browser extension connected</div>
            )}
        </div>
    );

    // Connection status display - keep default styling
    const statusIcon = totalConnections > 0 ? <CheckCircleOutlined /> : <ApiOutlined />;

    return (
        <Tooltip title={tooltipContent} placement="bottomRight">
            <Tag color="default" className="connection-status-tag">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {statusIcon}
                    {settings?.developerMode && totalConnections > 0 && (
                        <span>({totalConnections})</span>
                    )}
                </span>
            </Tag>
        </Tooltip>
    );
};

export default BrowserConnectionStatus;