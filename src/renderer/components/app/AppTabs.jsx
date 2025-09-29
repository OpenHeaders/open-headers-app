import React from 'react';
import { Tabs, Alert } from 'antd';
import {
    PlayCircleOutlined,
    NodeExpandOutlined,
    ApiOutlined,
    ClusterOutlined,
    TeamOutlined,
    DatabaseOutlined
} from '@ant-design/icons';
import SourceForm from '../sources/SourceForm';
import SourceTable from '../sources/SourceTable';
import { WorkflowRecording, WorkflowDetails } from '../features/workflow-recording';
import ProxyServer from '../proxy/ProxyServer';
import Rules from '../rules/Rules';
import Workspaces from '../features/workspaces';
import Environments from '../features/environments';

export function AppTabs({
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
                            tutorialMode
                        }) {
    const handleTabChange = (key) => {
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
            if (newContainer && tabScrollPositions[key] !== undefined) {
                newContainer.scrollTop = tabScrollPositions[key];
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
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={handleWorkflowsTabClick}
                >
                    <PlayCircleOutlined />
                    Workflows
                </span>
            ),
            children: (
                <div className="content-container">
                    <WorkflowRecording
                        record={currentRecord}
                        onRecordChange={(newRecord) => {
                            onRecordChange(newRecord);
                            onPlaybackTimeChange(0);
                        }}
                        onPlaybackTimeChange={onPlaybackTimeChange}
                        autoHighlight={autoHighlight}
                        renderDetails={(showDetails) =>
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
                </div>
            )
        },
        {
            key: 'rules',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NodeExpandOutlined />
          Rules
        </span>
            ),
            children: (
                <div className="content-container">
                    <Rules />
                </div>
            )
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
                    {tutorialMode !== false && (
                        <Alert
                            message="Dynamic Values for Header Rules"
                            description={
                                <div>
                                    <div>Sources provide dynamic values that can be used in header rules.</div>
                                    <div style={{marginTop: 8}}>
                                        Create HTTP sources to fetch values from APIs, file sources to read from local files, or environment variable sources.
                                    </div>
                                    <div style={{marginTop: 8}}>
                                        These values are automatically refreshed and synced with the browser extension, allowing headers to have dynamic content that updates in real-time.
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
                </div>
            )
        },
        {
            key: 'environments',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClusterOutlined />
          Environments
        </span>
            ),
            children: (
                <div className="content-container">
                    <Environments />
                </div>
            )
        },
        {
            key: 'workspaces',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TeamOutlined />
          Workspaces
        </span>
            ),
            children: (
                <div className="content-container">
                    <Workspaces />
                </div>
            )
        },
        {
            key: 'proxy-server',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DatabaseOutlined />
          Proxy
        </span>
            ),
            children: (
                <div className="content-container">
                    <ProxyServer />
                </div>
            )
        }
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