import React, { useState, useEffect, useRef } from 'react';
import { Modal, Upload, Button, Tabs, Table, Tag, Typography, Space, Alert, Spin, Descriptions, Empty, App, Tooltip, theme } from 'antd';
import { UploadOutlined, PlayCircleOutlined, PauseCircleOutlined, StepBackwardOutlined, StepForwardOutlined, ExpandOutlined, CloseOutlined, InfoCircleOutlined, EyeOutlined, CopyOutlined } from '@ant-design/icons';
import { createLogger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';

const log = createLogger('RecordViewer');
const { Dragger } = Upload;
const { Text } = Typography;


export const RecordViewer = ({ record: externalRecord, onRecordChange, viewMode }) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { isDarkMode } = useTheme();
  const [internalRecord, setInternalRecord] = useState(null);
  
  // Use external record if provided, otherwise use internal state
  const record = externalRecord !== undefined ? externalRecord : internalRecord;
  
  const setRecord = (newRecord) => {
    if (onRecordChange) {
      onRecordChange(newRecord);
    } else {
      setInternalRecord(newRecord);
    }
  };
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState(null);
  const [rrwebPlayer, setRrwebPlayer] = useState(null);
  const playerContainerRef = useRef(null);



  useEffect(() => {
    // Load rrweb-player dynamically
    if (!rrwebPlayer) {
      loadRrwebPlayer();
    }
  }, []);

  useEffect(() => {
    // Initialize player when record is loaded
    if (record && playerContainerRef.current && rrwebPlayer && viewMode === 'info') {
      initializePlayer();
    }
  }, [record, rrwebPlayer, viewMode]);

  const loadRrwebPlayer = async () => {
    try {
      // Check if already loaded
      if (window.rrwebPlayer) {
        const player = window.rrwebPlayer?.default || window.rrwebPlayer?.Player || window.rrwebPlayer;
        setRrwebPlayer(() => player);
        return;
      }

      // Load rrweb-player from local files
      const script = document.createElement('script');
      script.src = './lib/rrweb-player.js';
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          // The UMD bundle exports the player as default or Player property
          const player = window.rrwebPlayer?.default || window.rrwebPlayer?.Player || window.rrwebPlayer;
          setRrwebPlayer(() => player);
          log.info('rrweb-player loaded successfully', { 
            hasDefault: !!window.rrwebPlayer?.default,
            hasPlayer: !!window.rrwebPlayer?.Player,
            type: typeof window.rrwebPlayer
          });
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './lib/rrweb-player.css';
      document.head.appendChild(link);
    } catch (error) {
      log.error('Failed to load rrweb-player:', error);
      message.error('Failed to load record player');
    }
  };

  const handleFileUpload = async (file) => {
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate record data
      if (!data.record || !data.record.events || !data.record.metadata) {
        message.error('Invalid record file format');
        return;
      }
      
      setRecord(data.record);
      log.info('Record loaded:', {
        events: data.record.events.length,
        duration: data.record.metadata.duration,
        url: data.record.metadata.url,
        storage: data.record.storage ? {
          localStorage: Object.keys(data.record.storage.localStorage || {}).length,
          sessionStorage: Object.keys(data.record.storage.sessionStorage || {}).length,
          cookies: (data.record.storage.cookies || []).length
        } : null
      });
    } catch (error) {
      log.error('Failed to load record:', error);
      message.error(`Failed to load record: ${error.message}`);
    } finally {
      setLoading(false);
    }
    
    return false; // Prevent default upload behavior
  };

  const initializePlayer = () => {
    try {
      // Clear previous player
      if (player && typeof player.$destroy === 'function') {
        player.$destroy();
      }
      playerContainerRef.current.innerHTML = '';

      // Get viewport dimensions
      const { width, height } = record.metadata.viewport || { width: 1024, height: 768 };
      
      // Scale to fit container - both width and height
      const containerWidth = playerContainerRef.current.offsetWidth;
      const containerHeight = 450; // Fixed container height
      
      // Calculate scale to fit both dimensions
      // Account for player controls (approximately 50px)
      const scaleX = (containerWidth - 40) / width;
      const scaleY = (containerHeight - 90) / height; // Extra space for controls
      const scale = Math.min(scaleX, scaleY, 1);
      
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;

      // Filter out any invalid events
      const validEvents = record.events.filter(event => {
        return event && typeof event.type === 'number' && event.timestamp;
      });
      
      if (validEvents.length !== record.events.length) {
        log.warn(`Filtered out ${record.events.length - validEvents.length} invalid events`);
      }

      // Create new player instance
      const newPlayer = new rrwebPlayer({
        target: playerContainerRef.current,
        props: {
          events: validEvents,
          width: scaledWidth,
          height: scaledHeight,
          autoPlay: false,
          showController: true,
          mouseTail: true,
          UNSAFE_replayCanvas: false,
          skipInactive: true,
          showDebug: false,
          blockClass: 'oh-block',
          liveMode: false
        }
      });

      setPlayer(newPlayer);
      
      // Add event listeners if available
      if (newPlayer && typeof newPlayer.$on === 'function') {
        newPlayer.$on('play', () => log.debug('Player started'));
        newPlayer.$on('pause', () => log.debug('Player paused'));
        newPlayer.$on('finish', () => log.debug('Player finished'));
      }
    } catch (error) {
      log.error('Failed to initialize player:', error);
      message.error('Failed to initialize player');
    }
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeInfo = (relativeMs, startTime) => {
    // Calculate absolute timestamp
    const absoluteTime = new Date(startTime + relativeMs);
    // Format with milliseconds
    const hours = absoluteTime.getHours().toString().padStart(2, '0');
    const minutes = absoluteTime.getMinutes().toString().padStart(2, '0');
    const seconds = absoluteTime.getSeconds().toString().padStart(2, '0');
    const milliseconds = absoluteTime.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  };

  const renderConsoleTab = () => {
    if (!record?.console?.length) {
      return <Empty description="No console logs recorded" />;
    }

    const columns = [
      {
        title: 'Timestamp',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 100,
        render: (ts) => {
          // Calculate relative time from start
          const totalSeconds = Math.floor(ts / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          const milliseconds = ts % 1000;
          
          // Format as MM:SS.mmm
          const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
          
          const absoluteTime = new Date(record.metadata.startTime + ts);
          return (
            <Tooltip title={`${absoluteTime.toLocaleDateString()} ${absoluteTime.toLocaleTimeString()}`}>
              <Text style={{ fontSize: '12px', fontFamily: 'monospace', opacity: 0.8 }}>
                {formattedTime}
              </Text>
            </Tooltip>
          );
        }
      },
      {
        title: 'Level',
        dataIndex: 'level',
        key: 'level',
        width: 80,
        render: (level) => (
          <Tag color={
            level === 'error' ? 'error' : 
            level === 'warn' ? 'warning' : 
            'default'
          }>
            {level.toUpperCase()}
          </Tag>
        )
      },
      {
        title: 'Message',
        dataIndex: 'args',
        key: 'args',
        render: (args) => (
          <Text code style={{ fontSize: '12px' }}>
            {args.map(arg => formatConsoleArg(arg)).join(' ')}
          </Text>
        )
      }
    ];

    return (
      <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box' }}>
        <Table 
          dataSource={record.console.map((log, i) => ({ ...log, key: i }))}
          columns={columns}
          size="small"
          pagination={false}
          scroll={{ y: 280 }}
          sticky={true}
          rowClassName={(record) => `console-${record.level}`}
        />
      </div>
    );
  };

  const [selectedRequestIndex, setSelectedRequestIndex] = useState(null);
  const [networkDetailTab, setNetworkDetailTab] = useState('headers');
  const selectedRequest = selectedRequestIndex !== null ? record?.network?.[selectedRequestIndex] : null;
  
  // Storage modal states
  const [valueModalVisible, setValueModalVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState({ key: '', value: '', type: '' });


  const renderNetworkTab = () => {
    if (!record?.network?.length) {
      return <Empty description="No network requests recorded" />;
    }

    const columns = [
      {
        title: 'Timestamp',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 100,
        render: (timestamp) => {
          // Calculate relative time from start
          const relativeMs = timestamp;
          const totalSeconds = Math.floor(relativeMs / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          const milliseconds = relativeMs % 1000;
          
          // Format as MM:SS.mmm
          const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
          
          const absoluteTime = new Date(record.metadata.startTime + timestamp);
          return (
            <Tooltip title={`${absoluteTime.toLocaleDateString()} ${absoluteTime.toLocaleTimeString()}`}>
              <Text style={{ fontSize: '12px', fontFamily: 'monospace', opacity: 0.8 }}>
                {formattedTime}
              </Text>
            </Tooltip>
          );
        }
      },
      {
        title: 'Name',
        dataIndex: 'url',
        key: 'name',
        width: selectedRequest ? 140 : 250,
        ellipsis: true,
        render: (url, record) => {
          const urlParts = url.split('/');
          const fileName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || 'index';
          const displayName = fileName.length > 40 ? fileName.substring(0, 40) + '...' : fileName;
          
          return (
            <Text 
              style={{ 
                fontSize: '12px', 
                cursor: 'pointer',
                color: record.error ? token.colorError : token.colorLink
              }}
            >
              {displayName}
            </Text>
          );
        }
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status, record) => {
          if (record.error) {
            return <Text style={{ color: token.colorError, fontSize: '12px' }}>Failed</Text>;
          }
          const color = (status >= 200 && status < 300) ? token.colorSuccess : 
                       (status >= 300 && status < 400) ? token.colorWarning : 
                       (status >= 400) ? token.colorError : token.colorTextTertiary;
          return <Text style={{ color, fontSize: '12px' }}>{status}</Text>;
        }
      },
      {
        title: 'Method',
        dataIndex: 'method',
        key: 'method',
        width: 80,
        render: (method) => <Text style={{ fontSize: '12px' }}>{method}</Text>
      },
      {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        width: selectedRequest ? 80 : 100,
        render: (type, record) => {
          const mimeType = type || record.responseHeaders?.['content-type']?.split(';')[0] || 'unknown';
          const shortType = mimeType.includes('json') ? 'json' :
                           mimeType.includes('javascript') ? 'js' :
                           mimeType.includes('css') ? 'css' :
                           mimeType.includes('html') ? 'document' :
                           mimeType.includes('image') ? 'img' :
                           mimeType.includes('font') ? 'font' :
                           record.method === 'OPTIONS' ? 'preflight' :
                           'fetch';
          return <Text style={{ fontSize: '12px' }}>{shortType}</Text>;
        }
      },
      ...(selectedRequest ? [] : [{
        title: 'Size',
        dataIndex: 'size',
        key: 'size',
        width: 100,
        align: 'right',
        render: (size, record) => {
          const bytes = size || record.responseSize || 0;
          const formatted = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` :
                           bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` :
                           `${bytes} B`;
          return <Text style={{ fontSize: '12px' }}>{formatted}</Text>;
        }
      }]),
      ...(selectedRequest ? [] : [{
        title: 'Time',
        dataIndex: 'duration',
        key: 'time',
        width: 100,
        align: 'right',
        render: (duration, record) => {
          const ms = duration || (record.endTime - record.timestamp) || 0;
          const formatted = ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
          return <Text style={{ fontSize: '12px' }}>{formatted}</Text>;
        }
      }])
    ];

    return (
      <div style={{ display: 'flex', gap: '1px', padding: '16px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: selectedRequest ? '33.33%' : '100%', transition: 'width 0.3s' }}>
          <Table 
            dataSource={record.network.map((req, i) => ({ ...req, key: i }))}
            columns={columns}
            size="small"
            pagination={false}
            scroll={{ y: 280 }}
            sticky={true}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedRequestIndex !== null ? [selectedRequestIndex] : [],
              onSelect: (record, selected, selectedRows, nativeEvent) => {
                // Prevent default selection behavior
                nativeEvent?.stopPropagation?.();
              },
              hideSelectAll: true,
              columnWidth: 0,
              columnTitle: ''
            }}
            onRow={(record, index) => ({
              onClick: () => {
                // Toggle selection if clicking the same row
                if (selectedRequestIndex === index) {
                  setSelectedRequestIndex(null);
                } else {
                  setSelectedRequestIndex(index);
                }
              },
              style: { 
                cursor: 'pointer'
              }
            })}
          />
        </div>
        
        {selectedRequest && (
          <div 
            className="network-side-panel"
            style={{ 
              width: '66.67%',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              height: '100%'
            }}
          >
            <div style={{ 
              padding: '8px 16px', 
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              backgroundColor: token.colorBgLayout,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <Space>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<CloseOutlined />}
                  onClick={() => setSelectedRequestIndex(null)}
                />
                <Text strong style={{ fontSize: '13px' }}>
                  {selectedRequest.url.split('/').pop() || 'Request Details'}
                </Text>
              </Space>
              <div style={{ width: '32px' }} /> {/* Spacer to balance the layout */}
            </div>
            
            <Tabs 
              activeKey={networkDetailTab}
              onChange={setNetworkDetailTab}
              type="card"
              size="small"
              style={{ 
                flex: 1,
                backgroundColor: token.colorBgContainer
              }}
              tabBarStyle={{ 
                marginBottom: 0, 
                padding: '0 16px',
                backgroundColor: token.colorBgContainer,
                position: 'relative',
                zIndex: 1,
                flexShrink: 0
              }}
              items={[
                {
                  key: 'headers',
                  label: 'Headers',
                  children: (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                      {renderRequestDetails(selectedRequest)}
                    </div>
                  )
                },
                ...(selectedRequest.requestBody ? [{
                  key: 'request',
                  label: 'Request',
                  children: (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                      {renderRequest(selectedRequest)}
                    </div>
                  )
                }] : []),
                {
                  key: 'response',
                  label: 'Response',
                  children: (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                      {renderResponse(selectedRequest)}
                    </div>
                  )
                },
                {
                  key: 'timing',
                  label: 'Timing',
                  children: (
                    <div style={{ height: '100%', overflow: 'auto' }}>
                      {renderTiming(selectedRequest)}
                    </div>
                  )
                }
              ]}
            />
          </div>
        )}
      </div>
    );
  };

  const renderStorageTab = () => {
    if (!record?.storage) {
      return <Empty description="No storage data recorded" />;
    }

    const { storage } = record;
    
    // Prepare unified data for the table
    const storageData = [];
    
    // Get domain from record metadata
    const recordDomain = record.metadata?.url ? new URL(record.metadata.url).hostname : '-';
    
    // Add localStorage entries
    Object.entries(storage.localStorage || {}).forEach(([key, value]) => {
      storageData.push({
        type: 'Local Storage',
        key: key,
        value: value,
        domain: recordDomain,
        path: '-',
        httpOnly: false,
        secure: false,
        _storageType: 'localStorage'
      });
    });
    
    // Add sessionStorage entries
    Object.entries(storage.sessionStorage || {}).forEach(([key, value]) => {
      storageData.push({
        type: 'Session Storage',
        key: key,
        value: value,
        domain: recordDomain,
        path: '-',
        httpOnly: false,
        secure: false,
        _storageType: 'sessionStorage'
      });
    });
    
    // Add cookies
    (storage.cookies || []).forEach((cookie, index) => {
      // Ensure we have a valid cookie name
      const cookieName = cookie.name || cookie.key || `Cookie${index}`;
      storageData.push({
        type: 'Cookie',
        key: String(cookieName), // Ensure it's a string
        value: cookie.value || '',
        domain: cookie.domain || '-',
        path: cookie.path || '/',
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || '-',
        expirationDate: cookie.expirationDate,
        _storageType: 'cookie',
        _cookieData: cookie
      });
    });
    
    const showValueModal = (key, value, type) => {
      setSelectedValue({ key, value, type });
      setValueModalVisible(true);
    };
    
    const columns = [
      {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        width: 120,
        filters: [
          { text: 'Local Storage', value: 'Local Storage' },
          { text: 'Session Storage', value: 'Session Storage' },
          { text: 'Cookie', value: 'Cookie' }
        ],
        onFilter: (value, record) => record.type === value,
        sorter: (a, b) => a.type.localeCompare(b.type),
        render: (type) => (
          <Tag color={
            type === 'Local Storage' ? 'blue' :
            type === 'Session Storage' ? 'green' :
            'orange'
          } style={{ fontSize: '11px' }}>
            {type}
          </Tag>
        )
      },
      {
        title: 'Name',
        dataIndex: 'key',
        key: 'name',
        width: '25%',
        ellipsis: true,
        sorter: (a, b) => a.key.localeCompare(b.key),
        render: (key) => <Text code style={{ fontSize: '12px' }}>{key}</Text>
      },
      {
        title: 'Value',
        dataIndex: 'value',
        key: 'value',
        ellipsis: false,
        render: (value, record) => {
          let displayValue = value;
          let isJson = false;
          
          // Try to parse as JSON for better display
          try {
            const parsed = JSON.parse(value);
            displayValue = JSON.stringify(parsed, null, 2);
            isJson = true;
          } catch (e) {
            // Not JSON, use as is
          }
          
          const needsExpansion = value && value.length > 100;
          
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
              <Text 
                style={{ 
                  fontSize: '12px', 
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0
                }}
                code={isJson}
              >
                {needsExpansion ? displayValue.substring(0, 100) + '...' : displayValue}
              </Text>
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                <Tooltip title="Copy">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(value);
                      message.success('Copied to clipboard');
                    }}
                    style={{ minWidth: 'auto', padding: '0 4px' }}
                  />
                </Tooltip>
                {needsExpansion && (
                  <Tooltip title="View full value">
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => showValueModal(record.key, value, record.type)}
                      style={{ minWidth: 'auto', padding: '0 4px' }}
                    />
                  </Tooltip>
                )}
              </div>
            </div>
          );
        }
      },
      {
        title: 'Domain',
        dataIndex: 'domain',
        key: 'domain',
        width: 150,
        ellipsis: true,
        sorter: (a, b) => a.domain.localeCompare(b.domain),
        filters: (() => {
          // Get unique domains for filters
          const uniqueDomains = [...new Set(storageData.map(item => item.domain))];
          return uniqueDomains.map(domain => ({ text: domain, value: domain }));
        })(),
        onFilter: (value, record) => record.domain === value,
        render: (domain) => <Text style={{ fontSize: '12px' }}>{domain}</Text>
      },
      {
        title: 'Attributes',
        key: 'attributes',
        width: 120,
        filters: (() => {
          // Dynamically generate filters based on actual data
          const filters = [];
          const hasHttpOnly = storageData.some(item => item.httpOnly);
          const hasSecure = storageData.some(item => item.secure);
          const sameSiteValues = [...new Set(storageData
            .filter(item => item.sameSite && item.sameSite !== '-')
            .map(item => item.sameSite))];
          
          if (hasHttpOnly) filters.push({ text: 'HttpOnly', value: 'httpOnly' });
          if (hasSecure) filters.push({ text: 'Secure', value: 'secure' });
          sameSiteValues.forEach(value => {
            filters.push({ text: value, value: `sameSite:${value}` });
          });
          
          return filters;
        })(),
        onFilter: (value, record) => {
          if (value === 'httpOnly') return record.httpOnly === true;
          if (value === 'secure') return record.secure === true;
          if (value.startsWith('sameSite:')) {
            const sameSiteValue = value.substring(9);
            return record.sameSite === sameSiteValue;
          }
          return false;
        },
        sorter: (a, b) => {
          // Sort by number of attributes
          const aCount = (a.httpOnly ? 1 : 0) + (a.secure ? 1 : 0) + (a.sameSite && a.sameSite !== '-' ? 1 : 0);
          const bCount = (b.httpOnly ? 1 : 0) + (b.secure ? 1 : 0) + (b.sameSite && b.sameSite !== '-' ? 1 : 0);
          return aCount - bCount;
        },
        render: (_, record) => {
          const attributes = [];
          if (record.httpOnly) attributes.push(<Tag key="httpOnly" color="red" style={{ fontSize: '10px', margin: '2px' }}>HttpOnly</Tag>);
          if (record.secure) attributes.push(<Tag key="secure" color="green" style={{ fontSize: '10px', margin: '2px' }}>Secure</Tag>);
          if (record.sameSite && record.sameSite !== '-') attributes.push(<Tag key="sameSite" color="blue" style={{ fontSize: '10px', margin: '2px' }}>{record.sameSite}</Tag>);
          return <div style={{ display: 'flex', flexWrap: 'wrap' }}>{attributes}</div>;
        }
      }
    ];
    
    return (
      <>
        <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box' }}>
          <Table
            dataSource={storageData.map((item, i) => ({ ...item, _rowKey: i }))}
            columns={columns}
            size="small"
            pagination={false}
            scroll={{ y: 280 }}
            sticky={true}
            rowClassName={(record) => `storage-${record._storageType}`}
            rowKey="_rowKey"
          />
        </div>
        
        <Modal
          title={`${selectedValue.type} - ${selectedValue.key}`}
          open={valueModalVisible}
          onCancel={() => setValueModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setValueModalVisible(false)}>
              Close
            </Button>
          ]}
          width={800}
        >
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Key:</Text>
              <Text code copyable style={{ marginBottom: '16px' }}>{selectedValue.key}</Text>
              
              <Text strong>Value:</Text>
              <pre style={{ 
                backgroundColor: token.colorBgLayout,
                padding: '12px',
                borderRadius: '6px',
                border: `1px solid ${token.colorBorderSecondary}`,
                maxHeight: '400px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {(() => {
                  try {
                    const parsed = JSON.parse(selectedValue.value);
                    return JSON.stringify(parsed, null, 2);
                  } catch (e) {
                    return selectedValue.value;
                  }
                })()}
              </pre>
            </Space>
          </div>
        </Modal>
      </>
    );
  };

  const renderInfoTab = () => {
    if (!record?.metadata) return null;

    const { metadata } = record;
    
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '16px' }}>
        <Descriptions bordered column={1}>
          <Descriptions.Item label="Record ID">{metadata.recordId}</Descriptions.Item>
          <Descriptions.Item label="URL">{metadata.url}</Descriptions.Item>
          <Descriptions.Item label="Duration">{formatDuration(metadata.duration)}</Descriptions.Item>
          <Descriptions.Item label="Recorded At">{formatTimestamp(metadata.startTime)}</Descriptions.Item>
          <Descriptions.Item label="Viewport">{metadata.viewport.width} × {metadata.viewport.height}</Descriptions.Item>
          <Descriptions.Item label="User Agent">
            <Text style={{ fontSize: '12px' }}>{metadata.userAgent}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Events">{record.events.length}</Descriptions.Item>
          <Descriptions.Item label="Console Logs">{record.console?.length || 0}</Descriptions.Item>
          <Descriptions.Item label="Network Requests">{record.network?.length || 0}</Descriptions.Item>
          <Descriptions.Item label="Storage Data">
            {record.storage ? `${Object.keys(record.storage.localStorage || {}).length} localStorage, ${Object.keys(record.storage.sessionStorage || {}).length} sessionStorage, ${(record.storage.cookies || []).length} cookies` : 'None'}
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  const formatConsoleArg = (arg) => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    
    if (arg.__type === 'Error') {
      return `Error: ${arg.message}`;
    }
    
    if (arg.__type === 'HTMLElement') {
      return `<${arg.tagName}${arg.id ? '#' + arg.id : ''}${arg.className ? '.' + arg.className : ''}>`;
    }
    
    if (arg.__type === 'Function') {
      return `ƒ ${arg.name}()`;
    }
    
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return '[Object]';
      }
    }
    
    return String(arg);
  };

  const renderRequestDetails = (request) => {
    return (
      <div style={{ padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* General Section */}
          <div>
            <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>▼ General</Text>
            <div style={{ marginTop: '8px', marginLeft: '16px' }}>
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Request URL:</Text>
                <Text copyable style={{ fontSize: '12px', wordBreak: 'break-all' }}>{request.url}</Text>
              </div>
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Request Method:</Text>
                <Text style={{ fontSize: '12px' }}>{request.method}</Text>
              </div>
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Status Code:</Text>
                <Text style={{ fontSize: '12px' }}>{request.status || 'Failed'}</Text>
              </div>
              {request.remoteAddress && (
                <div style={{ display: 'flex', marginBottom: '4px' }}>
                  <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Remote Address:</Text>
                  <Text style={{ fontSize: '12px' }}>{request.remoteAddress}</Text>
                </div>
              )}
            </div>
          </div>

          {/* Response Headers */}
          {request.responseHeaders && (
            <div>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>▼ Response Headers</Text>
              <div style={{ marginTop: '8px', marginLeft: '16px' }}>
                {Object.entries(request.responseHeaders).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', marginBottom: '4px' }}>
                    <Text style={{ width: '200px', fontSize: '12px', color: token.colorTextTertiary }}>{key}:</Text>
                    <Text style={{ fontSize: '12px', wordBreak: 'break-all' }}>{value}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request Headers */}
          {request.requestHeaders && (
            <div>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>▼ Request Headers</Text>
              <div style={{ marginTop: '8px', marginLeft: '16px' }}>
                {Object.entries(request.requestHeaders).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', marginBottom: '4px' }}>
                    <Text style={{ width: '200px', fontSize: '12px', color: token.colorTextTertiary }}>{key}:</Text>
                    <Text style={{ fontSize: '12px', wordBreak: 'break-all' }}>{value}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

        </Space>
      </div>
    );
  };

  const renderRequest = (request) => {
    if (!request.requestBody) {
      return (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Text type="secondary">No request payload</Text>
        </div>
      );
    }

    let formattedPayload;
    let contentType = request.requestHeaders?.['content-type'] || '';

    try {
      // Try to parse as JSON for better formatting
      if (contentType.includes('json') || typeof request.requestBody === 'object') {
        const jsonData = typeof request.requestBody === 'string' 
          ? JSON.parse(request.requestBody) 
          : request.requestBody;
        formattedPayload = JSON.stringify(jsonData, null, 2);
      } else {
        formattedPayload = typeof request.requestBody === 'string' 
          ? request.requestBody 
          : JSON.stringify(request.requestBody, null, 2);
      }
    } catch (e) {
      formattedPayload = String(request.requestBody);
    }

    return (
      <div style={{ padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Content Type */}
          {contentType && (
            <div>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Content Type</Text>
              <div style={{ marginTop: '8px' }}>
                <Text style={{ fontSize: '12px' }}>{contentType}</Text>
              </div>
            </div>
          )}

          {/* Request Data */}
          <div>
            <Space>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Request Payload</Text>
              <Text copyable={{ text: formattedPayload }} style={{ fontSize: '12px' }} />
            </Space>
            <div style={{ marginTop: '8px' }}>
              <pre style={{ 
                fontSize: '12px', 
                margin: 0, 
                whiteSpace: 'pre-wrap',
                backgroundColor: token.colorBgLayout,
                padding: '12px',
                borderRadius: '6px',
                border: `1px solid ${token.colorBorderSecondary}`
              }}>
                {formattedPayload}
              </pre>
            </div>
          </div>
        </Space>
      </div>
    );
  };


  const renderResponse = (request) => {
    if (!request.responseBody) {
      return (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Text type="secondary">No response body</Text>
        </div>
      );
    }

    let formattedResponse;
    let contentType = request.responseHeaders?.['content-type'] || '';

    try {
      // Try to parse as JSON for better formatting
      if (contentType.includes('json') || typeof request.responseBody === 'object') {
        const jsonData = typeof request.responseBody === 'string' 
          ? JSON.parse(request.responseBody) 
          : request.responseBody;
        formattedResponse = JSON.stringify(jsonData, null, 2);
      } else {
        formattedResponse = typeof request.responseBody === 'string' 
          ? request.responseBody 
          : JSON.stringify(request.responseBody, null, 2);
      }
    } catch (e) {
      formattedResponse = String(request.responseBody);
    }

    return (
      <div style={{ padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Content Type */}
          {contentType && (
            <div>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Content Type</Text>
              <div style={{ marginTop: '8px' }}>
                <Text style={{ fontSize: '12px' }}>{contentType}</Text>
              </div>
            </div>
          )}

          {/* Response Data */}
          <div>
            <Space>
              <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Response Body</Text>
              <Text copyable={{ text: formattedResponse }} style={{ fontSize: '12px' }} />
            </Space>
            <div style={{ marginTop: '8px' }}>
              <pre style={{ 
                fontSize: '12px', 
                margin: 0, 
                whiteSpace: 'pre-wrap',
                backgroundColor: token.colorBgLayout,
                padding: '12px',
                borderRadius: '6px',
                border: `1px solid ${token.colorBorderSecondary}`
              }}>
                {formattedResponse}
              </pre>
            </div>
          </div>
        </Space>
      </div>
    );
  };

  const renderTiming = (request) => {
    const duration = request.duration || (request.endTime - request.timestamp) || 0;
    const timing = request.timing || {};

    return (
      <div style={{ padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Timing Breakdown</Text>
          </div>
          
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', marginBottom: '8px' }}>
              <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Total Time:</Text>
              <Text style={{ fontSize: '12px' }}>{duration.toFixed(2)} ms</Text>
            </div>
            
            {timing.dns && (
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>DNS Lookup:</Text>
                <Text style={{ fontSize: '12px' }}>{timing.dns.toFixed(2)} ms</Text>
              </div>
            )}
            
            {timing.connect && (
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Initial Connection:</Text>
                <Text style={{ fontSize: '12px' }}>{timing.connect.toFixed(2)} ms</Text>
              </div>
            )}
            
            {timing.ssl && (
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>SSL:</Text>
                <Text style={{ fontSize: '12px' }}>{timing.ssl.toFixed(2)} ms</Text>
              </div>
            )}
            
            {timing.waiting && (
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Waiting (TTFB):</Text>
                <Text style={{ fontSize: '12px' }}>{timing.waiting.toFixed(2)} ms</Text>
              </div>
            )}
            
            {timing.download && (
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Content Download:</Text>
                <Text style={{ fontSize: '12px' }}>{timing.download.toFixed(2)} ms</Text>
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px' }}>
            <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>Request Details</Text>
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Started At:</Text>
                <Text style={{ fontSize: '12px' }}>
                  {formatTimeInfo(request.timestamp, record.metadata.startTime)}
                </Text>
              </div>
              {request.endTime && (
                <div style={{ display: 'flex', marginBottom: '4px' }}>
                  <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>Completed At:</Text>
                  <Text style={{ fontSize: '12px' }}>
                    {formatTimeInfo(request.endTime, record.metadata.startTime)}
                  </Text>
                </div>
              )}
            </div>
          </div>
        </Space>
      </div>
    );
  };


  // Handle different view modes
  
  if (viewMode === 'upload') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <Dragger
            accept=".json"
            beforeUpload={handleFileUpload}
            showUploadList={false}
            disabled={loading}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag record file to this area</p>
            <p className="ant-upload-hint">
              Supports .json files exported from Open Headers record recording
            </p>
          </Dragger>
        </div>
    );
  }

  if (!rrwebPlayer) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <Spin size="large" />
        <p style={{ marginTop: '20px' }}>Loading record player...</p>
      </div>
    );
  }

  if (!record) {
    return null;
  }

  // Render based on view mode
  switch (viewMode) {
    case 'info':
      return (
        <div>
          <Spin spinning={loading}>
            <div>
              {/* Records Info Header with Tooltip */}
              <div style={{ marginBottom: '8px' }}>
                <Tooltip 
                  title={
                    <div>
                      <div><strong>URL:</strong> {record.metadata.url}</div>
                      <div><strong>Duration:</strong> {formatDuration(record.metadata.duration)}</div>
                      <div><strong>Started:</strong> {formatTimestamp(record.metadata.startTime)}</div>
                      <div><strong>Events:</strong> {record.events.length}</div>
                      <div><strong>Viewport:</strong> {record.metadata.viewport.width} × {record.metadata.viewport.height}</div>
                    </div>
                  }
                  placement="top"
                >
                  <Space style={{ cursor: 'pointer' }}>
                    <InfoCircleOutlined />
                    <Text strong>Session Playback</Text>
                  </Space>
                </Tooltip>
              </div>

              {/* Player */}
              <div 
                ref={playerContainerRef} 
                style={{ 
                  width: '100%', 
                  height: '450px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  background: token.colorBgLayout,
                  borderRadius: '6px',
                  border: `1px solid ${token.colorBorderSecondary}`,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              />
            </div>
          </Spin>
        </div>
      );
      
    case 'tabs':
      return (
        <Tabs 
          defaultActiveKey="console"
          className="record-viewer-tabs"
          type="card"
          style={{ height: '400px' }}
          items={[
            {
              key: 'console',
              label: 'Console',
              children: renderConsoleTab()
            },
            {
              key: 'network',
              label: 'Network',
              children: renderNetworkTab()
            },
            {
              key: 'storage',
              label: 'Storage',
              children: renderStorageTab()
            },
            {
              key: 'info',
              label: 'Info',
              children: renderInfoTab()
            }
          ]}
        />
      );
      
    default:
      return null;
  }
};

export default RecordViewer;