/**
 * NetworkRequestCell Component
 * 
 * Renders the request name cell with appropriate styling and error handling
 * Extracts display name from URL and shows error states
 * 
 * @param {Object} props - Component props
 * @param {string} props.url - The request URL
 * @param {Object} props.record - The full network record
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Typography } from 'antd';
import { getDisplayName } from './utils/urlUtils';

const { Text } = Typography;

const NetworkRequestCell = ({ url, record, token }) => {
    const displayName = getDisplayName(url, 'index');

    return (
        <Text
            style={{
                fontSize: '12px',
                cursor: 'pointer',
                color: record.error ? token.colorError : token.colorLink,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}
            title={url}
        >
            {displayName}
        </Text>
    );
};

export default NetworkRequestCell;