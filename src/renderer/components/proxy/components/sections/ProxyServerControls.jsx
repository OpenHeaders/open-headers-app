import React from 'react';
import { Card, Space, Typography, Tag, Button, InputNumber, Alert, Divider } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * ProxyServerControls - Main proxy server control panel
 * 
 * Component for controlling proxy server operations including start/stop functionality,
 * port configuration, and status display. Also includes educational information about
 * how the proxy server works with browser workflow recordings.
 * 
 * Features:
 * - Proxy server start/stop controls with loading states
 * - Port configuration (disabled when server is running)
 * - Real-time status display with visual indicators
 * - Educational alert explaining proxy server purpose and functionality
 * - Tutorial mode support with detailed explanations
 * 
 * Status Indicators:
 * - Green "Running" tag when server is active with port number
 * - Gray "Stopped" tag when server is inactive
 * - Loading spinner during start/stop operations
 * 
 * Educational Content:
 * - Explains why proxy server is needed for proper replay
 * - Details what is and isn't recorded in browser workflows
 * - Describes the replay process and resource fetching
 * - Highlights storage efficiency benefits
 * - Explains protected environment authentication
 * 
 * Technical Notes:
 * - Port input is disabled when server is running to prevent conflicts
 * - Uses consistent styling with other proxy components
 * - Integrates with tutorial mode settings for conditional display
 * 
 * @param {Object} proxyStatus - Current proxy server status and configuration
 * @param {boolean} loading - Whether server operation is in progress
 * @param {boolean} tutorialMode - Whether to show educational content
 * @param {function} onToggleProxy - Callback for start/stop operations
 * @param {function} onUpdatePort - Callback for port configuration changes
 * @returns {JSX.Element} Proxy server control panel
 */
const ProxyServerControls = ({
    proxyStatus,
    loading,
    tutorialMode,
    onToggleProxy,
    onUpdatePort
}) => {
    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <Title level={4} style={{ margin: 0 }}>Proxy Server</Title>
                        <Tag color={proxyStatus.running ? 'default' : 'warning'}>
                            {proxyStatus.running ? `Running` : 'Stopped'}
                        </Tag>
                    </Space>
                    <Space>
                        <InputNumber
                            addonBefore="Port"
                            value={proxyStatus.port}
                            onChange={onUpdatePort}
                            disabled={proxyStatus.running}
                            style={{ width: 150 }}
                        />
                        <Button
                            type="primary"
                            icon={proxyStatus.running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                            onClick={onToggleProxy}
                            loading={loading}
                        >
                            {proxyStatus.running ? 'Stop' : 'Start'}
                        </Button>
                    </Space>
                </div>

                {tutorialMode !== false && (
                    <Alert
                        style={{ marginTop: '16px' }}
                        message="About Proxy Server"
                        description={
                            <Space direction="vertical">
                                <Text>
                                    The proxy server is essential for properly replaying browser workflows:
                                </Text>
                                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                    <li><Text><strong>Why it's needed:</strong> Browser workflow recordings capture DOM mutations and user interactions, but external resources (images, fonts, stylesheets) need to be loaded separately during replay.</Text></li>
                                    <li><Text><strong>What's recorded:</strong> Only DOM changes, user events, and metadata are recorded. External resources URLs are captured but not their content.</Text></li>
                                    <li><Text><strong>What's not recorded:</strong> Actual file contents (images, CSS, JS files).</Text></li>
                                </ul>
                                <Divider style={{ margin: '12px 0' }} />
                                <Text>
                                    <strong>How replaying the recording works:</strong>
                                </Text>
                                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                    <li><Text>The recording player reconstructs the DOM and replays user interactions in sequence.</Text></li>
                                    <li><Text>External resources are fetched through the proxy server, which can inject authentication headers for protected environments.</Text></li>
                                    <li><Text>The proxy cache stores frequently used resources locally for faster subsequent replays.</Text></li>
                                </ul>
                                <Divider style={{ margin: '12px 0' }} />
                                <Text type="primary">
                                    <strong>💾 Storage efficiency:</strong> Recordings are typically 10-100x smaller than video files (.mp4) while providing perfect fidelity DOM reconstruction.
                                </Text>
                                <br />
                                <Text>
                                    <strong><InfoCircleOutlined /> Protected environments:</strong> For authenticated resources, configure proxy rules to inject the necessary headers (e.g., Authorization, Cookie) to fetch missing assets during replay.
                                </Text>
                            </Space>
                        }
                        type="info"
                        showIcon
                        closable
                    />
                )}
            </Space>
        </Card>
    );
};

export default ProxyServerControls;