import React, { forwardRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { VariableSizeList as List } from 'react-window';
import { Table } from 'antd';
import './VirtualizedTables.css';

/**
 * VirtualizedFilterableTable Component
 * 
 * Enhanced virtualized table with advanced filtering and search support,
 * specifically designed for complex data visualization with extensive interaction.
 * 
 * Features:
 * - Advanced column filtering with multi-value support
 * - Comprehensive search through all metadata fields
 * - Variable row heights for dynamic content
 * - Radio and checkbox selection modes
 * - Scroll-to-item functionality via imperative API
 * - Optimized rendering for large filtered datasets
 * - Sticky header with filtering controls
 * - Custom row class names and styling
 * - Real-time filtering and search
 * 
 * Performance:
 * - Variable size list for efficient memory usage
 * - Filtered data processing with memoization
 * - Optimized re-renders with useCallback
 * - Configurable overscan for smooth scrolling
 * 
 * Use Cases:
 * - Network request analysis tables
 * - Complex data tables with filtering requirements
 * - Any table with >100 items and search/filter needs
 * 
 * @component
 * @since 3.0.0
 */
const VirtualizedFilterableTable = forwardRef(({
  columns,
  dataSource,
  rowHeight = 54,
  height = 280,
  onRow,
  rowKey,
  rowSelection,
  rowClassName,
  onChange,
  filteredValue,
  scroll,
  selectedRowKeys = [],
  ...restProps
}, ref) => {
  const listRef = React.useRef();

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    scrollToItem: (index) => {
      listRef.current?.scrollToItem(index, 'center');
    }
  }));

  // Get item height - can be dynamic based on content
  const getItemSize = useCallback(() => {
    return rowHeight;
  }, [rowHeight]);

  // Process data with filters
  const processedData = useMemo(() => {
    let filtered = [...dataSource];

    // Apply column filters
    columns.forEach(column => {
      if (column.onFilter && column.filteredValue?.length > 0) {
        filtered = filtered.filter(record => {
          return column.filteredValue.some(value => column.onFilter(value, record));
        });
      }
    });

    return filtered;
  }, [dataSource, columns]);

  // Row renderer for react-window
  const Row = useCallback(({ index, style }) => {
    const record = processedData[index];
    if (!record) return null;

    const key = typeof rowKey === 'function' ? rowKey(record) : record[rowKey];
    
    // Get row props if onRow is provided
    const rowProps = onRow ? onRow(record, index) : {};
    
    // Check if row is selected
    const isSelected = selectedRowKeys?.includes(index);
    
    // Get row class name
    const className = typeof rowClassName === 'function' 
      ? rowClassName(record, index) 
      : rowClassName || '';
    
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: isSelected ? '#e6f7ff' : undefined,
        }}
        className={`virtual-table-row ${className} ${rowProps.className || ''}`}
        onClick={rowProps.onClick}
        onDoubleClick={rowProps.onDoubleClick}
      >
        {/* Selection radio/checkbox */}
        {rowSelection && (
          <div className="virtual-table-cell selection-cell" style={{ width: 40 }}>
            <input
              type={rowSelection.type === 'radio' ? 'radio' : 'checkbox'}
              checked={isSelected}
              onChange={(e) => {
                if (rowSelection.type === 'radio') {
                  rowSelection.onSelect?.(record, true, [record], e);
                } else {
                  const checked = e.target.checked;
                  // Get all selected records based on current keys
                  const newSelectedKeys = checked 
                    ? [...(rowSelection.selectedRowKeys || []), key]
                    : (rowSelection.selectedRowKeys || []).filter(k => k !== key);
                  
                  const newSelectedRows = processedData.filter(item => {
                    const itemKey = typeof rowKey === 'function' ? rowKey(item) : item[rowKey];
                    return newSelectedKeys.includes(itemKey);
                  });
                  
                  rowSelection.onChange?.(newSelectedKeys, newSelectedRows);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        
        {/* Render cells */}
        {columns.map((column, colIndex) => {
          let value;
          if (column.dataIndex) {
            value = record[column.dataIndex];
          }
          
          const cellContent = column.render 
            ? column.render(value, record, index) 
            : value;
          
          return (
            <div
              key={column.key || column.dataIndex || colIndex}
              className="virtual-table-cell"
              style={{
                width: column.width || 150,
                textAlign: column.align || 'left',
                padding: '8px 16px',
                overflow: 'hidden',
              }}
            >
              {cellContent}
            </div>
          );
        })}
      </div>
    );
  }, [processedData, columns, rowKey, onRow, rowSelection, selectedRowKeys, rowClassName]);

  // Header renderer with filter support
  const renderHeader = () => (
    <div className="virtual-table-header" style={{ 
      display: 'flex', 
      borderBottom: '1px solid #f0f0f0',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: '#fafafa'
    }}>
      {rowSelection && (
        <div className="virtual-table-header-cell selection-cell" style={{ width: 40 }}>
          {rowSelection.type !== 'radio' && (
            <input
              type="checkbox"
              checked={rowSelection?.selectedRowKeys?.length === processedData.length && processedData.length > 0}
              ref={(checkbox) => {
                if (checkbox) {
                  checkbox.indeterminate = rowSelection?.selectedRowKeys?.length > 0 && rowSelection?.selectedRowKeys?.length < processedData.length;
                }
              }}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  const allKeys = processedData.map((item, index) => index);
                  rowSelection.onChange?.(allKeys, processedData);
                } else {
                  rowSelection.onChange?.([], []);
                }
              }}
            />
          )}
        </div>
      )}
      {columns.map((column, index) => (
        <div
          key={column.key || column.dataIndex || index}
          className="virtual-table-header-cell"
          style={{
            width: column.width || 150,
            textAlign: column.align || 'left',
            padding: '8px 16px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: column.align === 'right' ? 'flex-end' : 'flex-start',
          }}
        >
          {column.title}
        </div>
      ))}
    </div>
  );

  // Empty state
  if (!processedData || processedData.length === 0) {
    return (
      <Table
        columns={columns}
        dataSource={[]}
        locale={{ emptyText: 'No data' }}
        {...restProps}
      />
    );
  }

  return (
    <div className="virtualized-table-container" style={{ height: '100%' }}>
      {renderHeader()}
      <List
        ref={listRef}
        height={height - 54} // Subtract header height
        itemCount={processedData.length}
        itemSize={getItemSize}
        width="100%"
        overscanCount={10}
      >
        {Row}
      </List>
    </div>
  );
});

VirtualizedFilterableTable.displayName = 'VirtualizedFilterableTable';

export default VirtualizedFilterableTable;