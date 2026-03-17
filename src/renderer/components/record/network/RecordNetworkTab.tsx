/**
 * RecordNetworkTab Component
 * 
 * Refactored network requests display component with improved modularity
 * Uses shared hooks and components for consistent behavior
 * 
 * @param {Object} props - Component props
 * @param {Object} props.record - The record containing network requests
 * @param {string} props.viewMode - Current view mode
 * @param {number} props.activeTime - Current playback time for highlighting
 * @param {boolean} props.autoHighlight - Whether to enable auto-highlighting
 */
import React, { useState, useRef } from 'react';
import { Table, Typography, Button, Tooltip, theme, Empty } from 'antd';
import { SearchOutlined, ClearOutlined } from '@ant-design/icons';
import { formatBytes, formatMilliseconds } from '../../../utils';
import { useSearchFilter } from '../shared/useSearchFilter';
import { useTimeHighlight } from '../shared/useTimeHighlight';
import SearchOverlay from '../shared/SearchOverlay';
import TimestampCell from '../shared/TimestampCell';
import RecordNetworkDetails from './RecordNetworkDetails';
import NetworkBodyFilters from './NetworkBodyFilters';
import NetworkFilterTags from './NetworkFilterTags';
import NetworkRequestCell from './NetworkRequestCell';
import NetworkStatusCell from './NetworkStatusCell';
import VirtualizedFilterableTable from '../../common/virtualized-table/VirtualizedFilterableTable';
import { 
    getTypeFromRecord, 
    getUniqueTypes, 
    getUniqueStatusGroups, 
    getUniqueMethods 
} from './NetworkTypeUtils';
import { createStandardTableProps } from '../shared';

const { Text } = Typography;

const RecordNetworkTab = ({ record, viewMode, activeTime, autoHighlight = false }) => {
    const { token } = theme.useToken();

    // UI state
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [networkFilters, setNetworkFilters] = useState({
        status: [],
        method: [],
        type: []
    });
    const [bodyFilters, setBodyFilters] = useState({
        hasRequestBody: false,
        hasResponseBody: false
    });

    // Search functionality
    const searchFilter = useSearchFilter();
    
    // Time-based highlighting
    const timeHighlight = useTimeHighlight(record, viewMode, activeTime, autoHighlight);

    // Virtualization ref
    const virtualTableRef = useRef();

    // Check if no network requests for empty state
    const hasNoData = !record?.network?.length;

    const selectedRequest = selectedRequestId !== null && !hasNoData ?
        record.network.find(req => req.id === selectedRequestId) : null;

    // Get filter options (only if we have data)
    const statusValues = hasNoData ? [] : getUniqueStatusGroups(record.network);
    const methodValues = hasNoData ? [] : getUniqueMethods(record.network);
    const typeValues = hasNoData ? [] : getUniqueTypes(record.network);

    /**
     * Check if body filters are active
     */
    const isBodyFilterActive = bodyFilters.hasRequestBody || bodyFilters.hasResponseBody;

    /**
     * Filter data based on body filters
     */
    const getFilteredData = (data) => {
        if (!isBodyFilterActive) return data;

        return data.filter(req => {
            const hasRequestBody = req.requestBody &&
                (typeof req.requestBody === 'string' ? req.requestBody.trim() !== '' : Object.keys(req.requestBody).length > 0);
            const hasResponseBody = req.responseBody &&
                (typeof req.responseBody === 'string' ? req.responseBody.trim() !== '' : Object.keys(req.responseBody).length > 0);

            if (bodyFilters.hasRequestBody && bodyFilters.hasResponseBody) {
                return hasRequestBody && hasResponseBody;
            } else if (bodyFilters.hasRequestBody) {
                return hasRequestBody;
            } else if (bodyFilters.hasResponseBody) {
                return hasResponseBody;
            }
            return true;
        });
    };

    /**
     * Extract searchable fields from network record
     */
    const extractSearchableFields = (networkRecord) => {
        const searchableFields = [networkRecord.url.toLowerCase()];

        // Add request headers
        if (networkRecord.requestHeaders) {
            Object.entries(networkRecord.requestHeaders).forEach(([key, val]) => {
                searchableFields.push(key.toLowerCase());
                searchableFields.push(String(val).toLowerCase());
            });
        }

        // Add response headers
        if (networkRecord.responseHeaders) {
            Object.entries(networkRecord.responseHeaders).forEach(([key, val]) => {
                searchableFields.push(key.toLowerCase());
                searchableFields.push(String(val).toLowerCase());
            });
        }

        // Add request body
        if (networkRecord.requestBody) {
            const bodyStr = typeof networkRecord.requestBody === 'string'
                ? networkRecord.requestBody
                : JSON.stringify(networkRecord.requestBody);
            searchableFields.push(bodyStr.toLowerCase());
        }

        // Add response body
        if (networkRecord.responseBody) {
            const bodyStr = typeof networkRecord.responseBody === 'string'
                ? networkRecord.responseBody
                : JSON.stringify(networkRecord.responseBody);
            searchableFields.push(bodyStr.toLowerCase());
        }

        return searchableFields;
    };

    // Table columns configuration
    const columns = [
        {
            title: 'Timestamp',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 100,
            sorter: (a, b) => a.timestamp - b.timestamp,
            defaultSortOrder: 'ascend',
            render: (timestamp, networkRecord) => (
                <TimestampCell
                    timestamp={timestamp}
                    record={record}
                    isCurrentEntry={timeHighlight.isCurrentEntry(networkRecord, record.network)}
                    width={80}
                />
            )
        },
        {
            title: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Name</span>
                    <NetworkFilterTags 
                        showInverseTag={searchFilter.searchValue && searchFilter.inverseFilter}
                        showSearchTag={searchFilter.searchValue && !searchFilter.inverseFilter}
                        bodyFilters={bodyFilters}
                    />
                    <Tooltip title={searchFilter.searchValue ? 
                        `Searching: "${searchFilter.searchValue}"${searchFilter.inverseFilter ? ' (inverse)' : ''}` : 
                        "Search all metadata (URL, headers, payloads)"
                    }>
                        <Button
                            type="text"
                            size="small"
                            icon={<SearchOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                searchFilter.toggleSearch();
                            }}
                            style={{
                                minWidth: 'auto',
                                padding: '0 4px',
                                height: '20px',
                                color: searchFilter.searchValue ? 
                                    (searchFilter.inverseFilter ? '#ff4d4f' : '#1890ff') : 
                                    '#8c8c8c'
                            }}
                        />
                    </Tooltip>
                    <NetworkBodyFilters
                        bodyFilters={bodyFilters}
                        onBodyFiltersChange={setBodyFilters}
                        token={token}
                    />
                    {(searchFilter.searchValue || bodyFilters.hasRequestBody || bodyFilters.hasResponseBody) && (
                        <Tooltip title="Clear all filters">
                            <Button
                                type="text"
                                size="small"
                                icon={<ClearOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    searchFilter.clearSearch();
                                    setBodyFilters({ hasRequestBody: false, hasResponseBody: false });
                                }}
                                style={{
                                    minWidth: 'auto',
                                    padding: '0 4px',
                                    height: '20px',
                                    color: '#ff4d4f'
                                }}
                            />
                        </Tooltip>
                    )}
                </div>
            ),
            dataIndex: 'url',
            key: 'name',
            width: selectedRequest ? 140 : 250,
            ellipsis: true,
            filteredValue: searchFilter.searchValue ? [searchFilter.searchValue] : null,
            onFilter: searchFilter.createFilterFunction(extractSearchableFields),
            render: (url, networkRecord) => (
                <NetworkRequestCell url={url} record={networkRecord} token={token} />
            )
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 80,
            sorter: (a, b) => (a.status || 0) - (b.status || 0),
            filters: statusValues.map(value => ({ text: value, value })),
            filteredValue: networkFilters.status,
            onFilter: (value, networkRecord) => {
                if (networkRecord.error) return value === 'Failed';
                if (!networkRecord.status) return value === 'Pending';
                if (value === '2xx') return networkRecord.status >= 200 && networkRecord.status < 300;
                if (value === '3xx') return networkRecord.status >= 300 && networkRecord.status < 400;
                if (value === '4xx') return networkRecord.status >= 400 && networkRecord.status < 500;
                if (value === '5xx') return networkRecord.status >= 500;
                return String(networkRecord.status) === value;
            },
            render: (status, networkRecord) => (
                <NetworkStatusCell status={status} record={networkRecord} token={token} />
            )
        },
        {
            title: 'Method',
            dataIndex: 'method',
            key: 'method',
            width: 80,
            sorter: (a, b) => a.method.localeCompare(b.method),
            filters: methodValues.map(value => ({ text: value, value })),
            filteredValue: networkFilters.method,
            onFilter: (value, networkRecord) => networkRecord.method === value,
            render: (method) => <Text style={{ fontSize: '12px' }}>{method}</Text>
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            width: selectedRequest ? 80 : 100,
            sorter: (a, b) => getTypeFromRecord(a).localeCompare(getTypeFromRecord(b)),
            filters: typeValues.map(value => ({ text: value, value })),
            filteredValue: networkFilters.type,
            onFilter: (value, filterRecord) => getTypeFromRecord(filterRecord) === value,
            render: (type, networkRecord) => (
                <Text style={{ fontSize: '12px' }}>{getTypeFromRecord(networkRecord)}</Text>
            )
        },
        ...(selectedRequest ? [] : [{
            title: 'Size',
            dataIndex: 'size',
            key: 'size',
            width: 100,
            align: 'right',
            render: (size, networkRecord) => {
                const bytes = size || networkRecord.responseSize || 0;
                return <Text style={{ fontSize: '12px' }}>{formatBytes(bytes)}</Text>;
            }
        }]),
        ...(selectedRequest ? [] : [{
            title: 'Time',
            dataIndex: 'duration',
            key: 'time',
            width: 100,
            align: 'right',
            render: (duration, networkRecord) => {
                const ms = duration || (networkRecord.endTime - networkRecord.timestamp) || 0;
                return <Text style={{ fontSize: '12px' }}>{formatMilliseconds(ms)}</Text>;
            }
        }])
    ];

    // Format and filter table data with unique keys (only if we have data)
    const unfilteredData = hasNoData ? [] : record.network
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((item, index) => ({
            ...item,
            key: `network-${item.id || item.url}-${item.timestamp}-${index}`
        }));
    const tableDataSource = getFilteredData(unfilteredData);

    // Table change handler
    const handleTableChange = (pagination, filters) => {
        setNetworkFilters({
            status: filters.status || [],
            method: filters.method || [],
            type: filters.type || []
        });
    };

    // Row class name generator
    const generateRowClassName = (networkRecord) => {
        return timeHighlight.getRowClassName(networkRecord, record.network);
    };

    // Use virtualization for large datasets (more than 100 requests)
    const useVirtualization = tableDataSource.length > 100;

    // Complete table props
    const tableProps = {
        ...createStandardTableProps(
            tableDataSource,
            columns,
            handleTableChange,
            generateRowClassName
        ),
        rowSelection: {
            type: 'radio',
            selectedRowKeys: selectedRequestId ?
                tableDataSource.findIndex(req => req.id === selectedRequestId) >= 0 ?
                    [tableDataSource.findIndex(req => req.id === selectedRequestId)] : []
                : [],
            onSelect: (record, selected, selectedRows, nativeEvent) => {
                nativeEvent?.stopPropagation?.();
            },
            hideSelectAll: true,
            columnWidth: 0,
            columnTitle: ''
        },
        onRow: (networkRecord) => ({
            onClick: () => {
                if (selectedRequestId === networkRecord.id) {
                    setSelectedRequestId(null);
                } else {
                    setSelectedRequestId(networkRecord.id);
                }
            },
            style: { cursor: 'pointer' }
        })
    };

    if (hasNoData) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <>
            <SearchOverlay
                visible={searchFilter.searchVisible}
                searchValue={searchFilter.searchValue}
                onSearchChange={searchFilter.updateSearchValue}
                onClose={searchFilter.hideSearch}
                inverseFilter={searchFilter.inverseFilter}
                onInverseFilterChange={searchFilter.toggleInverseFilter}
                placeholder="Search all metadata"
                showInverseFilter={true}
            />

            <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
                {selectedRequest ? (
                    <div style={{ display: 'flex', gap: '1px', height: '100%' }}>
                        <div style={{ width: '50%', height: '100%' }}>
                            {useVirtualization ? (
                                <VirtualizedFilterableTable
                                    ref={virtualTableRef}
                                    {...tableProps}
                                    height={280}
                                    rowHeight={32}
                                    selectedRowKeys={selectedRequestId ? 
                                        [tableDataSource.findIndex(req => req.id === selectedRequestId)] : 
                                        []
                                    }
                                />
                            ) : (
                                <Table {...tableProps} />
                            )}
                        </div>
                        <RecordNetworkDetails
                            request={selectedRequest}
                            record={record}
                            onClose={() => setSelectedRequestId(null)}
                        />
                    </div>
                ) : (
                    useVirtualization ? (
                        <VirtualizedFilterableTable
                            ref={virtualTableRef}
                            {...tableProps}
                            height={280}
                            rowHeight={32}
                            selectedRowKeys={selectedRequestId ? 
                                [tableDataSource.findIndex(req => req.id === selectedRequestId)] : 
                                []
                            }
                        />
                    ) : (
                        <Table {...tableProps} />
                    )
                )}
            </div>
        </>
    );
};

export default RecordNetworkTab;