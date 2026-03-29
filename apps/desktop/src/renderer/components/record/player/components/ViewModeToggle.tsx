/**
 * ViewModeToggle Component
 *
 * Provides a segmented control to switch between DOM playback and video modes
 * Only visible when the recording has video available
 *
 * @param {Object} props - Component props
 * @param {string} props.viewMode - Current view mode ('dom' or 'video')
 * @param {Function} props.onViewModeChange - Handler for view mode changes
 * @param {boolean} props.hasVideo - Whether the recording has video
 */

import { FileOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Segmented, Tooltip } from 'antd';
import React from 'react';

interface ViewModeToggleProps {
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  hasVideo: boolean;
}

const ViewModeToggle = ({ viewMode, onViewModeChange, hasVideo }: ViewModeToggleProps) => {
  const videoOption = {
    label: 'Video',
    value: 'video',
    icon: <VideoCameraOutlined />,
    disabled: !hasVideo,
  };

  const segmentedControl = (
    <Segmented
      value={viewMode}
      onChange={onViewModeChange}
      size={'middle' as const}
      options={[
        {
          label: 'Session',
          value: 'dom',
          icon: <FileOutlined />,
        },
        videoOption,
      ]}
    />
  );

  if (!hasVideo) {
    return (
      <Tooltip title="Video missing for this recording. Enable in settings for future workflow recordings.">
        {segmentedControl}
      </Tooltip>
    );
  }

  return segmentedControl;
};

export default ViewModeToggle;
