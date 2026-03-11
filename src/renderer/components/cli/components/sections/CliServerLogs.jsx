import React, { useState } from 'react';
import { Card, Space, Typography, Table, Tag, Button, Empty, Select, Input, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * CliServerLogs - Displays recent CLI API request logs with filtering and export
 *
 * @param {Array} logs - Filtered log entries to display
 * @param {Array} allLogs - All unfiltered log entries (for count display)
 * @param {string|null} filterMethod - Current method filter
 * @param {string} filterEndpoint - Current endpoint search filter
 * @param {string|null} filterStatus - Current status filter ('success' | 'error' | null)
 * @param {function} onSetFilters - Callback to update filter values
 * @param {function} onClearFilters - Callback to clear all filters
 * @param {function} onClearLogs - Callback to clear logs
 * @param {function} onExportLogs - Callback to export logs as JSON
 * @param {function} onRefresh - Callback to refresh logs
 * @returns {JSX.Element} CLI server logs section
 */
const CliServerLogs = ({
    logs,
    allLogs,
    filterMethod,
    filterEndpoint,
    filterStatus,
    onSetFilters,
    onClearFilters,
    onClearLogs,
    onExportLogs,
    onRefresh
}) => {
    const hasActiveFilters = filterMethod || filterEndpoint || filterStatus;
    const [expandedRowKeys, setExpandedRowKeys] = useState([]);

    const columns = [
        {
            title: 'Time',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 100,
            defaultSortOrder: 'descend',
            sorter: (a, b) => a.timestamp - b.timestamp,
            render: (ts) => {
                const date = new Date(ts);
                return <Text type="secondary" style={{ fontSize: 12 }}>{date.toLocaleTimeString('en-GB', { hour12: false })}</Text>;
            }
        },
        {
            title: 'Method',
            dataIndex: 'method',
            key: 'method',
            width: 80,
            render: (method) => (
                <Tag color={method === 'GET' ? 'blue' : 'green'}>{method}</Tag>
            )
        },
        {
            title: 'Endpoint',
            dataIndex: 'path',
            key: 'path',
            width: 200,
            render: (path) => <Text code style={{ fontSize: 12 }}>{path}</Text>
        },
        {
            title: 'Client',
            dataIndex: 'userAgent',
            key: 'userAgent',
            width: 160,
            render: (ua) => {
                if (!ua) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
                let label = ua;
                // Trim trailing .0 segments from version strings (e.g. 145.0.0.0 → 145)
                const trimVer = (v) => v.replace(/(\.0)+$/, '');
                // Extract short browser/client identifier from UA string
                if (ua.includes('PowerShell/')) { const m = ua.match(/(?:Windows)?PowerShell\/(\d+\.\d+)/); label = m ? `PowerShell/${m[1]}` : 'PowerShell'; }
                else if (ua.includes('Edg/')) { const m = ua.match(/Edg\/([\d.]+)/); label = m ? `Edge/${trimVer(m[1])}` : 'Edge'; }
                else if (ua.includes('OPR/')) { const m = ua.match(/OPR\/([\d.]+)/); label = m ? `Opera/${trimVer(m[1])}` : 'Opera'; }
                else if (ua.includes('Chrome/') && !ua.includes('Edg/')) { const m = ua.match(/Chrome\/([\d.]+)/); label = m ? `Chrome/${trimVer(m[1])}` : 'Chrome'; }
                else if (ua.includes('Firefox/')) { const m = ua.match(/Firefox\/([\d.]+)/); label = m ? `Firefox/${trimVer(m[1])}` : 'Firefox'; }
                else if (ua.includes('Safari/') && !ua.includes('Chrome/')) { const m = ua.match(/Version\/([\d.]+)/); label = m ? `Safari/${trimVer(m[1])}` : 'Safari'; }
                // Short UA strings like "curl/8.7.1" or "PostmanRuntime/7.51.1" are already clean
                const isShortened = label !== ua;
                if (!isShortened) {
                    return <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>;
                }
                return (
                    <Tooltip title={ua}>
                        <Text type="secondary" style={{ fontSize: 12, cursor: 'default' }}>
                            {label} <InfoCircleOutlined style={{ fontSize: 10 }} />
                        </Text>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Process',
            dataIndex: 'clientProcess',
            key: 'clientProcess',
            width: 120,
            render: (proc) => {
                if (!proc) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
                const parts = proc.split(' → ');
                const label = parts.length > 1 ? parts[0] : proc.split(' (')[0];
                return (
                    <Tooltip title={proc}>
                        <Text type="secondary" style={{ fontSize: 12, cursor: 'default' }}>
                            {label} <InfoCircleOutlined style={{ fontSize: 10 }} />
                        </Text>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Duration',
            dataIndex: 'duration',
            key: 'duration',
            width: 80,
            render: (ms) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {ms != null ? `${ms}ms` : '—'}
                </Text>
            )
        },
        {
            title: 'Status',
            dataIndex: 'statusCode',
            key: 'statusCode',
            width: 80,
            render: (code) => {
                const color = code >= 200 && code < 300 ? 'success' : code >= 400 ? 'error' : 'warning';
                return <Tag color={color}>{code}</Tag>;
            }
        }
    ];

    const getRowKey = (record, index) => `${record.timestamp}-${index}`;

    const toggleRowExpand = (key) => {
        setExpandedRowKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const expandable = {
        expandedRowKeys,
        onExpandedRowsChange: (keys) => setExpandedRowKeys(keys),
        expandedRowRender: (record) => {
            const details = [];
            if (record.errorMessage) {
                details.push(
                    <span key="error">
                        <Text type="secondary" style={{ fontSize: 12 }}>Error: </Text>
                        <Text type="danger" style={{ fontSize: 12 }}>{record.errorMessage}</Text>
                    </span>
                );
            }
            if (record.clientProcess) {
                details.push(
                    <span key="process">
                        <Text type="secondary" style={{ fontSize: 12 }}>Process: </Text>
                        <Text code style={{ fontSize: 12 }}>{record.clientProcess}</Text>
                    </span>
                );
            }
            if (record.bodySummary) {
                details.push(
                    <div key="body">
                        <Text type="secondary" style={{ fontSize: 12 }}>Body:</Text>
                        <pre style={{
                            margin: '4px 0 0',
                            padding: '6px 10px',
                            background: 'var(--ant-color-fill-quaternary)',
                            borderRadius: 4,
                            fontSize: 12,
                            maxWidth: 500
                        }}>{JSON.stringify(record.bodySummary, null, 2)}</pre>
                    </div>
                );
            }
            if (details.length === 0) {
                return <Text type="secondary" style={{ fontSize: 12 }}>No additional details</Text>;
            }
            return <Space direction="vertical" size={4}>{details}</Space>;
        },
        rowExpandable: (record) => !!(record.errorMessage || record.bodySummary || record.clientProcess)
    };

    return (
        <Card style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* Header with title and action buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <Title level={5} style={{ margin: 0 }}>
                            Recent Requests{' '}
                            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                                ({hasActiveFilters ? `${logs.length} of ${allLogs.length}` : allLogs.length})
                            </Text>
                        </Title>
                    </Space>
                    <Space>
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={onExportLogs}
                            disabled={logs.length === 0}
                        >
                            Export
                        </Button>
                        <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={onRefresh}
                        >
                            Refresh
                        </Button>
                        <Button
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={onClearLogs}
                            disabled={allLogs.length === 0}
                        >
                            Clear
                        </Button>
                    </Space>
                </div>

                {/* Filter controls */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FilterOutlined style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }} />
                    <Select
                        size="small"
                        placeholder="Method"
                        allowClear
                        value={filterMethod}
                        onChange={(val) => onSetFilters({ method: val || null })}
                        style={{ width: 100 }}
                        options={[
                            { label: 'GET', value: 'GET' },
                            { label: 'POST', value: 'POST' }
                        ]}
                    />
                    <Input
                        size="small"
                        placeholder="Endpoint"
                        allowClear
                        value={filterEndpoint}
                        onChange={(e) => onSetFilters({ endpoint: e.target.value })}
                        style={{ width: 180 }}
                    />
                    <Select
                        size="small"
                        placeholder="Status"
                        allowClear
                        value={filterStatus}
                        onChange={(val) => onSetFilters({ status: val || null })}
                        style={{ width: 110 }}
                        options={[
                            { label: 'Success', value: 'success' },
                            { label: 'Error', value: 'error' }
                        ]}
                    />
                    {hasActiveFilters && (
                        <Button size="small" type="link" onClick={onClearFilters}>
                            Clear filters
                        </Button>
                    )}
                </div>

                {/* Logs table */}
                <Table
                    dataSource={logs}
                    columns={columns}
                    rowKey={getRowKey}
                    size="small"
                    pagination={{
                        defaultPageSize: 10,
                        pageSizeOptions: [10, 20, 30],
                        showSizeChanger: true,
                        size: 'small'
                    }}
                    expandable={expandable}
                    onRow={(record, index) => {
                        const expandable = !!(record.errorMessage || record.bodySummary || record.clientProcess);
                        return {
                            onClick: () => expandable && toggleRowExpand(getRowKey(record, index)),
                            style: expandable ? { cursor: 'pointer' } : undefined
                        };
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={hasActiveFilters ? 'No matching requests' : 'No requests yet'}
                            />
                        )
                    }}
                    style={{ marginTop: 4 }}
                />
            </Space>
        </Card>
    );
};

export default CliServerLogs;
