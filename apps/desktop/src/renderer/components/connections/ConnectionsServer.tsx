import { useSettings } from '@/renderer/contexts';
import { ConnectionsClientTable, ConnectionsServerStatus } from './components';
import { useConnectionsServer } from './hooks';

/**
 * ConnectionsServer - WebSocket connections management component
 *
 * Displays WebSocket server status and connected browser extension clients.
 *
 *  props
 *  props.active - Whether this tab is currently visible
 *  Connections management interface
 */
interface ConnectionsServerProps {
  active: boolean;
}
const ConnectionsServer = ({ active }: ConnectionsServerProps) => {
  const { status } = useConnectionsServer({ active });
  const { settings } = useSettings();

  return (
    <div style={{ padding: '24px' }}>
      <ConnectionsServerStatus status={status} tutorialMode={settings?.tutorialMode} />
      <ConnectionsClientTable status={status} />
    </div>
  );
};

export default ConnectionsServer;
