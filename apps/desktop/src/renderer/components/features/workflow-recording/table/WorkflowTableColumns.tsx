/**
 * Table column definitions for WorkflowsTable
 * Configures columns for displaying workflow recording data with actions
 */

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  ShareAltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { PreprocessProgressDetails, WorkflowRecordingEntry } from '@openheaders/core';
import { Button, Popconfirm, Space, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { formatDuration, formatFileSize, formatTimeAgo, formatTimestamp } from '@/renderer/utils';

/**
 * Component that displays timestamp with live updating relative time
 */
const TimestampCell = ({ timestamp }: { timestamp: string | number }) => {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const [relativeTime, setRelativeTime] = useState(formatTimeAgo(ts));

  useEffect(() => {
    // Update immediately
    setRelativeTime(formatTimeAgo(ts));

    // Update every second
    const interval = setInterval(() => {
      setRelativeTime(formatTimeAgo(ts));
    }, 1000);

    return () => clearInterval(interval);
  }, [ts]);

  return (
    <Tooltip title={relativeTime}>
      <Space>
        <ClockCircleOutlined />
        {formatTimestamp(timestamp)}
      </Space>
    </Tooltip>
  );
};

/**
 * Component for Delete button with controlled tooltip
 */
export type WorkflowRecord = WorkflowRecordingEntry;

const DeleteActionButton = ({
  record,
  onDelete,
  isProcessing,
}: {
  record: WorkflowRecord;
  onDelete: (id: string) => void;
  isProcessing: boolean;
}) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <Popconfirm
      title="Delete Workflow"
      description="Are you sure you want to delete this workflow recording?"
      onConfirm={() => onDelete(record.id)}
      okText="Delete"
      cancelText="Cancel"
      disabled={isProcessing}
      onOpenChange={(open) => {
        if (open) {
          setTooltipOpen(false);
        }
      }}
    >
      <Tooltip
        title={isProcessing ? 'Recording is being processed...' : 'Delete workflow recording'}
        open={tooltipOpen}
        onOpenChange={setTooltipOpen}
      >
        <Button danger size="small" icon={<DeleteOutlined />} disabled={isProcessing} />
      </Tooltip>
    </Popconfirm>
  );
};

/**
 * Creates table columns configuration for workflow recordings
 *  onView - Callback for viewing a record
 *  onDelete - Callback for deleting a record
 *  onExport - Callback for exporting a record
 *  onUpdateMetadata - Callback for updating record metadata
 *  processingRecords - Map of recordId to processing state
 *  Table columns configuration
 */
interface MetadataAction {
  _action: string;
  currentTag?: WorkflowRecordingEntry['tag'] | string | null;
  recordUrl?: string;
  currentDescription?: string;
  recordTag?: WorkflowRecordingEntry['tag'];
}

export const createWorkflowColumns = (
  onView: (record: WorkflowRecordingEntry) => void,
  onDelete: (id: string) => void,
  onExport: (record: WorkflowRecordingEntry) => void,
  onUpdateMetadata: (id: string, data: MetadataAction) => void,
  processingRecords: Record<string, { stage?: string; progress?: number; details?: PreprocessProgressDetails }> = {},
): ColumnsType<WorkflowRecordingEntry> => [
  {
    title: 'Timestamp',
    dataIndex: 'timestamp',
    key: 'timestamp',
    render: (timestamp: string) => <TimestampCell timestamp={timestamp} />,
    sorter: (a: WorkflowRecord, b: WorkflowRecord) =>
      new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime(),
    defaultSortOrder: 'ascend' as const,
    width: 200,
  },
  {
    title: 'URL',
    dataIndex: 'url',
    key: 'url',
    render: (url: string, record: WorkflowRecord) => {
      const displayUrl = url || record.metadata?.url || record.metadata?.initialUrl || 'Unknown';
      let truncatedUrl = displayUrl;

      // If URL is longer than 43 characters (20 + 3 for "..." + 20), truncate it
      if (displayUrl.length > 43) {
        truncatedUrl = `${displayUrl.substring(0, 20)}...${displayUrl.substring(displayUrl.length - 20)}`;
      }

      return (
        <Tooltip title={displayUrl}>
          <Space>
            <GlobalOutlined />
            <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncatedUrl}</span>
          </Space>
        </Tooltip>
      );
    },
    ellipsis: true,
  },
  {
    title: 'Type',
    key: 'type',
    render: (_: unknown, record: WorkflowRecord) => (
      <Space size="small">
        <Tooltip title="Page recording with console logs, network activity, storage changes, DOM events, and other metadata">
          <Tag>
            <FileOutlined /> Session
          </Tag>
        </Tooltip>
        {record.hasVideo && (
          <Tooltip title="Browser video recording (MP4/WebM) for easy sharing">
            <Tag>
              <VideoCameraOutlined /> Video
            </Tag>
          </Tooltip>
        )}
      </Space>
    ),
    width: 140,
  },
  {
    title: 'Duration',
    dataIndex: 'duration',
    key: 'duration',
    render: (duration: number) => formatDuration(duration),
    width: 100,
  },
  {
    title: 'Tag',
    dataIndex: 'tag',
    key: 'tag',
    render: (tag: { name?: string; url?: string } | null, record: WorkflowRecord) => {
      // Parse tag data - always object with name/url
      const getTagData = (tag: { name?: string; url?: string } | null) => {
        if (!tag) return { name: '', url: '' };
        return { name: tag.name || '', url: tag.url || '' };
      };

      const tagData = getTagData(tag);
      const displayName =
        tagData.name && tagData.name.length > 15 ? `${tagData.name.substring(0, 15)}...` : tagData.name;

      return (
        <Space>
          {tagData.name ? (
            tagData.url ? (
              <Tooltip title={`${tagData.name}${tagData.name.length > 15 ? '' : ' (Click to open)'}`}>
                <a href={tagData.url} target="_blank" rel="noopener noreferrer">
                  <Tag color="blue" style={{ margin: 0, cursor: 'pointer' }}>
                    {displayName}
                  </Tag>
                </a>
              </Tooltip>
            ) : (
              <Tooltip title={tagData.name.length > 15 ? tagData.name : undefined}>
                <Tag color="blue" style={{ margin: 0 }}>
                  {displayName}
                </Tag>
              </Tooltip>
            )
          ) : (
            <span style={{ color: '#999' }}>-</span>
          )}
          <Tooltip title="Edit tag">
            <Button
              icon={<EditOutlined />}
              size="small"
              type="text"
              onClick={() =>
                onUpdateMetadata(record.id, {
                  _action: 'editTag',
                  currentTag: tag,
                  recordUrl: record.url,
                })
              }
            />
          </Tooltip>
        </Space>
      );
    },
    width: 120,
  },
  {
    title: 'Description',
    dataIndex: 'description',
    key: 'description',
    render: (description: string, record: WorkflowRecord) => {
      // Truncate display value
      const displayValue = description && description.length > 15 ? `${description.substring(0, 15)}...` : description;

      return (
        <Space>
          {description ? (
            <Tooltip title={description.length > 15 ? description : undefined}>
              <span style={{ whiteSpace: 'nowrap' }}>{displayValue}</span>
            </Tooltip>
          ) : (
            <span style={{ color: '#999' }}>-</span>
          )}
          {description && (
            <Tooltip title="View full description">
              <Button
                icon={<EyeOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  onUpdateMetadata(record.id, {
                    _action: 'viewDescription',
                    currentDescription: description,
                    recordUrl: record.url,
                    recordTag: record.tag,
                  })
                }
              />
            </Tooltip>
          )}
          <Tooltip title="Edit description">
            <Button
              icon={<EditOutlined />}
              size="small"
              type="text"
              onClick={() =>
                onUpdateMetadata(record.id, {
                  _action: 'editDescription',
                  currentDescription: description,
                  recordUrl: record.url,
                  recordTag: record.tag,
                })
              }
            />
          </Tooltip>
        </Space>
      );
    },
    width: 120,
  },
  {
    title: 'Size',
    dataIndex: 'size',
    key: 'size',
    render: (size: number) => formatFileSize(size),
    width: 100,
  },
  {
    title: 'Events',
    dataIndex: 'eventCount',
    key: 'eventCount',
    render: (count: number) => <Tag>{count?.toLocaleString() || 0} events</Tag>,
    width: 120,
  },
  {
    title: 'Source',
    dataIndex: 'source',
    key: 'source',
    render: (source: string) => (
      <Tag>
        {source === 'extension' ? (
          <>
            <GlobalOutlined /> Browser
          </>
        ) : (
          <>
            <FileOutlined /> Upload
          </>
        )}
      </Tag>
    ),
    width: 120,
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (_: unknown, record: WorkflowRecord) => {
      const isProcessing = !!processingRecords[record.id];

      return (
        <Space size="small">
          <Tooltip title={isProcessing ? 'Recording is being processed...' : 'View workflow recording'}>
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => onView(record)}
              disabled={isProcessing}
            >
              Play
            </Button>
          </Tooltip>
          <Tooltip title={isProcessing ? 'Recording is being processed...' : 'Export recording file'}>
            <Button size="small" icon={<ShareAltOutlined />} onClick={() => onExport(record)} disabled={isProcessing}>
              Share
            </Button>
          </Tooltip>
          <DeleteActionButton record={record} onDelete={onDelete} isProcessing={isProcessing} />
        </Space>
      );
    },
    width: 140,
    fixed: 'right',
  },
];
