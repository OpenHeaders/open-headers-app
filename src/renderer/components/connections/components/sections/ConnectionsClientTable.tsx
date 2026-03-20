import React from 'react';
import { Card, Space, Typography, Table, Tag, Empty } from 'antd';
import {
    ChromeOutlined, GlobalOutlined, CompassOutlined, IeOutlined, ApiOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * Trim trailing .0 segments from version strings (e.g. "146.0.0.0" → "146")
 */
const trimVersion = (version: string) => {
    if (!version) return '';
    return version.replace(/(\.0)+$/, '');
};

/**
 * Get browser display name and icon
 * (aligned with BrowserConnectionStatus in footer)
 */
const getBrowserDisplay = (browser: string) => {
    const browserMap = {
        chrome: { name: 'Chrome', icon: <ChromeOutlined /> },
        firefox: { name: 'Firefox', icon: <CompassOutlined /> },
        edge: { name: 'Edge', icon: <IeOutlined /> },
        safari: { name: 'Safari', icon: <GlobalOutlined /> },
        brave: { name: 'Brave', icon: <ChromeOutlined /> },
        opera: { name: 'Opera', icon: <GlobalOutlined /> },
        unknown: { name: 'Unknown', icon: <ApiOutlined /> }
    };
    return browserMap[browser as keyof typeof browserMap] || browserMap.unknown;
};

/**
 * ConnectionsClientTable - Connected browser extension clients
 *
 * @param {Object} status - Connection status containing clients array
 * @returns {JSX.Element} Connected clients table
 */
interface ClientRecord {
    id: string;
    browser: string;
    browserVersion: string;
    extensionVersion?: string;
    connectedAt?: string;
}

interface ConnectionsClientTableProps {
    status: { clients?: ClientRecord[] };
}

const ConnectionsClientTable = ({ status }: ConnectionsClientTableProps) => {
    const clients = status.clients || [];

    const columns = [
        {
            title: 'Browser',
            key: 'browser',
            width: 180,
            render: (_: unknown, record: ClientRecord) => {
                const { name, icon } = getBrowserDisplay(record.browser);
                const version = trimVersion(record.browserVersion);
                return (
                    <Space size={6}>
                        {icon}
                        <Text style={{ fontSize: 13 }}>
                            {name}{version ? ` ${version}` : ''}
                        </Text>
                    </Space>
                );
            }
        },
        {
            title: 'Extension',
            dataIndex: 'extensionVersion',
            key: 'extensionVersion',
            width: 100,
            render: (ver: string) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {ver || '-'}
                </Text>
            )
        },
        {
            title: 'Platform',
            dataIndex: 'platform',
            key: 'platform',
            width: 100,
            render: (platform: string) => {
                if (!platform || platform === 'unknown') return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
                const labels = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
                return <Text type="secondary" style={{ fontSize: 12 }}>{labels[platform as keyof typeof labels] || platform}</Text>;
            }
        },
        {
            title: 'Protocol',
            dataIndex: 'connectionType',
            key: 'connectionType',
            width: 80,
            render: (type: string) => (
                <Tag color={type === 'WSS' ? 'green' : 'blue'}>{type}</Tag>
            )
        }
    ];

    return (
        <Card style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>
                    Connected Clients{' '}
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                        ({clients.length})
                    </Text>
                </Title>

                <Table
                    dataSource={clients}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{
                        emptyText: (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="No browser extensions connected"
                            />
                        )
                    }}
                    style={{ marginTop: 4 }}
                />
            </Space>
        </Card>
    );
};

export default ConnectionsClientTable;
