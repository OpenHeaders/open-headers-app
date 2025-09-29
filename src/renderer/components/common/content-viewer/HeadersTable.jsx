/**
 * Headers Table Component
 * 
 * Renders HTTP response headers in a clean, formatted table with proper styling
 * and responsive design. Handles empty states and provides consistent typography.
 * 
 * Features:
 * - Responsive table layout with fixed column widths
 * - Proper typography with monospace font for values
 * - Empty state handling with fallback message
 * - Consistent styling with application theme
 * - Word breaking for long header values
 * 
 * @module HeadersTable
 * @since 3.0.0
 */

import React from 'react';
import { Table, Typography, theme } from 'antd';

const { Text } = Typography;

/**
 * HeadersTable component for displaying HTTP response headers
 * 
 * Renders a structured table of HTTP headers with proper formatting and styling.
 * Automatically handles empty states and provides consistent visual presentation.
 * 
 * @param {Object} props - Component props
 * @param {Object} props.headers - Headers object with key-value pairs to display
 * @param {string} [props.className='headers-table'] - CSS class name for styling
 * @returns {React.Component} Rendered headers table or empty state message
 * @example
 * <HeadersTable headers={{'Content-Type': 'application/json', 'Accept': 'text/html'}} />
 */
export function HeadersTable({ headers, className = "headers-table" }) {
    const { token } = theme.useToken();

    // Transform headers object into table-compatible data structure
    const getHeadersData = () => {
        if (!headers) return [];

        return Object.entries(headers || {}).map(([key, value], index) => ({
            key: index,
            name: key,
            value: value
        }));
    };

    // Define table columns with proper formatting and responsive widths
    const headersColumns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            width: '40%',
            render: (text) => <Text strong style={{ fontSize: 12 }}>{text}</Text>
        },
        {
            title: 'Value',
            dataIndex: 'value',
            key: 'value',
            width: '60%',
            render: (text) => <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{text}</Text>
        }
    ];

    return (
        <div className="response-headers">
            {headers && Object.keys(headers || {}).length > 0 ? (
                <Table
                    columns={headersColumns}
                    dataSource={getHeadersData()}
                    pagination={false}
                    size="small"
                    className={className}
                    style={{ fontSize: 12 }}
                />
            ) : (
                <div className="no-headers" style={{
                    padding: '20px 0',
                    textAlign: 'center',
                    color: token?.colorTextSecondary || '#999',
                    fontStyle: 'italic',
                    fontSize: 12
                }}>
                    No headers available
                </div>
            )}
        </div>
    );
}