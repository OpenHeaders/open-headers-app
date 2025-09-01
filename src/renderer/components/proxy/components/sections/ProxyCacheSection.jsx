import React from 'react';
import { Card, Space, Switch, Button, Progress, Table, Tooltip, Typography } from 'antd';
import { DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { formatBytes } from '../../utils';

const { Title, Text } = Typography;

/**
 * ProxyCacheSection - Resource cache management component
 * 
 * Dedicated component for managing proxy server resource caching functionality.
 * Displays cache statistics, provides cache controls, and shows detailed cache entries.
 * 
 * Features:
 * - Cache enable/disable toggle with settings persistence
 * - Real-time cache usage statistics and progress indicator
 * - Cache clear functionality with confirmation
 * - Detailed cache entries table with URL, type, size, and timestamp
 * - Responsive design with collapsible details section
 * 
 * Cache Management:
 * - Displays current cache usage vs maximum size with visual progress bar
 * - Shows total number of cached resources
 * - Provides cache clear button (disabled when cache is empty or disabled)
 * - Supports detailed view toggle for cache entry inspection
 * 
 * Technical Notes:
 * - Uses formatBytes utility for human-readable size display
 * - Implements pagination for large cache entry lists
 * - Handles edge cases like empty cache and disabled state
 * - Integrates with proxy server settings for persistence
 * 
 * @param {Object} cacheStats - Current cache statistics
 * @param {boolean} cacheEnabled - Whether cache is enabled
 * @param {Array} cacheEntries - Detailed cache entries for table display
 * @param {boolean} showCacheDetails - Whether to show detailed entries table
 * @param {function} onToggleCache - Callback for cache enable/disable
 * @param {function} onClearCache - Callback for cache clear operation
 * @param {function} onToggleCacheDetails - Callback for details visibility toggle
 * @returns {JSX.Element} Cache management section
 */
const ProxyCacheSection = ({
    cacheStats,
    cacheEnabled,
    cacheEntries,
    showCacheDetails,
    onToggleCache,
    onClearCache,
    onToggleCacheDetails
}) => {
    return (
        <Card style={{ marginTop: '16px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <Title level={4} style={{ margin: 0 }}>Resource Cache</Title>
                        <Switch
                            checked={cacheEnabled}
                            onChange={onToggleCache}
                            checkedChildren="Enabled"
                            unCheckedChildren="Disabled"
                        />
                    </Space>
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={onClearCache}
                        disabled={!cacheEnabled || !cacheStats?.totalEntries}
                    >
                        Clear Cache
                    </Button>
                </div>

                {cacheStats && (
                    <div>
                        <Text type="secondary">
                            Caches resources (images, fonts, CSS, JS) locally for faster replay of recordings.
                        </Text>
                        <div style={{ marginTop: '16px' }}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <div>
                                    <Text>Cache Usage: </Text>
                                    <Text strong>{formatBytes(cacheStats.totalSize)}</Text>
                                    <Text> / {formatBytes(cacheStats.maxCacheSize)}</Text>
                                </div>
                                <Progress
                                    percent={Math.round(cacheStats.usage)}
                                    status={cacheStats.usage > 90 ? 'exception' : 'normal'}
                                />
                                <div>
                                    <Text>Cached Resources: </Text>
                                    <Text strong>{cacheStats.totalEntries}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Text>Cache Duration: </Text>
                                    <Text strong>90 days</Text>
                                    <Tooltip 
                                        title={
                                            <div>
                                                <p><strong>Cache Invalidation Policy:</strong></p>
                                                <ul style={{ marginLeft: '16px', marginBottom: 0 }}>
                                                    <li>Resources are cached for up to 90 days</li>
                                                    <li>Expired entries are automatically removed on access</li>
                                                    <li>When cache exceeds 500MB, oldest entries are evicted (LRU)</li>
                                                    <li>Static resources (CSS, JS, fonts) are cached without auth headers for better reuse</li>
                                                    <li>You can manually clear the cache anytime using the Clear Cache button</li>
                                                </ul>
                                            </div>
                                        }
                                        placement="top"
                                    >
                                        <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: '14px', cursor: 'help' }} />
                                    </Tooltip>
                                </div>
                            </Space>
                        </div>

                        {cacheStats.totalEntries > 0 && (
                            <Button
                                type="link"
                                onClick={onToggleCacheDetails}
                                style={{ marginTop: '8px', padding: 0 }}
                            >
                                {showCacheDetails ? 'Hide' : 'Show'} Cache Details
                            </Button>
                        )}

                        {showCacheDetails && cacheEntries.length > 0 && (
                            <Table
                                style={{ marginTop: '16px' }}
                                dataSource={cacheEntries}
                                rowKey="key"
                                size="small"
                                pagination={cacheEntries.length > 10 ? { pageSize: 10 } : false}
                                columns={[
                                    {
                                        title: 'URL',
                                        dataIndex: 'url',
                                        key: 'url',
                                        ellipsis: true,
                                        render: (url) => (
                                            <Tooltip title={url}>
                                                <Text style={{ fontSize: '12px' }}>{url}</Text>
                                            </Tooltip>
                                        )
                                    },
                                    {
                                        title: 'Type',
                                        dataIndex: 'contentType',
                                        key: 'contentType',
                                        width: 150,
                                        render: (type) => {
                                            const shortType = type?.split(';')[0] || 'unknown';
                                            return <Text style={{ fontSize: '12px' }}>{shortType}</Text>;
                                        }
                                    },
                                    {
                                        title: 'Size',
                                        dataIndex: 'size',
                                        key: 'size',
                                        width: 100,
                                        render: (size) => <Text style={{ fontSize: '12px' }}>{formatBytes(size)}</Text>
                                    },
                                    {
                                        title: 'Cached',
                                        dataIndex: 'timestamp',
                                        key: 'timestamp',
                                        width: 150,
                                        render: (timestamp) => {
                                            const date = new Date(timestamp);
                                            return <Text style={{ fontSize: '12px' }}>{date.toLocaleString()}</Text>;
                                        }
                                    }
                                ]}
                            />
                        )}
                    </div>
                )}
            </Space>
        </Card>
    );
};

export default ProxyCacheSection;