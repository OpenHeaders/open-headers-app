/**
 * Controls component for workflow viewer
 * Provides auto-highlight and auto-scroll toggle switches
 */

import React from 'react';
import { Space, Switch, Typography, Tooltip } from 'antd';

const { Text } = Typography;

/**
 * WorkflowViewerControls component
 * @param {Object} props - Component props
 * @param {boolean} props.autoHighlight - Auto-highlight enabled state
 * @param {boolean} props.autoScroll - Auto-scroll enabled state
 * @param {Function} props.onAutoHighlightChange - Auto-highlight change handler
 * @param {Function} props.onAutoScrollChange - Auto-scroll change handler
 * @returns {React.ReactNode} Rendered controls
 */
const WorkflowViewerControls = ({
  autoHighlight,
  autoScroll,
  onAutoHighlightChange,
  onAutoScrollChange
}) => {
  return (
    <Space style={{ marginRight: '16px' }}>
      <Tooltip title="Highlight table entries based on current record timestamp">
        <Space size="small">
          <Switch
            checked={autoHighlight}
            onChange={onAutoHighlightChange}
            size="small"
          />
          <Text style={{ fontSize: '12px', marginLeft: '4px' }}>
            Auto Highlight
          </Text>
        </Space>
      </Tooltip>
      
      <Tooltip
        title={!autoHighlight ?
          "Auto Scroll is disabled when Auto Highlight is off" :
          "Synchronize table view based on current record timestamp"
        }
      >
        <Space size="small">
          <Switch
            checked={autoScroll}
            onChange={onAutoScrollChange}
            disabled={!autoHighlight}
            size="small"
          />
          <Text style={{ 
            fontSize: '12px', 
            opacity: !autoHighlight ? 0.5 : 1, 
            marginLeft: '4px' 
          }}>
            Auto Scroll
          </Text>
        </Space>
      </Tooltip>
    </Space>
  );
};

export default WorkflowViewerControls;