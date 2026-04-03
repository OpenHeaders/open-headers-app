import {
  ApiOutlined,
  ClusterOutlined,
  NodeExpandOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { Recording, Source } from '@openheaders/core';
import { Alert, Tabs } from 'antd';
import { RecordViewerSkeleton, SourceListSkeleton } from '@/renderer/components/common/skeletons/WorkspaceSkeleton';
import Environments from '@/renderer/components/features/environments';
import { WorkflowDetails, WorkflowRecording } from '@/renderer/components/features/workflow-recording';
import Workspaces from '@/renderer/components/features/workspaces';
import Rules from '@/renderer/components/rules/Rules';
import ServerConfig from '@/renderer/components/server-config/ServerConfig';
import SourceForm from '@/renderer/components/sources/SourceForm';
import SourceTable from '@/renderer/components/sources/SourceTable';
import type { NewSourceData } from '@/renderer/components/sources/source-form';

interface AppTabsProps {
  isReady: boolean;
  activeTab: string;
  onTabChange: (key: string) => void;
  tabScrollPositions: Record<string, number>;
  onTabScrollPositionChange: (tab: string, position: number) => void;
  currentRecord: Recording | null;
  recordPlaybackTime: number;
  autoHighlight: boolean;
  onRecordChange: (record: Recording | null) => void;
  onPlaybackTimeChange: (time: number) => void;
  onAutoHighlightChange: (enabled: boolean) => void;
  sources: Source[];
  onAddSource: (sourceData: NewSourceData) => Promise<boolean>;
  onRemoveSource: (sourceId: string) => Promise<boolean>;
  onRefreshSource: (sourceId: string) => Promise<boolean>;
  onUpdateSource: (sourceId: string, data: Partial<Source>) => Promise<Source | null>;
  tutorialMode: boolean;
}

export function AppTabs({
  isReady,
  activeTab,
  onTabChange,
  tabScrollPositions,
  onTabScrollPositionChange,
  currentRecord,
  recordPlaybackTime,
  autoHighlight,
  onRecordChange,
  onPlaybackTimeChange,
  onAutoHighlightChange,
  sources,
  onAddSource,
  onRemoveSource,
  onRefreshSource,
  onUpdateSource,
  tutorialMode,
}: AppTabsProps) {
  const handleTabChange = (key: string) => {
    const currentContainer = document.querySelector('.ant-tabs-tabpane-active .content-container');
    if (currentContainer) {
      onTabScrollPositionChange(activeTab, currentContainer.scrollTop);
    }

    // If switching to Workflows tab while viewing a record, reset the view
    if (key === 'record-viewer' && currentRecord) {
      onRecordChange(null);
    }

    onTabChange(key);
    setTimeout(() => {
      const newContainer = document.querySelector('.ant-tabs-tabpane-active .content-container');
      if (newContainer) {
        newContainer.scrollTop = tabScrollPositions[key] || 0;
      }
    }, 0);
  };

  // Handle clicking on already active workflows tab
  const handleWorkflowsTabClick = () => {
    if (activeTab === 'record-viewer' && currentRecord) {
      onRecordChange(null);
    }
  };

  const items = [
    {
      key: 'record-viewer',
      label: (
        <span
          role="button"
          tabIndex={0}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={handleWorkflowsTabClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleWorkflowsTabClick();
          }}
        >
          <PlayCircleOutlined />
          Workflows
        </span>
      ),
      children: (
        <div className="content-container">
          {isReady ? (
            <WorkflowRecording
              record={currentRecord}
              onRecordChange={(newRecord: Recording | null) => {
                onRecordChange(newRecord);
                onPlaybackTimeChange(0);
              }}
              onPlaybackTimeChange={onPlaybackTimeChange}
              autoHighlight={autoHighlight}
              renderDetails={(showDetails: boolean) =>
                showDetails && currentRecord ? (
                  <WorkflowDetails
                    record={currentRecord}
                    playbackTime={recordPlaybackTime}
                    autoHighlight={autoHighlight}
                    onAutoHighlightChange={onAutoHighlightChange}
                  />
                ) : null
              }
            />
          ) : (
            <RecordViewerSkeleton />
          )}
        </div>
      ),
    },
    {
      key: 'rules',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NodeExpandOutlined />
          Rules
        </span>
      ),
      children: <div className="content-container">{isReady ? <Rules /> : null}</div>,
    },
    {
      key: 'sources',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ApiOutlined />
          Sources
        </span>
      ),
      children: (
        <div className="content-container">
          {isReady ? (
            <>
              {tutorialMode && (
                <Alert
                  title="Dynamic Values for Header Rules"
                  description={
                    <div>
                      <div>Sources provide dynamic values that can be used in header rules.</div>
                      <div style={{ marginTop: 8 }}>
                        Create HTTP sources to fetch values from APIs, file sources to read from local files, or
                        environment variable sources.
                      </div>
                      <div style={{ marginTop: 8 }}>
                        These values are automatically refreshed and synced with the browser extension, allowing headers
                        to have dynamic content that updates in real-time.
                      </div>
                    </div>
                  }
                  type="info"
                  showIcon
                  closable
                  style={{ marginBottom: 16, marginTop: 16 }}
                />
              )}
              <SourceForm onAddSource={onAddSource} />
              <SourceTable
                sources={sources}
                onRemoveSource={onRemoveSource}
                onRefreshSource={onRefreshSource}
                onUpdateSource={onUpdateSource}
              />
            </>
          ) : (
            <SourceListSkeleton />
          )}
        </div>
      ),
    },
    {
      key: 'environments',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClusterOutlined />
          Environments
        </span>
      ),
      children: <div className="content-container">{isReady ? <Environments /> : null}</div>,
    },
    {
      key: 'workspaces',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TeamOutlined />
          Workspaces
        </span>
      ),
      children: <div className="content-container">{isReady ? <Workspaces /> : null}</div>,
    },
    {
      key: 'server-config',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SettingOutlined />
          Server Config
        </span>
      ),
      children: (
        <div className="content-container">{isReady ? <ServerConfig activeParentTab={activeTab} /> : null}</div>
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={handleTabChange}
      className="app-tabs"
      type="card"
      style={{ height: '100%' }}
      items={items}
    />
  );
}
