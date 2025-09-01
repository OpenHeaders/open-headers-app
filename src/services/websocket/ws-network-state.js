/**
 * WebSocket Network State Handler
 * Manages network state broadcasting to WebSocket clients
 */

const { createLogger } = require('../../utils/mainLogger');
const log = createLogger('WSNetworkState');

class WSNetworkStateHandler {
    constructor(wsService) {
        this.wsService = wsService;
        this.currentNetworkState = {
            isOnline: true,
            networkQuality: 'unknown',
            lastUpdate: Date.now()
        };
    }

    /**
     * Initialize network state handling
     */
    initialize(networkService) {
        if (!networkService) {
            log.warn('NetworkService not provided, network state updates will not be available');
            return;
        }

        // Get initial state
        const initialState = networkService.getState();
        if (initialState) {
            this.updateNetworkState(initialState);
        }

        // Subscribe to network state changes
        networkService.on('state-changed', (event) => {
            if (event && event.newState) {
                this.updateNetworkState(event.newState);
            }
        });

        log.info('Network state handler initialized');
    }

    /**
     * Update the current network state and broadcast to clients
     */
    updateNetworkState(state) {
        if (!state || typeof state !== 'object') {
            log.warn('Invalid network state received:', state);
            return;
        }

        // Update our cached state
        this.currentNetworkState = {
            isOnline: state.isOnline !== undefined ? state.isOnline : true,
            networkQuality: state.networkQuality || 'unknown',
            vpnActive: state.vpnActive || false,
            connectionType: state.connectionType || 'unknown',
            lastUpdate: Date.now()
        };

        // Broadcast to all WebSocket clients
        this.broadcastNetworkState();
    }

    /**
     * Broadcast current network state to all connected WebSocket clients
     */
    broadcastNetworkState() {
        if (!this.wsService) {
            return;
        }

        const message = JSON.stringify({
            type: 'network-state-update',
            data: {
                networkState: this.currentNetworkState,
                timestamp: Date.now()
            }
        });

        let clientCount = 0;

        // Send to WS clients
        if (this.wsService.wss && this.wsService.wss.clients) {
            this.wsService.wss.clients.forEach((client) => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    try {
                        client.send(message);
                        clientCount++;
                    } catch (error) {
                        log.error('Error sending network state to WS client:', error);
                    }
                }
            });
        }

        // Send to WSS clients
        if (this.wsService.secureWss && this.wsService.secureWss.clients) {
            this.wsService.secureWss.clients.forEach((client) => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    try {
                        client.send(message);
                        clientCount++;
                    } catch (error) {
                        log.error('Error sending network state to WSS client:', error);
                    }
                }
            });
        }

        if (clientCount > 0) {
            log.debug(`Broadcasted network state to ${clientCount} client(s)`);
        }
    }

    /**
     * Get current network state
     */
    getCurrentState() {
        return { ...this.currentNetworkState };
    }

    /**
     * Send initial network state to a newly connected client
     */
    sendInitialState(ws) {
        if (!ws || ws.readyState !== 1) {
            return;
        }

        const message = JSON.stringify({
            type: 'network-state-initial',
            data: {
                networkState: this.currentNetworkState,
                timestamp: Date.now()
            }
        });

        try {
            ws.send(message);
            log.debug('Sent initial network state to client');
        } catch (error) {
            log.error('Error sending initial network state:', error);
        }
    }
}

module.exports = WSNetworkStateHandler;