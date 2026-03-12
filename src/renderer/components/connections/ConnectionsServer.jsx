import React from 'react';
import { useConnectionsServer } from './hooks';
import { ConnectionsServerStatus, ConnectionsClientTable } from './components';
import { useSettings } from '../../contexts';

/**
 * ConnectionsServer - WebSocket connections management component
 *
 * Displays WebSocket server status and connected browser extension clients.
 *
 * @param {Object} props
 * @param {boolean} props.active - Whether this tab is currently visible
 * @returns {JSX.Element} Connections management interface
 */
const ConnectionsServer = ({ active }) => {
    const { status } = useConnectionsServer({ active });
    const { settings } = useSettings();

    return (
        <div style={{ padding: '24px' }}>
            <ConnectionsServerStatus
                status={status}
                tutorialMode={settings?.tutorialMode}
            />
            <ConnectionsClientTable status={status} />
        </div>
    );
};

export default ConnectionsServer;
