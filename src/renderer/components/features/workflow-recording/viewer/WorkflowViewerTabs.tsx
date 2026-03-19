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
import type { RecordData } from '../../../record/player/hooks/usePlayerManager';

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
interface WorkflowViewerTabsProps {
    record: RecordData;
    viewMode: string;
    activeTime: number;
    autoHighlight: boolean;
    autoScroll: boolean;
    onAutoHighlightChange: (value: boolean) => void;
    onAutoScrollChange: (value: boolean) => void;
    onTabChange: (key: string) => void;
}

const WorkflowViewerTabs = ({
                              record,
                              viewMode,
                              activeTime,
                              autoHighlight,
                              autoScroll,
                              onAutoHighlightChange,
                              onAutoScrollChange,
                              onTabChange
                            }: WorkflowViewerTabsProps) => {
  const tabItems = [
    {
      key: TAB_KEYS.CONSOLE,
      label: 'Console',
      children: (
          <div className="console-tab">
            <RecordConsoleTab
                record={record as unknown as Parameters<typeof RecordConsoleTab>[0]['record']}
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
                record={record as unknown as Parameters<typeof RecordNetworkTab>[0]['record']}
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
                record={record as unknown as Parameters<typeof RecordStorageTab>[0]['record']}
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
            <RecordInfoTab record={record as unknown as Parameters<typeof RecordInfoTab>[0]['record']} />
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