/**
 * PlayerMetadata Component
 *
 * Displays recording metadata in a tooltip
 * Shows URL, duration, start time, events count, and viewport dimensions
 *
 * @param {Object} props - Component props
 * @param {Object} props.record - The recording data
 * @param {boolean} props.hasVideo - Whether the recording has video
 */

import { InfoCircleOutlined } from '@ant-design/icons';
import { Space, Tooltip, Typography } from 'antd';
import React from 'react';
import type { Recording } from '../../../../../types/recording';
import { format24HTimeWithMs, formatDuration } from '../../../../utils';

const { Text } = Typography;

interface PlayerMetadataProps {
  record: Recording | null;
  hasVideo: boolean;
}
const PlayerMetadata = ({ record, hasVideo }: PlayerMetadataProps) => {
  if (!record || hasVideo) return null;

  const startTime = new Date(record.metadata?.startTime || record.metadata?.timestamp || Date.now());
  const formattedStartTime = format24HTimeWithMs(startTime);

  return (
    <div style={{ marginBottom: '8px' }}>
      <Tooltip
        title={
          <div>
            <div>
              <strong>URL:</strong> {record.metadata?.url || 'Unknown'}
            </div>
            <div>
              <strong>Duration:</strong> {formatDuration(record.metadata?.duration || 0)}
            </div>
            <div>
              <strong>Started:</strong> {formattedStartTime.date} {formattedStartTime.time}
              <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedStartTime.ms}</span>
            </div>
            <div>
              <strong>Events:</strong> {record.events?.length || 0}
            </div>
            {record.metadata?.viewport && (
              <div>
                <strong>Viewport:</strong> {record.metadata.viewport.width} × {record.metadata.viewport.height}
              </div>
            )}
          </div>
        }
        placement="top"
      >
        <Space style={{ cursor: 'pointer' }}>
          <InfoCircleOutlined />
          <Text strong>Metadata</Text>
        </Space>
      </Tooltip>
    </div>
  );
};

export default PlayerMetadata;
