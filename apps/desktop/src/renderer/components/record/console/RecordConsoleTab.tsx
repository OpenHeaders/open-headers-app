/**
 * RecordConsoleTab Component
 *
 * Refactored console logs display component with improved modularity
 * Uses shared hooks and components for consistent behavior
 *
 * @param {Object} props - Component props
 * @param {Object} props.record - The record containing console logs
 * @param {string} props.viewMode - Current view mode
 * @param {number} props.activeTime - Current playback time for highlighting
 * @param {boolean} props.autoHighlight - Whether to enable auto-highlighting
 */

import { ClearOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Empty, Table, Tag, Tooltip, Typography } from 'antd';
import type { FilterValue } from 'antd/es/table/interface';
import type React from 'react';
import { useState } from 'react';
import type { ConsoleRecord, Recording } from '../../../../types/recording';
import { formatConsoleArg } from '../../../utils';
import { createCopyButton, createStandardTableProps, createTimestampColumn, createViewButton } from '../shared';
import SearchOverlay from '../shared/SearchOverlay';
import TimestampCell from '../shared/TimestampCell';
import { useSearchFilter } from '../shared/useSearchFilter';
import { useTimeHighlight } from '../shared/useTimeHighlight';
import ConsoleLogModal from './ConsoleLogModal';

const { Text } = Typography;

interface RecordConsoleTabProps {
  record: Pick<Recording, 'console'> & { startTime?: number; metadata?: { startTime?: number } };
  viewMode: string;
  activeTime: number;
  autoHighlight?: boolean;
}

const RecordConsoleTab = ({ record, viewMode, activeTime, autoHighlight = false }: RecordConsoleTabProps) => {
  const { message: messageApi } = App.useApp();

  // Modal state
  const [consoleModalVisible, setConsoleModalVisible] = useState(false);
  const [selectedConsoleLog, setSelectedConsoleLog] = useState<{
    timestamp: number;
    level: string;
    message: string;
  } | null>(null);

  // Filter state
  const [consoleLevelFilter, setConsoleLevelFilter] = useState<(string | number | boolean)[]>([]);

  // Search functionality
  const searchFilter = useSearchFilter();

  // Time-based highlighting
  const timeHighlight = useTimeHighlight(viewMode, activeTime, autoHighlight);

  // Early return if no console logs
  if (!record?.console?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  /**
   * Show detailed console log modal
   */
  const showConsoleModal = (timestamp: number, level: string, message: string) => {
    setSelectedConsoleLog({ timestamp, level, message });
    setConsoleModalVisible(true);
  };

  /**
   * Extract searchable fields from console record
   */
  const extractSearchableFields = (consoleRecord: ConsoleRecord) => {
    const message = (consoleRecord.args ?? []).map(formatConsoleArg).join(' ');
    return [message];
  };

  /**
   * Render console log message with actions
   */
  const renderMessage = (args: ConsoleRecord['args'], consoleRecord: ConsoleRecord) => {
    const message = args.map(formatConsoleArg).join(' ');
    const needsExpansion = message.length > 150;
    const displayMessage = needsExpansion ? `${message.substring(0, 150)}...` : message;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
        <Text
          code
          style={{
            fontSize: '12px',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {displayMessage}
        </Text>

        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          {createCopyButton(message, messageApi)}

          {needsExpansion &&
            createViewButton(
              () => showConsoleModal(consoleRecord.timestamp, consoleRecord.level, message),
              'View full message',
            )}
        </div>
      </div>
    );
  };

  /**
   * Render log level tag
   */
  const renderLevel = (level: string) => (
    <Tag
      color={
        level === 'error'
          ? 'error'
          : level === 'warn'
            ? 'warning'
            : level === 'info'
              ? 'blue'
              : level === 'debug'
                ? 'purple'
                : 'default'
      }
    >
      {level.toUpperCase()}
    </Tag>
  );

  // Table columns configuration
  const columns = [
    {
      ...createTimestampColumn(
        ((timestamp: number, consoleRecord: ConsoleRecord) => (
          <TimestampCell
            timestamp={timestamp}
            record={record}
            isCurrentEntry={timeHighlight.isCurrentEntry(consoleRecord, record.console)}
            width={100}
          />
        )) as (value: number) => React.ReactNode,
        120,
      ),
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      filters: [
        { text: 'LOG', value: 'log' },
        { text: 'INFO', value: 'info' },
        { text: 'WARN', value: 'warn' },
        { text: 'ERROR', value: 'error' },
        { text: 'DEBUG', value: 'debug' },
      ],
      filteredValue: consoleLevelFilter,
      onFilter: (value: boolean | React.Key, record: ConsoleRecord) => record.level === (value as string),
      sorter: (a: ConsoleRecord, b: ConsoleRecord) => a.level.localeCompare(b.level),
      render: renderLevel,
    },
    {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>Message</span>
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
            <Tooltip title="Inverse filter is active - hiding messages that match the search">
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
                : 'Search all messages'
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
      dataIndex: 'args',
      key: 'args',
      filteredValue: searchFilter.searchValue ? [searchFilter.searchValue] : null,
      onFilter: searchFilter.createFilterFunction(extractSearchableFields),
      render: renderMessage,
    },
  ];

  // Format table data with unique keys
  const tableData = record.console
    .slice()
    .sort((a: ConsoleRecord, b: ConsoleRecord) => a.timestamp - b.timestamp)
    .map((item: ConsoleRecord, index: number) => ({
      ...item,
      key: `console-${item.timestamp}-${index}`,
    }));

  // Table change handler
  const handleTableChange = (_pagination: unknown, filters: Record<string, FilterValue | null>) => {
    setConsoleLevelFilter((filters.level || []) as string[]);
  };

  // Row class name generator
  const generateRowClassName = (consoleRecord: ConsoleRecord) => {
    const baseClass = `console-${consoleRecord.level}`;
    return timeHighlight.getRowClassName(consoleRecord, record.console, baseClass);
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
        placeholder="Search all messages"
        showInverseFilter={true}
        inverseFilter={searchFilter.inverseFilter}
        onInverseFilterChange={searchFilter.toggleInverseFilter}
      />

      <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <Table {...tableProps} />
      </div>

      <ConsoleLogModal
        visible={consoleModalVisible}
        selectedLog={selectedConsoleLog}
        record={record}
        onClose={() => setConsoleModalVisible(false)}
        messageApi={messageApi}
      />
    </>
  );
};

export default RecordConsoleTab;
