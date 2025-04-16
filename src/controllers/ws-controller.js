// ws-controller.js - Controller for WebSocket communication
const WebSocket = require('ws');
const appConfig = require('../config/app-config');

/**
 * Controller for WebSocket communication
 */
class WsController {
    /**
     * Create a new WsController
     * @param {SourceService} sourceService - The source service
     */
    constructor(sourceService) {
        this.sourceService = sourceService;
        this.wss = null;
        this.isInitializing = false;

        // Initialize WebSocket server
        this._initializeWebSocketServer();

        // Register for source service events if available
        if (this.sourceService && typeof this.sourceService.on === 'function') {
            this._registerServiceEvents();
        } else {
            console.error('SourceService missing or does not support events');
        }
    }

    /**
     * Initialize the WebSocket server
     * @private
     */
    _initializeWebSocketServer() {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            this.wss = new WebSocket.Server({ port: appConfig.websocket.port });

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
            });

            // Handle server errors
            this.wss.on('error', (error) => {
                console.error('WebSocket server error:', error);
                // Try to recover by restarting the server after a delay
                setTimeout(() => {
                    this._restartWebSocketServer();
                }, 5000);
            });

            console.log(`WebSocket server started on port ${appConfig.websocket.port}`);
        } catch (error) {
            console.error('Failed to initialize WebSocket server:', error);
        } finally {
            this.isInitializing = false;
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
            this._initializeWebSocketServer();
        } catch (error) {
            console.error('Failed to restart WebSocket server:', error);
        }
    }

    /**
     * Register for source service events
     * @private
     */
    _registerServiceEvents() {
        try {
            // When a source is updated, broadcast to all clients
            this.sourceService.on('source:updated', () => {
                this._broadcastSources();
            });

            // When a source is removed, broadcast to all clients
            this.sourceService.on('source:removed', () => {
                this._broadcastSources();
            });

            // When sources are loaded from storage
            this.sourceService.on('sources:loaded', () => {
                this._broadcastSources();
            });
        } catch (error) {
            console.error('Error registering source service events:', error);
        }
    }

    /**
     * Send the current sources to a specific client
     * @private
     * @param {WebSocket} ws - The WebSocket client
     */
    _sendSourcesToClient(ws) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (ws.isInitialized) return; // Prevent duplicate initialization

        try {
            let sources = [];

            // Only try to get sources if the service and method are available
            if (this.sourceService && typeof this.sourceService.getAllSources === 'function') {
                // Get the full source objects with correct jsonFilter data
                sources = this.sourceService.getAllSources();

                // Make sure we're sending the correct jsonFilter for each source
                console.log("Preparing websocket data with jsonFilter information");
            }

            const message = JSON.stringify({
                type: 'sourcesInitial',
                sources: sources
            });

            ws.send(message);
            ws.isInitialized = true;
            console.log(`Sent initial ${sources.length} source(s) to WebSocket client`);
        } catch (error) {
            console.error('Error sending sources to client:', error);
        }
    }

    /**
     * Broadcast the current sources to all connected clients
     * @private
     */
    _broadcastSources() {
        if (!this.wss) return;

        try {
            let sources = [];

            // Only try to get sources if the service and method are available
            if (this.sourceService && typeof this.sourceService.getAllSources === 'function') {
                sources = this.sourceService.getAllSources();
            }

            const message = JSON.stringify({
                type: 'sourcesUpdated',
                sources: sources
            });

            let clientCount = 0;
            for (const client of this.wss.clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                    clientCount++;
                }
            }
            console.log(`Broadcasted ${sources.length} source(s) to ${clientCount} WebSocket client(s)`);
        } catch (error) {
            console.error('Error broadcasting sources:', error);
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

module.exports = WsController;