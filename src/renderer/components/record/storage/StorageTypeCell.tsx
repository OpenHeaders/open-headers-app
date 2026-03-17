/**
 * StorageTypeCell Component
 * 
 * Renders storage type with appropriate color and tooltip
 * Shows shortened names for better table display
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - Storage type ('localStorage', 'sessionStorage', 'cookie')
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import { getTypeColor, getTypeTooltip } from './StorageUtils';

const StorageTypeCell = ({ type }) => {
    const tooltip = getTypeTooltip(type);
    
    const getDisplayName = (storageType) => {
        switch (storageType) {
            case 'localStorage': return 'Local';
            case 'sessionStorage': return 'Session';
            case 'cookie': return 'Cookie';
            default: return storageType;
        }
    };
    
    return (
        <Tooltip title={tooltip}>
            <Tag color={getTypeColor(type)} style={{ fontSize: '11px' }}>
                {getDisplayName(type)}
            </Tag>
        </Tooltip>
    );
};

export default StorageTypeCell;