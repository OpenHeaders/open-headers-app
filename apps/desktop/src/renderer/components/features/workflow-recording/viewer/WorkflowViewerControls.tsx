/**
 * Controls component for workflow viewer
 * Provides auto-highlight and auto-scroll toggle switches
 */

import { Space, Switch, Tooltip, Typography } from 'antd';
import React from 'react';

const { Text } = Typography;

/**
 * WorkflowViewerControls component
 *  props - Component props
 *  props.autoHighlight - Auto-highlight enabled state
 *  props.autoScroll - Auto-scroll enabled state
 *  props.onAutoHighlightChange - Auto-highlight change handler
 *  props.onAutoScrollChange - Auto-scroll change handler
 *  Rendered controls
 */
interface WorkflowViewerControlsProps {
  autoHighlight: boolean;
  autoScroll: boolean;
  onAutoHighlightChange: (value: boolean) => void;
  onAutoScrollChange: (value: boolean) => void;
}

const WorkflowViewerControls = ({
  autoHighlight,
  autoScroll,
  onAutoHighlightChange,
  onAutoScrollChange,
}: WorkflowViewerControlsProps) => {
  return (
    <Space style={{ marginRight: '16px' }}>
      <Tooltip title="Highlight table entries based on current record timestamp">
        <Space size="small">
          <Switch checked={autoHighlight} onChange={onAutoHighlightChange} size="small" />
          <Text style={{ fontSize: '12px', marginLeft: '4px' }}>Auto Highlight</Text>
        </Space>
      </Tooltip>

      <Tooltip
        title={
          !autoHighlight
            ? 'Auto Scroll is disabled when Auto Highlight is off'
            : 'Synchronize table view based on current record timestamp'
        }
      >
        <Space size="small">
          <Switch checked={autoScroll} onChange={onAutoScrollChange} disabled={!autoHighlight} size="small" />
          <Text
            style={{
              fontSize: '12px',
              opacity: !autoHighlight ? 0.5 : 1,
              marginLeft: '4px',
            }}
          >
            Auto Scroll
          </Text>
        </Space>
      </Tooltip>
    </Space>
  );
};

export default WorkflowViewerControls;
