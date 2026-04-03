import { Card, Skeleton, Space } from 'antd';
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
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      {[1, 2, 3, 4].map((i) => (
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
    </Space>
  </Card>
);

export const RecordViewerSkeleton = () => (
  <Card className="workspace-skeleton record-viewer-skeleton">
    <div className="skeleton-header">
      <Skeleton.Input style={{ width: 180, height: 24 }} active />
      <div className="skeleton-tabs">
        {['Network', 'Console', 'Storage'].map((_tab, i) => (
          <Skeleton.Button key={i} size="small" />
        ))}
      </div>
    </div>
    <div className="skeleton-timeline">
      <Skeleton.Input style={{ width: '100%', height: 8 }} active />
    </div>
    <div className="skeleton-content">
      <div className="skeleton-sidebar">
        {[1, 2, 3, 4, 5].map((i) => (
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
