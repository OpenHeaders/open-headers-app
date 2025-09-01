/**
 * Processing overlay component for workflow table rows
 * Shows detailed progress information during recording processing
 */

import React from 'react';
import { Progress, Space, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const ProcessingOverlay = ({ processing }) => {
  if (!processing) return null;

  const { stage, progress = 0, details = {} } = processing;

  // Map resource types to user-friendly names
  const getResourceTypeDisplay = (type) => {
    const typeMap = {
      'stylesheet': 'CSS stylesheets',
      'font': 'Web fonts',
      'script': 'JavaScript files',
      'image': 'Images',
      'other': 'Other resources'
    };
    return typeMap[type] || type;
  };

  // Get stage-specific content
  const getStageContent = () => {
    switch (stage) {
      case 'preprocessing':
        return (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                lineHeight: '1.3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <Spin 
                  indicator={<LoadingOutlined style={{ fontSize: 18 }} spin />}
                  spinning={true}
                />
                Processing recording data and optimizing for playback
              </div>
              <Progress 
                percent={progress} 
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                style={{ width: '100%', maxWidth: '350px', margin: '0 auto' }}
                strokeWidth={8}
              />
              <div style={{ fontSize: '13px', color: '#595959' }}>
                <Space direction="vertical" size="small">
                  <div>
                    Analyzing <strong>{details.eventCount || details.totalEvents || 0}</strong> events
                  </div>
                  {details.phase && (
                    <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                      {details.phase === 'first-pass' && 'Pass 1: Collecting resource URLs...'}
                      {details.phase === 'first-pass-complete' && `Found ${details.resourcesFound || 0} unique resources`}
                      {details.phase === 'second-pass' && 'Pass 2: Normalizing URLs and optimizing...'}
                      {details.phase === 'complete' && 'Preprocessing complete!'}
                      {!['first-pass', 'first-pass-complete', 'second-pass', 'complete'].includes(details.phase) && 'Preparing resources...'}
                    </div>
                  )}
                  {details.eventsProcessed && (
                    <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                      Processed: {details.eventsProcessed} / {details.totalEvents}
                    </div>
                  )}
                </Space>
              </div>
            </Space>
          </div>
        );

      case 'prefetching':
        const resourceType = details.currentType ? getResourceTypeDisplay(details.currentType) : 'resources';
        const fileName = details.currentResource ? 
          details.currentResource.split('/').pop().substring(0, 50) : '';
        
        return (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                lineHeight: '1.3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <Spin 
                  indicator={<LoadingOutlined style={{ fontSize: 18 }} spin />}
                  spinning={true}
                />
                Pre-fetching static resources and Caching them for instant playback
              </div>
              <Progress 
                percent={progress} 
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                style={{ width: '100%', maxWidth: '350px', margin: '0 auto' }}
                strokeWidth={8}
              />
              <div style={{ fontSize: '13px', color: '#595959' }}>
                {details.completed !== undefined ? (
                  <Space direction="vertical" size="small">
                    <div>
                      <strong>{details.completed + (details.failed || 0)}</strong> of <strong>{details.total}</strong> resources processed
                    </div>
                    {(details.failed > 0 || details.completed > 0) && (
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ color: '#52c41a' }}>✓ {details.completed} cached successfully</span>
                        {details.failed > 0 && (
                          <>
                            {' • '}
                            <span style={{ color: '#ff4d4f' }}>✗ {details.failed} failed</span>
                          </>
                        )}
                      </div>
                    )}
                  </Space>
                ) : (
                  'Initializing cache...'
                )}
              </div>
              {details.currentType && (
                <div style={{ 
                  fontSize: '13px', 
                  color: '#722ed1',
                  marginTop: '8px',
                  padding: '8px 16px',
                  background: 'rgba(114, 46, 209, 0.08)',
                  borderRadius: '6px',
                  display: 'inline-block',
                  maxWidth: '90%',
                  wordBreak: 'break-word'
                }}>
                  <div style={{ fontWeight: 500 }}>
                    Currently caching: {resourceType}
                  </div>
                  {fileName && (
                    <div style={{ fontSize: '11px', color: '#8c8c8c', marginTop: '4px' }}>
                      {fileName}
                    </div>
                  )}
                </div>
              )}
            </Space>
          </div>
        );

      case 'saving':
        return (
          <div style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="small">
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <Spin 
                  indicator={<LoadingOutlined style={{ fontSize: 18 }} spin />}
                  spinning={true}
                />
                Saving recording to disk...
              </div>
              <Progress 
                percent={progress} 
                status="active"
                strokeColor="#52c41a"
                style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}
                strokeWidth={8}
              />
            </Space>
          </div>
        );

      case 'error':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#ff4d4f' }}>
              Processing failed
            </div>
            {details.error && (
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
                {details.error}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const content = getStageContent();
  if (!content) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(255, 255, 255, 0.97)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        backdropFilter: 'blur(3px)',
        borderRadius: '8px',
        minHeight: '200px'
      }}
    >
      <div style={{ 
        padding: '20px',
        textAlign: 'center',
        width: '100%',
        maxWidth: '600px'
      }}>
        {content}
      </div>
    </div>
  );
};

export default ProcessingOverlay;