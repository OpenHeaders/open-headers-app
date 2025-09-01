/**
 * Tabs component for workflow viewer
 * Renders Console, Network, Storage, and Info tabs
 */

import React from 'react';
import { Tabs } from 'antd';

import {
  RecordConsoleTab,
  RecordNetworkTab,
  RecordStorageTab,
  RecordInfoTab
} from '../../../record';
import WorkflowViewerControls from './WorkflowViewerControls';
import { TAB_KEYS, DEFAULT_TAB_STYLES } from './WorkflowViewerTypes';

/**
 * WorkflowViewerTabs component
 * @param {Object} props - Component props
 * @param {Object} props.record - Workflow record data
 * @param {string} props.viewMode - Current view mode
 * @param {number} props.activeTime - Current playback time
 * @param {boolean} props.autoHighlight - Auto-highlight enabled state
 * @param {boolean} props.autoScroll - Auto-scroll enabled state
 * @param {Function} props.onAutoHighlightChange - Auto-highlight change handler
 * @param {Function} props.onAutoScrollChange - Auto-scroll change handler
 * @param {Function} props.onTabChange - Tab change handler
 * @returns {React.ReactNode} Rendered tabs
 */
const WorkflowViewerTabs = ({
                              record,
                              viewMode,
                              activeTime,
                              autoHighlight,
                              autoScroll,
                              onAutoHighlightChange,
                              onAutoScrollChange,
                              onTabChange
                            }) => {
  const tabItems = [
    {
      key: TAB_KEYS.CONSOLE,
      label: 'Console',
      children: (
          <div className="console-tab">
            <RecordConsoleTab
                record={record}
                viewMode={viewMode}
                activeTime={activeTime}
                autoHighlight={autoHighlight}
            />
          </div>
      )
    },
    {
      key: TAB_KEYS.NETWORK,
      label: 'Network',
      children: (
          <div className="network-tab">
            <RecordNetworkTab
                record={record}
                viewMode={viewMode}
                activeTime={activeTime}
                autoHighlight={autoHighlight}
            />
          </div>
      )
    },
    {
      key: TAB_KEYS.STORAGE,
      label: 'Storage',
      children: (
          <div className="storage-tab">
            <RecordStorageTab
                record={record}
                viewMode={viewMode}
                activeTime={activeTime}
                autoHighlight={autoHighlight}
            />
          </div>
      )
    },
    {
      key: TAB_KEYS.INFO,
      label: 'Info',
      children: (
          <div className="info-tab">
            <RecordInfoTab record={record} />
          </div>
      )
    }
  ];

  return (
      <Tabs
          defaultActiveKey={TAB_KEYS.CONSOLE}
          className="record-viewer-tabs"
          type="card"
          style={DEFAULT_TAB_STYLES}
          onChange={onTabChange}
          tabBarExtraContent={
            <WorkflowViewerControls
                autoHighlight={autoHighlight}
                autoScroll={autoScroll}
                onAutoHighlightChange={onAutoHighlightChange}
                onAutoScrollChange={onAutoScrollChange}
            />
          }
          items={tabItems}
      />
  );
};

export default WorkflowViewerTabs;