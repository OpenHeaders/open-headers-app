/**
 * StorageTypeCell Component
 *
 * Renders storage type with appropriate color and tooltip
 * Shows shortened names for better table display
 *
 * @param {Object} props - Component props
 * @param {string} props.type - Storage type ('localStorage', 'sessionStorage', 'cookie')
 */

import { Tag, Tooltip } from 'antd';
import React from 'react';
import { getTypeColor, getTypeTooltip } from './StorageUtils';

interface StorageTypeCellProps {
  type: string;
}
const StorageTypeCell = ({ type }: StorageTypeCellProps) => {
  const tooltip = getTypeTooltip(type);

  const getDisplayName = (storageType: string) => {
    switch (storageType) {
      case 'localStorage':
        return 'Local';
      case 'sessionStorage':
        return 'Session';
      case 'cookie':
        return 'Cookie';
      default:
        return storageType;
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
