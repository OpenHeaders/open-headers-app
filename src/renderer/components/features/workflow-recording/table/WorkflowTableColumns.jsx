/**
 * Table column definitions for WorkflowsTable
 * Configures columns for displaying workflow recording data with actions
 */

import React, { useState, useEffect } from 'react';
import { Button, Space, Popconfirm, Tag, Tooltip, Progress, Spin, Input } from 'antd';
import { 
  PlayCircleOutlined, 
  DeleteOutlined, 
  ShareAltOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  FileOutlined,
  VideoCameraOutlined,
  LoadingOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined
} from '@ant-design/icons';

import { 
  formatFileSize, 
  formatDuration, 
  formatTimestamp,
  formatTimeAgo 
} from '../../../../utils';

/**
 * Component that displays timestamp with live updating relative time
 */
const TimestampCell = ({ timestamp }) => {
  const [relativeTime, setRelativeTime] = useState(formatTimeAgo(timestamp));

  useEffect(() => {
    // Update immediately
    setRelativeTime(formatTimeAgo(timestamp));

    // Update every second
    const interval = setInterval(() => {
      setRelativeTime(formatTimeAgo(timestamp));
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

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
 * Editable cell component for inline editing
 */
const EditableCell = ({ value, onSave, placeholder, maxLength = 100, displayMaxLength, isTag = false }) => {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  const handleSave = () => {
    onSave(inputValue || null);
    setEditing(false);
  };

  const handleCancel = () => {
    setInputValue(value || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <Space>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSave}
          maxLength={maxLength}
          placeholder={placeholder}
          style={{ width: 150 }}
          autoFocus
        />
        <Button
          icon={<CheckOutlined />}
          size="small"
          type="text"
          onClick={handleSave}
        />
        <Button
          icon={<CloseOutlined />}
          size="small"
          type="text"
          onClick={handleCancel}
        />
      </Space>
    );
  }

  // Truncate display value if displayMaxLength is provided
  const displayValue = displayMaxLength && value && value.length > displayMaxLength
    ? `${value.substring(0, displayMaxLength)}...`
    : value;

  return (
    <Space>
      {value ? (
        isTag ? (
          <Tooltip title={displayMaxLength && value.length > displayMaxLength ? value : undefined}>
            <Tag color="blue" style={{ margin: 0 }}>{displayValue}</Tag>
          </Tooltip>
        ) : (
          <Tooltip title={displayMaxLength && value.length > displayMaxLength ? value : undefined}>
            <span style={{ whiteSpace: 'nowrap' }}>{displayValue}</span>
          </Tooltip>
        )
      ) : (
        <span style={{ color: '#999' }}>-</span>
      )}
      <Button
        icon={<EditOutlined />}
        size="small"
        type="text"
        onClick={() => setEditing(true)}
      />
    </Space>
  );
};

/**
 * Component for Delete button with controlled tooltip
 */
const DeleteActionButton = ({ record, onDelete, isProcessing }) => {
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
        title={isProcessing ? "Recording is being processed..." : "Delete workflow recording"}
        open={tooltipOpen}
        onOpenChange={setTooltipOpen}
      >
        <Button
          danger
          size="small"
          icon={<DeleteOutlined />}
          disabled={isProcessing}
        />
      </Tooltip>
    </Popconfirm>
  );
};

/**
 * Creates table columns configuration for workflow recordings
 * @param {Function} onView - Callback for viewing a record
 * @param {Function} onDelete - Callback for deleting a record
 * @param {Function} onExport - Callback for exporting a record
 * @param {Function} onUpdateMetadata - Callback for updating record metadata
 * @param {Object} processingRecords - Map of recordId to processing state
 * @returns {Array} Table columns configuration
 */
export const createWorkflowColumns = (onView, onDelete, onExport, onUpdateMetadata, processingRecords = {}) => [
  {
    title: 'Timestamp',
    dataIndex: 'timestamp',
    key: 'timestamp',
    render: (timestamp) => <TimestampCell timestamp={timestamp} />,
    sorter: (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    defaultSortOrder: 'ascend',
    width: 200
  },
  {
    title: 'URL',
    dataIndex: 'url',
    key: 'url',
    render: (url, record) => {
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
            <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {truncatedUrl}
            </span>
          </Space>
        </Tooltip>
      );
    },
    ellipsis: true
  },
  {
    title: 'Type',
    key: 'type',
    render: (_, record) => (
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
    width: 140
  },
  {
    title: 'Duration',
    dataIndex: 'duration',
    key: 'duration',
    render: (duration) => formatDuration(duration),
    width: 100
  },
  {
    title: 'Tag',
    dataIndex: 'tag',
    key: 'tag',
    render: (tag, record) => {
      // Parse tag data - always object with name/url
      const getTagData = (tag) => {
        if (!tag) return { name: '', url: '' };
        return { name: tag.name || '', url: tag.url || '' };
      };
      
      const tagData = getTagData(tag);
      const displayName = tagData.name && tagData.name.length > 15 
        ? `${tagData.name.substring(0, 15)}...` 
        : tagData.name;
      
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
                <Tag color="blue" style={{ margin: 0 }}>{displayName}</Tag>
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
              onClick={() => onUpdateMetadata(record.id, { 
                _action: 'editTag',
                currentTag: tag,
                recordUrl: record.url
              })}
            />
          </Tooltip>
        </Space>
      );
    },
    width: 120
  },
  {
    title: 'Description',
    dataIndex: 'description',
    key: 'description',
    render: (description, record) => {
      // Truncate display value
      const displayValue = description && description.length > 15
        ? `${description.substring(0, 15)}...`
        : description;
      
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
                onClick={() => onUpdateMetadata(record.id, { 
                  _action: 'viewDescription',
                  currentDescription: description,
                  recordUrl: record.url,
                  recordTag: record.tag
                })}
              />
            </Tooltip>
          )}
          <Tooltip title="Edit description">
            <Button
              icon={<EditOutlined />}
              size="small"
              type="text"
              onClick={() => onUpdateMetadata(record.id, { 
                _action: 'editDescription',
                currentDescription: description,
                recordUrl: record.url,
                recordTag: record.tag
              })}
            />
          </Tooltip>
        </Space>
      );
    },
    width: 120
  },
  {
    title: 'Size',
    dataIndex: 'size',
    key: 'size',
    render: (size) => formatFileSize(size),
    width: 100
  },
  {
    title: 'Events',
    dataIndex: 'eventCount',
    key: 'eventCount',
    render: (count) => (
      <Tag>
        {count?.toLocaleString() || 0} events
      </Tag>
    ),
    width: 120
  },
  {
    title: 'Source',
    dataIndex: 'source',
    key: 'source',
    render: (source) => (
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
    width: 120
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (_, record) => {
      const isProcessing = !!processingRecords[record.id];
      
      return (
        <Space size="small">
          <Tooltip title={isProcessing ? "Recording is being processed..." : "View workflow recording"}>
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
          <Tooltip title={isProcessing ? "Recording is being processed..." : "Export recording file"}>
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              onClick={() => onExport(record)}
              disabled={isProcessing}
            >
              Share
            </Button>
          </Tooltip>
          <DeleteActionButton 
            record={record}
            onDelete={onDelete}
            isProcessing={isProcessing}
          />
        </Space>
      );
    },
    width: 140,
    fixed: 'right'
  }
];