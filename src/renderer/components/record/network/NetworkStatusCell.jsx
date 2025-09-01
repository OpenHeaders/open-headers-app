/**
 * NetworkStatusCell Component
 * 
 * Renders the status code cell with appropriate coloring based on HTTP status
 * Handles error states and pending requests
 * 
 * @param {Object} props - Component props
 * @param {number} props.status - HTTP status code
 * @param {Object} props.record - The full network record
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

const NetworkStatusCell = ({ status, record, token }) => {
    // Handle error states
    if (record.error) {
        return (
            <Text style={{ color: token.colorError, fontSize: '12px' }}>
                Failed
            </Text>
        );
    }

    // Determine color based on status code
    const getStatusColor = (statusCode) => {
        if (statusCode >= 200 && statusCode < 300) return token.colorSuccess;
        if (statusCode >= 300 && statusCode < 400) return token.colorWarning;
        if (statusCode >= 400) return token.colorError;
        return token.colorTextTertiary; // Pending or unknown
    };

    return (
        <Text style={{ color: getStatusColor(status), fontSize: '12px' }}>
            {status || 'Pending'}
        </Text>
    );
};

export default NetworkStatusCell;