/**
 * Table utilities for record components
 * 
 * Common table configurations and helper functions
 * used across different record tab components
 */

import React from 'react';
import { Button, Tooltip } from 'antd';
import { SearchOutlined, CopyOutlined, EyeOutlined } from '@ant-design/icons';

/**
 * Create a standard timestamp column configuration
 * @param {Function} timestampRenderer - Custom renderer for timestamp cell
 * @param {number} width - Column width
 * @returns {Object} Column configuration
 */
export const createTimestampColumn = (timestampRenderer, width = 120) => ({
    title: 'Timestamp',
    dataIndex: 'timestamp',
    key: 'timestamp',
    width,
    sorter: (a, b) => a.timestamp - b.timestamp,
    defaultSortOrder: 'ascend',
    render: timestampRenderer
});

/**
 * Create a search-enabled column header with search button
 * @param {string} title - Column title
 * @param {boolean} isSearchActive - Whether search is currently active
 * @param {Function} onSearchToggle - Handler for search toggle
 * @param {string} searchTooltip - Tooltip text for search button
 * @param {Object} token - Ant Design theme token
 * @returns {JSX.Element} Column header with search button
 */
export const createSearchableColumnHeader = (
    title, 
    isSearchActive, 
    onSearchToggle, 
    searchTooltip = 'Search',
    token
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
                        color: isSearchActive ? token.colorPrimary : token.colorTextSecondary
                    }}
                />
            </Tooltip>
        </div>
    );
};

/**
 * Create standard table props with common configurations
 * @param {Array} dataSource - Table data
 * @param {Array} columns - Table columns
 * @param {Function} onTableChange - Table change handler
 * @param {Function} rowClassNameGenerator - Function to generate row CSS classes
 * @param {Object} additionalProps - Additional table props
 * @returns {Object} Complete table props
 */
export const createStandardTableProps = (
    dataSource,
    columns,
    onTableChange,
    rowClassNameGenerator,
    additionalProps = {}
) => ({
    dataSource,
    columns,
    size: 'small',
    pagination: false,
    scroll: { y: 280 },
    sticky: true,
    onChange: onTableChange,
    rowClassName: rowClassNameGenerator,
    ...additionalProps
});

/**
 * Create a copy button for cells
 * @param {string} text - Text to copy
 * @param {Object} messageApi - Ant Design message API with success/error methods
 * @param {Function} messageApi.success - Success message function
 * @param {Function} messageApi.error - Error message function
 * @param {string} successMessage - Success message
 * @returns {JSX.Element} Copy button
 */
export const createCopyButton = (text, messageApi, successMessage = 'Copied to clipboard') => {
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
                    } catch (error) {
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
 * @param {Function} onClick - Click handler
 * @param {string} tooltip - Tooltip text
 * @returns {JSX.Element} View button
 */
export const createViewButton = (onClick, tooltip = 'View details') => {
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
 * @param {Array} data - Raw data array
 * @param {string} sortField - Field to sort by (default: 'timestamp')
 * @param {string} keyField - Field to use as React key (default: index)
 * @returns {Array} Formatted data with keys
 */
export const formatTableData = (data, sortField = 'timestamp', keyField) => {
    return data
        .slice()
        .sort((a, b) => a[sortField] - b[sortField])
        .map((item, index) => ({
            ...item,
            key: keyField ? item[keyField] : index
        }));
};