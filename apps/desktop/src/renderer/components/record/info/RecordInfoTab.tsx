import type { Recording } from '@openheaders/core';
import { Descriptions, Typography } from 'antd';
import { format24HTimeWithMs, formatDuration } from '@/renderer/utils';

const { Text } = Typography;

interface RecordInfoTabProps {
  record: Pick<Recording, 'metadata' | 'events' | 'console' | 'network' | 'storage'>;
}

export const RecordInfoTab = ({ record }: RecordInfoTabProps) => {
  if (!record?.metadata) return null;

  const { metadata } = record;
  const startTime = new Date(metadata.startTime ?? 0);
  const formattedTime = format24HTimeWithMs(startTime);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px' }}>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Workflow ID">{metadata.recordId}</Descriptions.Item>
        <Descriptions.Item label="URL">{metadata.url}</Descriptions.Item>
        <Descriptions.Item label="Duration">{formatDuration(metadata.duration ?? 0)}</Descriptions.Item>
        <Descriptions.Item label="Captured At">
          <span>
            {formattedTime.date} {formattedTime.time}
            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedTime.ms}</span>
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Viewport">
          {metadata.viewport ? `${metadata.viewport.width} × ${metadata.viewport.height}` : 'Unknown'}
        </Descriptions.Item>
        <Descriptions.Item label="User Agent">
          <Text style={{ fontSize: '12px' }}>{metadata.userAgent || 'Unknown'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Total Events">{record.events?.length || 0}</Descriptions.Item>
        <Descriptions.Item label="Console Logs">{record.console?.length || 0}</Descriptions.Item>
        <Descriptions.Item label="Network Requests">{record.network?.length || 0}</Descriptions.Item>
        <Descriptions.Item label="Storage Data">
          {record.storage
            ? Array.isArray(record.storage)
              ? `${record.storage.length} storage events`
              : 'None'
            : 'None'}
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
};

export default RecordInfoTab;
