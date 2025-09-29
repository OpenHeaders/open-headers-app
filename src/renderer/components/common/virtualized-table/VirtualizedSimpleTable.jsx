import React, { forwardRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Table } from 'antd';
import './VirtualizedTables.css';

/**
 * VirtualizedSimpleTable Component
 * 
 * A high-performance table component using react-window for efficient rendering
 * of large datasets while maintaining Ant Design styling and functionality.
 * Designed for simple data display with basic interaction patterns.
 * 
 * Features:
 * - Virtualized rendering for optimal performance with large datasets
 * - Full Ant Design table styling compatibility
 * - Row selection support (checkbox-based)
 * - Custom row rendering with event handlers
 * - Automatic fallback to standard Ant Design table for empty states
 * - Responsive design with proper scrolling behavior
 * 
 * Performance:
 * - Only renders visible rows in viewport
 * - Efficient memory usage regardless of dataset size
 * - Smooth scrolling with configurable overscan
 * - Fixed row heights for optimal performance
 * 
 * Use Cases:
 * - Simple data tables with basic CRUD operations
 * - Source management interfaces
 * - Any table with >50 items that needs virtualization
 * 
 * @component
 * @since 3.0.0
 */
const VirtualizedSimpleTable = forwardRef(({
  columns,
  dataSource,
  rowHeight = 54,
  height = 400,
  onRow,
  rowKey,
  rowSelection,
  expandable,
  scroll,
  ...restProps
}, ref) => {
  // Row renderer for react-window virtualization
  const Row = useCallback(({ index, style }) => {
    const record = dataSource[index];
    const key = typeof rowKey === 'function' ? rowKey(record) : record[rowKey];
    
    // Get row props if onRow is provided
    const rowProps = onRow ? onRow(record, index) : {};
    
    // Check if row is selected
    const isSelected = rowSelection?.selectedRowKeys?.includes(key);
    
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}
        className={`virtual-table-row ${isSelected ? 'selected' : ''} ${rowProps.className || ''}`}
        onClick={rowProps.onClick}
        onDoubleClick={rowProps.onDoubleClick}
      >
        {/* Selection checkbox */}
        {rowSelection && (
          <div className="virtual-table-cell selection-cell" style={{ width: 60 }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                const checked = e.target.checked;
                const currentKeys = rowSelection.selectedRowKeys || [];
                let newKeys;
                
                if (checked) {
                  newKeys = [...currentKeys, key];
                } else {
                  newKeys = currentKeys.filter(k => k !== key);
                }
                
                rowSelection.onChange?.(newKeys, dataSource.filter(item => {
                  const itemKey = typeof rowKey === 'function' ? rowKey(item) : item[rowKey];
                  return newKeys.includes(itemKey);
                }));
              }}
            />
          </div>
        )}
        
        {/* Render cells */}
        {columns.map((column, colIndex) => {
          const value = record[column.dataIndex];
          const cellContent = column.render ? column.render(value, record, index) : value;
          
          return (
            <div
              key={column.key || column.dataIndex || colIndex}
              className="virtual-table-cell"
              style={{
                width: column.width || 150,
                textAlign: column.align || 'left',
                padding: '0 16px',
              }}
            >
              {cellContent}
            </div>
          );
        })}
      </div>
    );
  }, [dataSource, columns, rowKey, onRow, rowSelection]);

  // Header renderer
  const renderHeader = () => (
    <div className="virtual-table-header" style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
      {rowSelection && (
        <div className="virtual-table-header-cell selection-cell" style={{ width: 60 }}>
          <input
            type="checkbox"
            checked={rowSelection?.selectedRowKeys?.length === dataSource.length}
            ref={(checkbox) => {
              if (checkbox) {
                checkbox.indeterminate = rowSelection?.selectedRowKeys?.length > 0 && rowSelection?.selectedRowKeys?.length < dataSource.length;
              }
            }}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                const allKeys = dataSource.map(item => 
                  typeof rowKey === 'function' ? rowKey(item) : item[rowKey]
                );
                rowSelection.onChange?.(allKeys, dataSource);
              } else {
                rowSelection.onChange?.([], []);
              }
            }}
          />
        </div>
      )}
      {columns.map((column, index) => (
        <div
          key={column.key || column.dataIndex || index}
          className="virtual-table-header-cell"
          style={{
            width: column.width || 150,
            textAlign: column.align || 'left',
            padding: '0 16px',
            fontWeight: 500,
          }}
        >
          {column.title}
        </div>
      ))}
    </div>
  );

  // Empty state
  if (!dataSource || dataSource.length === 0) {
    return (
      <Table
        columns={columns}
        dataSource={[]}
        {...restProps}
      />
    );
  }

  return (
    <div className="virtualized-table-container">
      {renderHeader()}
      <List
        ref={ref}
        height={height}
        itemCount={dataSource.length}
        itemSize={rowHeight}
        width="100%"
        overscanCount={5}
      >
        {Row}
      </List>
    </div>
  );
});

VirtualizedSimpleTable.displayName = 'VirtualizedSimpleTable';

export default VirtualizedSimpleTable;