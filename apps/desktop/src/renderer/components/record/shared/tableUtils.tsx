/**
 * Table utilities for record components
 *
 * Common table configurations and helper functions
 * used across different record tab components
 */

import { CopyOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { ColumnType, TableProps } from 'antd/es/table';
import type { GlobalToken } from 'antd/es/theme/interface';
import type React from 'react';

interface MessageApi {
  success: (content: string) => void;
  error: (content: string) => void;
}

interface TableRecord {
  timestamp: number;
}

/**
 * Create a standard timestamp column configuration
 *  timestampRenderer - Custom renderer for timestamp cell
 *  width - Column width
 *  Column configuration
 */
export const createTimestampColumn = (timestampRenderer: (value: number) => React.ReactNode, width = 120) => ({
  title: 'Timestamp',
  dataIndex: 'timestamp',
  key: 'timestamp',
  width,
  sorter: (a: TableRecord, b: TableRecord) => a.timestamp - b.timestamp,
  defaultSortOrder: 'ascend' as const,
  render: timestampRenderer,
});

/**
 * Create a search-enabled column header with search button
 *  title - Column title
 *  isSearchActive - Whether search is currently active
 *  onSearchToggle - Handler for search toggle
 *  searchTooltip - Tooltip text for search button
 *  token - Ant Design theme token
 *  Column header with search button
 */
export const createSearchableColumnHeader = (
  title: string,
  isSearchActive: boolean,
  onSearchToggle: () => void,
  searchTooltip = 'Search',
  token: GlobalToken,
) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>{title}</span>
      <Tooltip title={searchTooltip}>
        <Button
          type="text"
          size="small"
          icon={<SearchOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onSearchToggle();
          }}
          style={{
            minWidth: 'auto',
            padding: '0 4px',
            height: '20px',
            color: isSearchActive ? token.colorPrimary : token.colorTextSecondary,
          }}
        />
      </Tooltip>
    </div>
  );
};

/**
 * Create standard table props with common configurations
 *  dataSource - Table data
 *  columns - Table columns
 *  onTableChange - Table change handler
 *  rowClassNameGenerator - Function to generate row CSS classes
 *  additionalProps - Additional table props
 *  Complete table props
 */
export const createStandardTableProps = <T extends TableRecord>(
  dataSource: T[],
  columns: ColumnType<T>[],
  onTableChange: TableProps<T>['onChange'],
  rowClassNameGenerator: (record: T) => string,
  additionalProps: Partial<TableProps<T>> = {},
) => ({
  dataSource,
  columns,
  size: 'small' as const,
  pagination: false as const,
  scroll: { y: 280 },
  sticky: true,
  onChange: onTableChange,
  rowClassName: rowClassNameGenerator,
  ...additionalProps,
});

/**
 * Create a copy button for cells
 *  text - Text to copy
 *  messageApi - Ant Design message API with success/error methods
 *  messageApi.success - Success message function
 *  messageApi.error - Error message function
 *  successMessage - Success message
 *  Copy button
 */
export const createCopyButton = (text: string, messageApi: MessageApi, successMessage = 'Copied to clipboard') => {
  return (
    <Tooltip title="Copy">
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            messageApi.success(successMessage);
          } catch (_error) {
            messageApi.error('Failed to copy to clipboard');
          }
        }}
        style={{ minWidth: 'auto', padding: '0 4px' }}
      />
    </Tooltip>
  );
};

/**
 * Create a view/expand button for cells
 *  onClick - Click handler
 *  tooltip - Tooltip text
 *  View button
 */
export const createViewButton = (onClick: () => void, tooltip = 'View details') => {
  return (
    <Tooltip title={tooltip}>
      <Button
        type="text"
        size="small"
        icon={<EyeOutlined />}
        onClick={onClick}
        style={{ minWidth: 'auto', padding: '0 4px' }}
      />
    </Tooltip>
  );
};

/**
 * Format data for table by adding keys and sorting
 *  data - Raw data array
 *  sortField - Field to sort by (default: 'timestamp')
 *  keyField - Field to use as React key (default: index)
 *  Formatted data with keys
 */
export const formatTableData = (data: TableRecord[]) => {
  return data
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((item, index) => ({
      ...item,
      key: index,
    }));
};
