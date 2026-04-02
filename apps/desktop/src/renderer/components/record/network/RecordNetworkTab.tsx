/**
 * RecordNetworkTab Component
 *
 * Refactored network requests display component with improved modularity
 * Uses shared hooks and components for consistent behavior
 *
 *  props - Component props
 *  props.record - The record containing network requests
 *  props.viewMode - Current view mode
 *  props.activeTime - Current playback time for highlighting
 *  props.autoHighlight - Whether to enable auto-highlighting
 */

import { ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Empty, Table, Tooltip, Typography, theme } from 'antd';
import type { FilterValue } from 'antd/es/table/interface';
import type React from 'react';
import { useRef, useState } from 'react';
import VirtualizedFilterableTable from '@/renderer/components/common/virtualized-table/VirtualizedFilterableTable';
import { createStandardTableProps } from '@/renderer/components/record/shared';
import SearchOverlay from '@/renderer/components/record/shared/SearchOverlay';
import TimestampCell from '@/renderer/components/record/shared/TimestampCell';
import { useSearchFilter } from '@/renderer/components/record/shared/useSearchFilter';
import { useTimeHighlight } from '@/renderer/components/record/shared/useTimeHighlight';
import { formatBytes, formatMilliseconds } from '@/renderer/utils';
import NetworkBodyFilters from './NetworkBodyFilters';
import NetworkFilterTags from './NetworkFilterTags';
import NetworkRequestCell from './NetworkRequestCell';
import NetworkStatusCell from './NetworkStatusCell';
import { getTypeFromRecord, getUniqueMethods, getUniqueStatusGroups, getUniqueTypes } from './NetworkTypeUtils';
import RecordNetworkDetails from './RecordNetworkDetails';
import type { NetworkRecord, RecordData } from './types';

const { Text } = Typography;

interface RecordNetworkTabProps {
  record: RecordData;
  viewMode: string;
  activeTime: number;
  autoHighlight?: boolean;
}

const RecordNetworkTab = ({ record, viewMode, activeTime, autoHighlight = false }: RecordNetworkTabProps) => {
  const { token } = theme.useToken();

  // UI state
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [networkFilters, setNetworkFilters] = useState<{
    status: (string | number | boolean)[] | null;
    method: (string | number | boolean)[] | null;
    type: (string | number | boolean)[] | null;
  }>({
    status: [],
    method: [],
    type: [],
  });
  const [bodyFilters, setBodyFilters] = useState({
    hasRequestBody: false,
    hasResponseBody: false,
  });

  // Search functionality
  const searchFilter = useSearchFilter();

  // Time-based highlighting
  const timeHighlight = useTimeHighlight(viewMode, activeTime, autoHighlight);

  // Virtualization ref
  const virtualTableRef = useRef(null);

  // Check if no network requests for empty state
  const hasNoData = !record?.network?.length;

  const selectedRequest =
    selectedRequestId !== null && !hasNoData ? record.network.find((req) => req.id === selectedRequestId) : null;

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
  const getFilteredData = (data: NetworkRecord[]) => {
    if (!isBodyFilterActive) return data;

    return data.filter((req: NetworkRecord) => {
      const hasRequestBody = req.requestBody && req.requestBody.trim() !== '';
      const hasResponseBody = req.responseBody && req.responseBody.trim() !== '';

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
  const extractSearchableFields = (networkRecord: NetworkRecord) => {
    const searchableFields = [networkRecord.url.toLowerCase()];

    // Add request headers
    if (networkRecord.requestHeaders) {
      Object.entries(networkRecord.requestHeaders).forEach(([key, val]: [string, string]) => {
        searchableFields.push(key.toLowerCase());
        searchableFields.push(String(val).toLowerCase());
      });
    }

    // Add response headers
    if (networkRecord.responseHeaders) {
      Object.entries(networkRecord.responseHeaders).forEach(([key, val]: [string, string]) => {
        searchableFields.push(key.toLowerCase());
        searchableFields.push(String(val).toLowerCase());
      });
    }

    // Add request body
    if (networkRecord.requestBody) {
      searchableFields.push(networkRecord.requestBody.toLowerCase());
    }

    // Add response body
    if (networkRecord.responseBody) {
      searchableFields.push(networkRecord.responseBody.toLowerCase());
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
      sorter: (a: NetworkRecord, b: NetworkRecord) => a.timestamp - b.timestamp,
      defaultSortOrder: 'ascend' as const,
      render: (timestamp: number, networkRecord: NetworkRecord) => (
        <TimestampCell
          timestamp={timestamp}
          record={record}
          isCurrentEntry={timeHighlight.isCurrentEntry(networkRecord, record.network)}
          width={80}
        />
      ),
    },
    {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>Name</span>
          <NetworkFilterTags
            showInverseTag={!!searchFilter.searchValue && searchFilter.inverseFilter}
            showSearchTag={!!searchFilter.searchValue && !searchFilter.inverseFilter}
            bodyFilters={bodyFilters}
          />
          <Tooltip
            title={
              searchFilter.searchValue
                ? `Searching: "${searchFilter.searchValue}"${searchFilter.inverseFilter ? ' (inverse)' : ''}`
                : 'Search all metadata (URL, headers, payloads)'
            }
          >
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
                color: searchFilter.searchValue ? (searchFilter.inverseFilter ? '#ff4d4f' : '#1890ff') : '#8c8c8c',
              }}
            />
          </Tooltip>
          <NetworkBodyFilters bodyFilters={bodyFilters} onBodyFiltersChange={setBodyFilters} token={token} />
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
                  color: '#ff4d4f',
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
      render: (url: string, networkRecord: NetworkRecord) => (
        <NetworkRequestCell url={url} record={networkRecord} token={token} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      sorter: (a: NetworkRecord, b: NetworkRecord) => (a.status || 0) - (b.status || 0),
      filters: statusValues.map((value) => ({ text: value, value })),
      filteredValue: networkFilters.status,
      onFilter: (value: boolean | React.Key, networkRecord: NetworkRecord) => {
        if (networkRecord.error) return value === 'Failed';
        if (!networkRecord.status) return value === 'Pending';
        if (value === '2xx') return networkRecord.status >= 200 && networkRecord.status < 300;
        if (value === '3xx') return networkRecord.status >= 300 && networkRecord.status < 400;
        if (value === '4xx') return networkRecord.status >= 400 && networkRecord.status < 500;
        if (value === '5xx') return networkRecord.status >= 500;
        return String(networkRecord.status) === value;
      },
      render: (status: number, networkRecord: NetworkRecord) => (
        <NetworkStatusCell status={status} record={networkRecord} token={token} />
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 80,
      sorter: (a: NetworkRecord, b: NetworkRecord) => a.method.localeCompare(b.method),
      filters: methodValues.map((value) => ({ text: value, value })),
      filteredValue: networkFilters.method,
      onFilter: (value: boolean | React.Key, networkRecord: NetworkRecord) => networkRecord.method === String(value),
      render: (method: string) => <Text style={{ fontSize: '12px' }}>{method}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: selectedRequest ? 80 : 100,
      sorter: (a: NetworkRecord, b: NetworkRecord) => getTypeFromRecord(a).localeCompare(getTypeFromRecord(b)),
      filters: typeValues.map((value) => ({ text: value, value })),
      filteredValue: networkFilters.type,
      onFilter: (value: boolean | React.Key, filterRecord: NetworkRecord) =>
        getTypeFromRecord(filterRecord) === String(value),
      render: (_type: string, networkRecord: NetworkRecord) => (
        <Text style={{ fontSize: '12px' }}>{getTypeFromRecord(networkRecord)}</Text>
      ),
    },
    ...(selectedRequest
      ? []
      : [
          {
            title: 'Size',
            dataIndex: 'size',
            key: 'size',
            width: 100,
            align: 'right' as const,
            render: (size: number, networkRecord: NetworkRecord) => {
              const bytes = size || networkRecord.responseSize || 0;
              return <Text style={{ fontSize: '12px' }}>{formatBytes(bytes)}</Text>;
            },
          },
        ]),
    ...(selectedRequest
      ? []
      : [
          {
            title: 'Time',
            dataIndex: 'duration',
            key: 'time',
            width: 100,
            align: 'right' as const,
            render: (duration: number, networkRecord: NetworkRecord) => {
              const ms = duration || (networkRecord.endTime ?? 0) - networkRecord.timestamp || 0;
              return <Text style={{ fontSize: '12px' }}>{formatMilliseconds(ms)}</Text>;
            },
          },
        ]),
  ];

  // Format and filter table data with unique keys (only if we have data)
  const unfilteredData = hasNoData
    ? []
    : record.network
        .slice()
        .sort((a: NetworkRecord, b: NetworkRecord) => a.timestamp - b.timestamp)
        .map((item: NetworkRecord, index: number) => ({
          ...item,
          key: `network-${item.id || item.url}-${item.timestamp}-${index}`,
        }));
  const tableDataSource = getFilteredData(unfilteredData);

  // Table change handler
  const handleTableChange = (_pagination: unknown, filters: Record<string, FilterValue | null>) => {
    setNetworkFilters({
      status: (filters.status || []) as (string | number | boolean)[],
      method: (filters.method || []) as (string | number | boolean)[],
      type: (filters.type || []) as (string | number | boolean)[],
    });
  };

  // Row class name generator
  const generateRowClassName = (networkRecord: NetworkRecord) => {
    return timeHighlight.getRowClassName(networkRecord, record.network);
  };

  // Use virtualization for large datasets (more than 100 requests)
  const useVirtualization = tableDataSource.length > 100;

  // Complete table props
  const standardProps = createStandardTableProps(tableDataSource, columns, handleTableChange, generateRowClassName);
  const tableProps = {
    ...standardProps,
    rowSelection: {
      type: 'radio' as const,
      selectedRowKeys: selectedRequestId
        ? tableDataSource.findIndex((req) => req.id === selectedRequestId) >= 0
          ? [tableDataSource.findIndex((req) => req.id === selectedRequestId)]
          : []
        : [],
      onSelect: (
        _record: NetworkRecord,
        _selected: boolean,
        _selectedRows: NetworkRecord[],
        nativeEvent: { stopPropagation?: () => void },
      ) => {
        nativeEvent?.stopPropagation?.();
      },
      hideSelectAll: true,
      columnWidth: 0,
      columnTitle: '',
    },
    onRow: (networkRecord: NetworkRecord) => ({
      onClick: () => {
        if (selectedRequestId === networkRecord.id) {
          setSelectedRequestId(null);
        } else {
          setSelectedRequestId(networkRecord.id);
        }
      },
      style: { cursor: 'pointer' },
    }),
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
                  selectedRowKeys={
                    selectedRequestId ? [tableDataSource.findIndex((req) => req.id === selectedRequestId)] : []
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
        ) : useVirtualization ? (
          <VirtualizedFilterableTable
            ref={virtualTableRef}
            {...tableProps}
            height={280}
            rowHeight={32}
            selectedRowKeys={
              selectedRequestId ? [tableDataSource.findIndex((req) => req.id === selectedRequestId)] : []
            }
          />
        ) : (
          <Table {...tableProps} />
        )}
      </div>
    </>
  );
};

export default RecordNetworkTab;
