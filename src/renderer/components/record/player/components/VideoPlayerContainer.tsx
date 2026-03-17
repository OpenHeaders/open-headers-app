/**
 * VideoPlayerContainer Component
 *
 * Container for video playback with loading state
 * Handles video element styling and error handling
 *
 * @param {Object} props - Component props
 * @param {React.RefObject} props.videoRef - Ref for the video element
 * @param {Object} props.token - Ant Design theme token
 * @param {string} props.viewMode - Current view mode
 * @param {boolean} props.videoLoading - Whether video is loading
 * @param {Function} props.onVideoLoaded - Handler for video loaded event
 * @param {Function} props.onVideoError - Handler for video error event
 */

import React from 'react';
import { Spin } from 'antd';

const VideoPlayerContainer = ({
                                  videoRef,
                                  token,
                                  viewMode,
                                  videoLoading,
                                  onVideoLoaded,
                                  onVideoError
                              }) => {
    if (viewMode !== 'video') return null;

    return (
        <div style={{
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
            left: 0
        }}>
            {videoLoading && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'rgba(0, 0, 0, 0.1)',
                    zIndex: 10
                }}>
                    <Spin />
                </div>
            )}
            <video
                ref={videoRef}
                controls
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    background: 'transparent'
                }}
                onLoadedData={onVideoLoaded}
                onError={onVideoError}
            />
        </div>
    );
};

export default VideoPlayerContainer;