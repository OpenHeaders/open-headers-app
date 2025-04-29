// ws-service.js - WebSocket service for communicating with browser extensions
const WebSocket = require('ws');

/**
 * WebSocket service for communicating with browser extensions
 */
class WebSocketService {
    constructor() {
        this.wss = null;
        this.port = 59210; // Default WebSocket port
        this.isInitializing = false;
        this.sources = [];
        this.sourceService = null;
    }

    /**
     * Initialize the WebSocket server
     * @param {number} port - Port to listen on
     * @param {Object} sourceService - Service that manages sources
     */
    initialize(port, sourceService) {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            this.port = port || this.port;
            this.sourceService = sourceService;

            this.wss = new WebSocket.Server({ port: this.port });

            this.wss.on('connection', (ws) => {
                console.log('WebSocket client connected');

                // Track client state to prevent duplicate messages
                ws.isInitialized = false;

                // Send initial state to the newly connected client
                this._sendSourcesToClient(ws);

                // Handle client disconnection
                ws.on('close', () => {
                    console.log('WebSocket client disconnected');
                });

                // Handle client errors
                ws.on('error', (error) => {
                    console.error('WebSocket client error:', error);
                });

                // Handle client messages
                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message);
                        console.log('Received message from client:', data);

                        // Handle specific message types
                        if (data.type === 'requestSources') {
                            this._sendSourcesToClient(ws);
                        }
                    } catch (err) {
                        console.error('Error processing client message:', err);
                    }
                });
            });

            // Handle server errors
            this.wss.on('error', (error) => {
                console.error('WebSocket server error:', error);
                // Try to recover by restarting the server after a delay
                setTimeout(() => {
                    this._restartWebSocketServer();
                }, 5000);
            });

            console.log(`WebSocket server started on port ${this.port}`);

            // Register for source events if we have a source service
            if (this.sourceService) {
                this._registerSourceEvents();
            }

            this.isInitializing = false;
            return true;
        } catch (error) {
            console.error('Failed to initialize WebSocket server:', error);
            this.isInitializing = false;
            return false;
        }
    }

    /**
     * Update the internal sources cache and broadcast to clients
     * @param {Array} sources - Array of source objects
     */
    updateSources(sources) {
        this.sources = sources;
        this._broadcastSources();
    }

    /**
     * Register for source service events
     * @private
     */
    _registerSourceEvents() {
        if (!this.sourceService) return;

        try {
            // When a source is updated, broadcast to all clients
            if (typeof this.sourceService.on === 'function') {
                // For EventEmitter-based services
                this.sourceService.on('source:updated', () => {
                    this._updateAndBroadcast();
                });

                this.sourceService.on('source:removed', () => {
                    this._updateAndBroadcast();
                });

                this.sourceService.on('sources:loaded', () => {
                    this._updateAndBroadcast();
                });
            }

            console.log('Registered for source service events');
        } catch (error) {
            console.error('Error registering for source service events:', error);
        }
    }

    /**
     * Update internal cache and broadcast to clients
     * @private
     */
    _updateAndBroadcast() {
        if (!this.sourceService) return;

        try {
            // Update internal sources cache if we have a source service
            if (typeof this.sourceService.getAllSources === 'function') {
                this.sources = this.sourceService.getAllSources();
            }

            // Broadcast to all clients
            this._broadcastSources();
        } catch (error) {
            console.error('Error updating and broadcasting sources:', error);
        }
    }

    /**
     * Send sources to a specific client
     * @private
     * @param {WebSocket} ws - The WebSocket client
     */
    _sendSourcesToClient(ws) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (ws.isInitialized) return; // Prevent duplicate initialization

        try {
            const message = JSON.stringify({
                type: 'sourcesInitial',
                sources: this.sources
            });

            ws.send(message);
            ws.isInitialized = true;
            console.log(`Sent initial ${this.sources.length} source(s) to WebSocket client`);
        } catch (error) {
            console.error('Error sending sources to client:', error);
        }
    }

    /**
     * Broadcast sources to all connected clients
     * @private
     */
    _broadcastSources() {
        if (!this.wss) return;

        try {
            const message = JSON.stringify({
                type: 'sourcesUpdated',
                sources: this.sources
            });

            let clientCount = 0;
            this.wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                    clientCount++;
                }
            });

            if (clientCount > 0) {
                console.log(`Broadcasted ${this.sources.length} source(s) to ${clientCount} WebSocket client(s)`);
            }
        } catch (error) {
            console.error('Error broadcasting sources:', error);
        }
    }

    /**
     * Restart the WebSocket server
     * @private
     */
    _restartWebSocketServer() {
        try {
            if (this.wss) {
                this.wss.close();
                console.log('WebSocket server closed for restart');
            }
            this.initialize(this.port, this.sourceService);
        } catch (error) {
            console.error('Failed to restart WebSocket server:', error);
        }
    }

    /**
     * Close the WebSocket server
     */
    close() {
        if (this.wss) {
            try {
                this.wss.close();
                console.log('WebSocket server closed');
            } catch (error) {
                console.error('Error closing WebSocket server:', error);
            }
        }
    }
}

module.exports = new WebSocketService();