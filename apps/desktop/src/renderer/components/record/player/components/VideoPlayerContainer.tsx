/**
 * VideoPlayerContainer Component
 *
 * Container for video playback with loading state
 * Handles video element styling and error handling
 *
 *  props - Component props
 *  props.videoRef - Ref for the video element
 *  props.token - Ant Design theme token
 *  props.viewMode - Current view mode
 *  props.videoLoading - Whether video is loading
 *  props.onVideoLoaded - Handler for video loaded event
 *  props.onVideoError - Handler for video error event
 */

import { Spin } from 'antd';
import type { GlobalToken } from 'antd/es/theme/interface';
import type React from 'react';

interface VideoPlayerContainerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  token: GlobalToken;
  viewMode: string;
  videoLoading: boolean;
  onVideoLoaded: () => void;
  onVideoError: (error?: unknown) => void;
}

const VideoPlayerContainer = ({
  videoRef,
  token,
  viewMode,
  videoLoading,
  onVideoLoaded,
  onVideoError,
}: VideoPlayerContainerProps) => {
  if (viewMode !== 'video') return null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: token.colorBgLayout,
        borderRadius: '6px',
        border: `1px solid ${token.colorBorderSecondary}`,
        overflow: 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      {videoLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.1)',
            zIndex: 10,
          }}
        >
          <Spin />
        </div>
      )}
      {/* biome-ignore lint/a11y/useMediaCaption: screen recording playback — no spoken content to caption */}
      <video
        ref={videoRef}
        controls
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: 'transparent',
        }}
        onLoadedData={onVideoLoaded}
        onError={onVideoError}
      />
    </div>
  );
};

export default VideoPlayerContainer;
