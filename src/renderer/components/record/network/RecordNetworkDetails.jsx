/**
 * RecordNetworkDetails Component
 * 
 * Refactored network request details panel with improved modularity
 * Uses separate tab components for different data views
 * 
 * @param {Object} props - Component props
 * @param {Object} props.request - Network request to display
 * @param {Object} props.record - Full record for context
 * @param {Function} props.onClose - Close handler
 */
import React, { useState } from 'react';
import { Tabs, Space, Button, Typography, theme } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import NetworkHeadersTab from './tabs/NetworkHeadersTab';
import NetworkPayloadTab from './tabs/NetworkPayloadTab';
import NetworkResponseTab from './tabs/NetworkResponseTab';
import NetworkTimingTab from './tabs/NetworkTimingTab';
import { getDisplayName } from './utils/urlUtils';

const { Text } = Typography;

const RecordNetworkDetails = ({ request, record, onClose }) => {
    const { token } = theme.useToken();
    const [activeTab, setActiveTab] = useState('headers');


    // Configure tab items
    const tabItems = [
        {
            key: 'headers',
            label: 'Headers',
            children: (
                <div style={{ height: '100%', overflow: 'auto' }}>
                    <NetworkHeadersTab request={request} token={token} />
                </div>
            )
        },
        ...(request.requestBody ? [{
            key: 'request',
            label: 'Request',
            children: (
                <div style={{ height: '100%', overflow: 'auto' }}>
                    <NetworkPayloadTab request={request} token={token} />
                </div>
            )
        }] : []),
        {
            key: 'response',
            label: 'Response',
            children: (
                <div style={{ height: '100%', overflow: 'auto' }}>
                    <NetworkResponseTab request={request} token={token} />
                </div>
            )
        },
        {
            key: 'timing',
            label: 'Timing',
            children: (
                <div style={{ height: '100%', overflow: 'auto' }}>
                    <NetworkTimingTab request={request} record={record} token={token} />
                </div>
            )
        }
    ];

    return (
        <div
            className="network-side-panel"
            style={{
                width: '50%',
                borderLeft: `1px solid ${token.colorBorderSecondary}`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* Header */}
            <div style={{
                padding: '8px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                backgroundColor: token.colorBgLayout,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
            }}>
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={onClose}
                    />
                    <Text
                        strong
                        style={{
                            fontSize: '13px',
                            display: 'inline-block',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                        title={request.url}
                    >
                        {getDisplayName(request.url)}
                    </Text>
                </Space>
                <div style={{ width: '32px' }} />
            </div>

            {/* Tabs */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    type="card"
                    size="small"
                    style={{
                        height: '100%',
                        backgroundColor: token.colorBgContainer,
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                    tabBarStyle={{
                        marginBottom: 0,
                        padding: '0 16px',
                        backgroundColor: token.colorBgContainer,
                        flexShrink: 0
                    }}
                    destroyInactiveTabPane={true}
                    items={tabItems}
                />
            </div>
        </div>
    );
};

export default RecordNetworkDetails;