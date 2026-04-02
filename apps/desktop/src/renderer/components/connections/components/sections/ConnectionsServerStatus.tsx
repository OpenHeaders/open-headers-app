import { Alert, Card, Input, InputNumber, Space, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

/**
 * ConnectionsServerStatus - WebSocket server status display
 *
 * Shows WS server running state and port.
 * Follows the same UI pattern as CLI and Proxy server controls.
 */
interface ConnectionsServerStatusData {
  wsServerRunning?: boolean;
  wsPort?: number;
}
interface ConnectionsServerStatusProps {
  status: ConnectionsServerStatusData;
  tutorialMode: boolean;
}
const ConnectionsServerStatus = ({ status, tutorialMode }: ConnectionsServerStatusProps) => {
  return (
    <Card>
      <Space orientation="vertical" style={{ width: '100%' }}>
        {/* Header row: title + status + port */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              WebSocket Server
            </Title>
            <Tag color={status.wsServerRunning ? 'success' : 'error'}>
              {status.wsServerRunning ? 'Running' : 'Stopped'}
            </Tag>
          </Space>
          <Space.Compact>
            <Input value="Port" disabled style={{ width: 50, textAlign: 'center', pointerEvents: 'none' }} />
            <InputNumber value={status.wsPort} disabled style={{ width: 90 }} />
          </Space.Compact>
        </div>

        {/* Info panel */}
        {tutorialMode && (
          <Alert
            style={{ marginTop: '16px' }}
            title="About the WebSocket Server"
            description={
              <div>
                <div>
                  The WebSocket server enables real-time communication between this app and your browser extensions.
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text code>Port {status.wsPort}</Text> — Used by Chrome, Edge, Firefox, and Safari
                </div>
                <div style={{ marginTop: 8 }}>
                  Listens on localhost only — connections are never exposed to your network, only local browser
                  extensions can connect.
                </div>
              </div>
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

export default ConnectionsServerStatus;
