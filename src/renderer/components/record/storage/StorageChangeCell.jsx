/**
 * StorageChangeCell Component
 * 
 * Renders storage value changes with old -> new value display
 * Includes action buttons for copy and view details
 * 
 * @param {Object} props - Component props
 * @param {Object} props.record - Storage record
 * @param {Function} props.onViewDetails - Handler for view details action
 * @param {Function} props.messageApi - Ant Design message API
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Typography, Button, Tooltip } from 'antd';
import { CopyOutlined, EyeOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { formatValue } from './StorageUtils';

const { Text } = Typography;

const StorageChangeCell = ({ record, onViewDetails, messageApi, token }) => {
    const oldDisplay = formatValue(record.oldValue);
    const newDisplay = formatValue(record.value);
    
    const handleCopyValue = async () => {
        const textToCopy = record.action === 'remove' ? '' : formatValue(record.value);
        try {
            await navigator.clipboard.writeText(textToCopy);
            messageApi.success('Copied to clipboard');
        } catch (error) {
            messageApi.error('Failed to copy to clipboard');
        }
    };
    
    if (record.action === 'clear') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                <Text style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                    Cleared all entries
                </Text>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <Tooltip title="Copy new value">
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={handleCopyValue}
                            style={{ minWidth: 'auto', padding: '0 4px' }}
                        />
                    </Tooltip>
                    <Tooltip title="View details">
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => onViewDetails(record)}
                            style={{ minWidth: 'auto', padding: '0 4px' }}
                        />
                    </Tooltip>
                </div>
            </div>
        );
    }
    
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            {/* Old value */}
            <Text
                code
                style={{
                    fontSize: '11px',
                    maxWidth: '250px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
                title={oldDisplay}
            >
                {!record.oldValue || oldDisplay === '' ? 
                 <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<new>'}</span> : 
                 (oldDisplay.length > 50 ? oldDisplay.substring(0, 50) + '...' : oldDisplay)}
            </Text>
            
            {/* Arrow */}
            <ArrowRightOutlined style={{ fontSize: '10px', opacity: 0.5 }} />
            
            {/* New value */}
            <Text
                code
                style={{
                    fontSize: '11px',
                    maxWidth: '250px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: record.action === 'set' ? token.colorSuccess : token.colorTextSecondary
                }}
                title={newDisplay}
            >
                {record.action === 'remove' ? 
                 <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<removed>'}</span> : 
                 (newDisplay.length > 50 ? newDisplay.substring(0, 50) + '...' : newDisplay)}
            </Text>
            
            {/* Action buttons */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px', flexShrink: 0 }}>
                <Tooltip title="Copy new value">
                    <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={handleCopyValue}
                        style={{ minWidth: 'auto', padding: '0 4px' }}
                    />
                </Tooltip>
                <Tooltip title="View details">
                    <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => onViewDetails(record)}
                        style={{ minWidth: 'auto', padding: '0 4px' }}
                    />
                </Tooltip>
            </div>
        </div>
    );
};

export default StorageChangeCell;