/**
 * StorageActionCell Component
 *
 * Renders storage action with appropriate color and tooltip
 * Shows cleared count for clear actions
 *
 *  props - Component props
 *  props.action - Storage action ('set', 'remove', 'clear')
 *  props.record - Storage record with metadata
 */

import type { StorageRecord } from '@openheaders/core';
import { Tag, Tooltip } from 'antd';
import { getActionColor, getActionTooltip } from './StorageUtils';

interface StorageActionCellProps {
  action: string;
  record: StorageRecord;
}

const StorageActionCell = ({ action, record }: StorageActionCellProps) => {
  const tooltip = getActionTooltip(action);

  return (
    <Tooltip title={tooltip}>
      <Tag color={getActionColor(action)} style={{ fontSize: '11px' }}>
        {action.toUpperCase()}
        {action === 'clear' && record.metadata?.clearedCount ? ` (${record.metadata.clearedCount})` : ''}
      </Tag>
    </Tooltip>
  );
};

export default StorageActionCell;
