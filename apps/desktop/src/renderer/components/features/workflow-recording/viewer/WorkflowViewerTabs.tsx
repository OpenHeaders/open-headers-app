/**
 * Tabs component for workflow viewer
 * Renders Console, Network, Storage, and Info tabs
 */

import type { Recording } from '@openheaders/core';
import { Tabs } from 'antd';
import { RecordConsoleTab, RecordInfoTab, RecordNetworkTab, RecordStorageTab } from '@/renderer/components/record';
import WorkflowViewerControls from './WorkflowViewerControls';
import { DEFAULT_TAB_STYLES, TAB_KEYS } from './WorkflowViewerTypes';

interface WorkflowViewerTabsProps {
  record: Recording;
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
  onTabChange,
}: WorkflowViewerTabsProps) => {
  const tabItems = [
    {
      key: TAB_KEYS.CONSOLE,
      label: 'Console',
      children: (
        <div className="console-tab">
          <RecordConsoleTab record={record} viewMode={viewMode} activeTime={activeTime} autoHighlight={autoHighlight} />
        </div>
      ),
    },
    {
      key: TAB_KEYS.NETWORK,
      label: 'Network',
      children: (
        <div className="network-tab">
          <RecordNetworkTab record={record} viewMode={viewMode} activeTime={activeTime} autoHighlight={autoHighlight} />
        </div>
      ),
    },
    {
      key: TAB_KEYS.STORAGE,
      label: 'Storage',
      children: (
        <div className="storage-tab">
          <RecordStorageTab record={record} viewMode={viewMode} activeTime={activeTime} autoHighlight={autoHighlight} />
        </div>
      ),
    },
    {
      key: TAB_KEYS.INFO,
      label: 'Info',
      children: (
        <div className="info-tab">
          <RecordInfoTab record={record} />
        </div>
      ),
    },
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
