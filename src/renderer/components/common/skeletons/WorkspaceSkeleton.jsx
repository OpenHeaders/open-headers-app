import React from 'react';
import { Skeleton, Card, Space } from 'antd';
import './WorkspaceSkeleton.less';

/**
 * WorkspaceSkeleton Components - Maintain layout structure during workspace transitions
 * 
 * These components provide smooth skeleton loading states that match the actual
 * component layouts, reducing perceived loading time and maintaining visual continuity.
 */

export const SourceListSkeleton = () => (
    <Card className="workspace-skeleton source-list-skeleton">
        <div className="skeleton-header">
            <Skeleton.Avatar size="small" />
            <Skeleton.Input style={{ width: 200, height: 22 }} active />
            <Skeleton.Button size="small" />
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
            <>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="skeleton-item">
                        <Skeleton.Avatar size="default" />
                        <div className="skeleton-content">
                            <Skeleton.Input style={{ width: '60%', height: 16 }} active />
                            <Skeleton.Input style={{ width: '40%', height: 14 }} active />
                        </div>
                        <div className="skeleton-actions">
                            <Skeleton.Button size="small" />
                            <Skeleton.Button size="small" />
                        </div>
                    </div>
                ))}
            </>
        </Space>
    </Card>
);

export const ProxyRulesSkeleton = () => (
    <Card className="workspace-skeleton proxy-rules-skeleton">
        <div className="skeleton-header">
            <Skeleton.Input style={{ width: 150, height: 24 }} active />
            <Skeleton.Button size="default" />
        </div>
        <div className="skeleton-table">
            <div className="skeleton-table-header">
                {['Rule Name', 'Domains', 'Header', 'Actions'].map((col, i) => (
                    <Skeleton.Input key={i} style={{ width: '100%', height: 16 }} active />
                ))}
            </div>
            {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-table-row">
                    <Skeleton.Input style={{ width: '80%', height: 14 }} active />
                    <Skeleton.Input style={{ width: '60%', height: 14 }} active />
                    <Skeleton.Input style={{ width: '70%', height: 14 }} active />
                    <div className="skeleton-row-actions">
                        <Skeleton.Button size="small" />
                        <Skeleton.Button size="small" />
                    </div>
                </div>
            ))}
        </div>
    </Card>
);

export const EnvironmentsSkeleton = () => (
    <Card className="workspace-skeleton environments-skeleton">
        <div className="skeleton-header">
            <Skeleton.Input style={{ width: 120, height: 24 }} active />
            <Skeleton.Button size="small" />
        </div>
        <div className="skeleton-env-list">
            {[1, 2].map(i => (
                <div key={i} className="skeleton-env-item">
                    <div className="skeleton-env-header">
                        <Skeleton.Avatar size="small" />
                        <Skeleton.Input style={{ width: 120, height: 18 }} active />
                        <Skeleton.Button size="small" />
                    </div>
                    <div className="skeleton-env-vars">
                        {[1, 2, 3].map(j => (
                            <div key={j} className="skeleton-var-item">
                                <Skeleton.Input style={{ width: '30%', height: 14 }} active />
                                <Skeleton.Input style={{ width: '50%', height: 14 }} active />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </Card>
);

export const RecordViewerSkeleton = () => (
    <Card className="workspace-skeleton record-viewer-skeleton">
        <div className="skeleton-header">
            <Skeleton.Input style={{ width: 180, height: 24 }} active />
            <div className="skeleton-tabs">
                {['Network', 'Console', 'Storage'].map((tab, i) => (
                    <Skeleton.Button key={i} size="small" />
                ))}
            </div>
        </div>
        <div className="skeleton-timeline">
            <Skeleton.Input style={{ width: '100%', height: 8 }} active />
        </div>
        <div className="skeleton-content">
            <div className="skeleton-sidebar">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="skeleton-record-item">
                        <Skeleton.Avatar size="small" />
                        <Skeleton.Input style={{ width: '80%', height: 14 }} active />
                    </div>
                ))}
            </div>
            <div className="skeleton-main-content">
                <Skeleton.Input style={{ width: '100%', height: 200 }} active />
            </div>
        </div>
    </Card>
);


/**
 * Complete workspace skeleton that combines all components
 */
export const CompleteWorkspaceSkeleton = () => (
    <div className="complete-workspace-skeleton">
        <div className="skeleton-layout">
            <div className="skeleton-main-content">
                <RecordViewerSkeleton />
            </div>
            <div className="skeleton-sidebar">
                <SourceListSkeleton />
                <ProxyRulesSkeleton />
                <EnvironmentsSkeleton />
            </div>
        </div>
    </div>
);

