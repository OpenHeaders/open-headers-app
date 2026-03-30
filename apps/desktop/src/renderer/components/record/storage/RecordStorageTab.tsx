/**
 * RecordStorageTab Component
 *
 * Refactored storage changes display component with improved modularity
 * Uses shared hooks and components for consistent behavior
 *
 *  props - Component props
 *  props.record - The record containing storage changes
 *  props.viewMode - Current view mode
 *  props.activeTime - Current playback time for highlighting
 *  props.autoHighlight - Whether to enable auto-highlighting
 */

import { ClearOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import type { Recording, StorageRecord } from '@openheaders/core';
import { App, Button, Empty, Table, Tag, Tooltip, Typography, theme } from 'antd';
import type { FilterValue } from 'antd/es/table/interface';
import type React from 'react';
import { useState } from 'react';
import { createStandardTableProps } from '@/renderer/components/record/shared';
import SearchOverlay from '@/renderer/components/record/shared/SearchOverlay';
import TimestampCell from '@/renderer/components/record/shared/TimestampCell';
import { useSearchFilter } from '@/renderer/components/record/shared/useSearchFilter';
import { useTimeHighlight } from '@/renderer/components/record/shared/useTimeHighlight';
import StorageActionCell from './StorageActionCell';
import StorageAttributesCell from './StorageAttributesCell';
import StorageChangeCell from './StorageChangeCell';
import StorageDetailModal from './StorageDetailModal';
import StorageTypeCell from './StorageTypeCell';
import { formatValue } from './StorageUtils';

const { Text } = Typography;

interface RecordStorageTabProps {
  record: Pick<Recording, 'storage'> & { startTime?: number; metadata?: { startTime?: number } };
  viewMode: string;
  activeTime: number;
  autoHighlight?: boolean;
}

const RecordStorageTab = ({ record, viewMode, activeTime, autoHighlight = false }: RecordStorageTabProps) => {
  const { token } = theme.useToken();
  const { message: messageApi } = App.useApp();

  // Modal state
  const [valueModalVisible, setValueModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StorageRecord | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [domainFilter, setDomainFilter] = useState<string[]>([]);
  const [attributeFilter, setAttributeFilter] = useState<string[]>([]);

  // Search functionality
  const searchFilter = useSearchFilter();

  // Time-based highlighting
  const timeHighlight = useTimeHighlight(viewMode, activeTime, autoHighlight);

  // Early return if no storage changes
  if (!record?.storage?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  /**
   * Show storage detail modal
   */
  const showValueModal = (entry: StorageRecord) => {
    setSelectedEntry(entry);
    setValueModalVisible(true);
  };

  /**
   * Extract searchable fields from storage record
   */
  const extractSearchableFields = (storageRecord: StorageRecord) => {
    return [
      storageRecord.name.toLowerCase(),
      storageRecord.domain.toLowerCase(),
      formatValue(storageRecord.value).toLowerCase(),
      formatValue(storageRecord.oldValue).toLowerCase(),
      (storageRecord.url || '').toLowerCase(),
    ];
  };

  // Table columns configuration
  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 120,
      sorter: (a: StorageRecord, b: StorageRecord) => a.timestamp - b.timestamp,
      defaultSortOrder: 'ascend' as const,
      render: (timestamp: number, storageRecord: StorageRecord) => (
        <TimestampCell
          timestamp={timestamp}
          record={record}
          isCurrentEntry={timeHighlight.isCurrentEntry(storageRecord, record.storage)}
          width={100}
        />
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      filters: [
        { text: 'Local Storage', value: 'localStorage' },
        { text: 'Session Storage', value: 'sessionStorage' },
        { text: 'Cookie', value: 'cookie' },
      ],
      filteredValue: typeFilter,
      onFilter: (value: boolean | React.Key, record: StorageRecord) => record.type === (value as string),
      render: (type: string) => <StorageTypeCell type={type} />,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      filters: [
        { text: 'Set', value: 'set' },
        { text: 'Remove', value: 'remove' },
        { text: 'Clear', value: 'clear' },
      ],
      filteredValue: actionFilter,
      onFilter: (value: boolean | React.Key, record: StorageRecord) => record.action === (value as string),
      render: (action: string, record: StorageRecord) => <StorageActionCell action={action} record={record} />,
    },
    {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>Name</span>
          {searchFilter.searchValue && !searchFilter.inverseFilter && (
            <Tooltip title="Search filter is active">
              <Tag
                icon={<InfoCircleOutlined />}
                color="blue"
                style={{
                  fontSize: '10px',
                  margin: 0,
                  padding: '0 4px',
                  height: '16px',
                  lineHeight: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              />
            </Tooltip>
          )}
          {searchFilter.searchValue && searchFilter.inverseFilter && (
            <Tooltip title="Inverse filter is active - hiding items that match the search">
              <Tag
                color="red"
                style={{
                  fontSize: '10px',
                  margin: 0,
                  padding: '0 4px',
                  height: '16px',
                  lineHeight: '16px',
                }}
              >
                !
              </Tag>
            </Tooltip>
          )}
          <Tooltip
            title={
              searchFilter.searchValue
                ? `Searching: "${searchFilter.searchValue}"${searchFilter.inverseFilter ? ' (inverse)' : ''}`
                : 'Search storage changes'
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
          {searchFilter.searchValue && (
            <Tooltip title="Clear all filters">
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  searchFilter.clearSearch();
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
      dataIndex: 'name',
      key: 'name',
      width: '20%',
      ellipsis: true,
      filteredValue: searchFilter.searchValue ? [searchFilter.searchValue] : null,
      onFilter: searchFilter.createFilterFunction(extractSearchableFields),
      render: (name: string) => (
        <Text code style={{ fontSize: '12px' }}>
          {name === '*' ? '<all keys>' : name}
        </Text>
      ),
    },
    {
      title: 'Change',
      key: 'change',
      render: (_: unknown, record: StorageRecord) => (
        <StorageChangeCell record={record} onViewDetails={showValueModal} messageApi={messageApi} token={token} />
      ),
    },
    {
      title: 'Domain',
      dataIndex: 'domain',
      key: 'domain',
      width: '15%',
      ellipsis: true,
      filters: Array.from(new Set(record.storage.map((item) => item.domain)))
        .sort()
        .map((domain: string) => ({ text: domain, value: domain })),
      filteredValue: domainFilter,
      onFilter: (value: boolean | React.Key, record: StorageRecord) => record.domain === (value as string),
      render: (domain: string, storageRecord: StorageRecord) => (
        <Text
          style={{ fontSize: '12px', opacity: 0.8, cursor: 'help' }}
          title={storageRecord.url || 'URL not available'}
        >
          {domain}
        </Text>
      ),
    },
    {
      title: 'Attributes',
      key: 'attributes',
      width: 120,
      filters: [
        { text: 'Initial', value: 'initial' },
        { text: 'HttpOnly', value: 'httpOnly' },
        { text: 'Secure', value: 'secure' },
        { text: 'Strict', value: 'strict' },
        { text: 'Lax', value: 'lax' },
        { text: 'None', value: 'none' },
      ],
      filteredValue: attributeFilter,
      onFilter: (value: boolean | React.Key, record: StorageRecord) => {
        switch (value as string) {
          case 'initial':
            return record.metadata?.initial === true;
          case 'httpOnly':
            return record.metadata?.httpOnly === true;
          case 'secure':
            return record.metadata?.secure === true;
          case 'strict':
            return record.metadata?.sameSite === 'strict';
          case 'lax':
            return record.metadata?.sameSite === 'lax';
          case 'none':
            return record.metadata?.sameSite === 'none';
          default:
            return false;
        }
      },
      render: (_: unknown, record: StorageRecord) => <StorageAttributesCell record={record} />,
    },
  ];

  // Format table data with unique keys
  const tableData = record.storage
    .slice()
    .sort((a: StorageRecord, b: StorageRecord) => a.timestamp - b.timestamp)
    .map((item: StorageRecord, index: number) => ({
      ...item,
      key: `${item.type}-${item.name}-${item.timestamp}-${index}`,
    }));

  // Table change handler
  const handleTableChange = (_pagination: unknown, filters: Record<string, FilterValue | null>) => {
    setTypeFilter((filters.type || []) as string[]);
    setActionFilter((filters.action || []) as string[]);
    setDomainFilter((filters.domain || []) as string[]);
    setAttributeFilter((filters.attributes || []) as string[]);
  };

  // Row class name generator
  const generateRowClassName = (storageRecord: StorageRecord) => {
    const baseClass = `storage-${storageRecord.type}`;
    return timeHighlight.getRowClassName(storageRecord, record.storage, baseClass);
  };

  // Complete table props
  const tableProps = createStandardTableProps(tableData, columns, handleTableChange, generateRowClassName);

  return (
    <>
      <SearchOverlay
        visible={searchFilter.searchVisible}
        searchValue={searchFilter.searchValue}
        onSearchChange={searchFilter.updateSearchValue}
        onClose={searchFilter.hideSearch}
        placeholder="Search storage changes"
        showInverseFilter={true}
        inverseFilter={searchFilter.inverseFilter}
        onInverseFilterChange={searchFilter.toggleInverseFilter}
      />

      <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <Table {...tableProps} />
      </div>

      <StorageDetailModal
        visible={valueModalVisible}
        selectedEntry={selectedEntry}
        onClose={() => setValueModalVisible(false)}
        messageApi={messageApi}
      />
    </>
  );
};

export default RecordStorageTab;
