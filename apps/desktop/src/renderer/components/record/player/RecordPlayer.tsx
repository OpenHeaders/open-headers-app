/**
 * RecordPlayer Component
 *
 * Refactored player component with improved modularity
 * Handles both DOM playback and video playback modes
 *
 * @param {Object} props - Component props
 * @param {Object} props.record - Recording data to play
 * @param {Object} props.rrwebPlayer - rrweb player class
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onPlaybackTimeChange - Playback time change handler
 * @param {Function} props.processRecordForProxy - Record processing function
 * @param {Function} props.createConsoleOverrides - Console override creation function
 * @param {Function} props.onPlayingStateChange - Playing state change handler
 * @param {boolean} props.autoHighlight - Auto-highlight mode
 */

import { InfoCircleOutlined, TableOutlined } from '@ant-design/icons';
import { Button, Space, Spin, Tooltip, Typography, theme } from 'antd';
import { useState } from 'react';
import { format24HTimeWithMs, formatDuration } from '@/renderer/utils';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import DOMPlayerContainer from './components/DOMPlayerContainer';
import VideoPlayerContainer from './components/VideoPlayerContainer';
import ViewModeToggle from './components/ViewModeToggle';
import {
  type ProxyStatus,
  type RecordData,
  type RRWebPlayerConstructor,
  usePlayerManager,
} from './hooks/usePlayerManager';
import { useVideoLoader } from './hooks/useVideoLoader';

const { Text } = Typography;
const _log = createLogger('RecordPlayer');

interface RecordPlayerProps {
  record: RecordData | null;
  rrwebPlayer: RRWebPlayerConstructor | null;
  loading: boolean;
  onPlaybackTimeChange?: (time: number) => void;
  processRecordForProxy?: (record: RecordData, proxyStatus: ProxyStatus) => Promise<RecordData>;
  createConsoleOverrides?: () => () => void;
  onPlayingStateChange?: (playing: boolean) => void;
  autoHighlight?: boolean;
  showAllWorkflowsButton?: boolean;
  onShowAllWorkflows?: () => void;
}

const RecordPlayer = ({
  record,
  rrwebPlayer,
  loading,
  onPlaybackTimeChange,
  processRecordForProxy,
  createConsoleOverrides,
  onPlayingStateChange,
  autoHighlight = false,
  showAllWorkflowsButton = false,
  onShowAllWorkflows,
}: RecordPlayerProps) => {
  const { token } = theme.useToken();
  const [viewMode, setViewMode] = useState('dom');

  // Custom hooks for video and player management
  const { hasVideo, videoLoading, videoRef, handleVideoLoaded, handleVideoError } = useVideoLoader(record, viewMode);

  const { playerContainerRef } = usePlayerManager(
    record,
    rrwebPlayer,
    viewMode,
    autoHighlight,
    processRecordForProxy ?? (async (record: RecordData) => record),
    createConsoleOverrides ?? (() => () => {}),
    onPlaybackTimeChange ?? null,
    onPlayingStateChange ?? null,
  );

  if (!record) return null;

  return (
    <div>
      <Spin spinning={loading && viewMode === 'dom'}>
        <div>
          {/* Navigation */}
          {showAllWorkflowsButton && (
            <div
              style={{
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <Button
                icon={<TableOutlined />}
                onClick={onShowAllWorkflows}
                size={'middle' as const}
                aria-label="View all workflow recordings"
                title="Go back to workflows list"
              >
                ← Back to Workflows
              </Button>
            </div>
          )}

          {/* View Mode Controls with Metadata */}
          <div
            style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Metadata in left corner */}
            <div style={{ position: 'absolute', left: 0 }}>
              {record && !hasVideo && (
                <Tooltip
                  title={
                    <div>
                      <div>
                        <strong>URL:</strong> {(record.metadata?.url as string | undefined) || 'Unknown'}
                      </div>
                      <div>
                        <strong>Duration:</strong>{' '}
                        {formatDuration((record.metadata?.duration as number | undefined) || 0)}
                      </div>
                      <div>
                        <strong>Started:</strong> {(() => {
                          const startTime = new Date(
                            (record.metadata?.startTime ?? record.metadata?.timestamp ?? Date.now()) as string | number,
                          );
                          const formattedStartTime = format24HTimeWithMs(startTime);
                          return (
                            <>
                              {formattedStartTime.date} {formattedStartTime.time}
                              <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedStartTime.ms}</span>
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <strong>Events:</strong> {record.events?.length || 0}
                      </div>
                      {record.metadata?.viewport && (
                        <div>
                          <strong>Viewport:</strong> {record.metadata.viewport.width} ×{' '}
                          {record.metadata.viewport.height}
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
              )}
            </div>

            {/* View Mode toggle centered */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  color: token.colorTextSecondary,
                  fontWeight: 500,
                }}
              >
                View Mode:
              </span>
              <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} hasVideo={hasVideo} />
            </div>
          </div>

          {/* Player Container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '450px',
              borderRadius: token.borderRadius,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            <DOMPlayerContainer playerContainerRef={playerContainerRef} token={token} viewMode={viewMode} />
            <VideoPlayerContainer
              videoRef={videoRef}
              token={token}
              viewMode={viewMode}
              videoLoading={videoLoading}
              onVideoLoaded={handleVideoLoaded}
              onVideoError={handleVideoError}
            />
          </div>
        </div>
      </Spin>
    </div>
  );
};

export default RecordPlayer;
