// ws-service.js - WebSocket service for communicating with browser extensions
const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { createLogger } = require('../utils/mainLogger');
const log = createLogger('WebSocketService');

/**
 * WebSocket service for communicating with browser extensions
 * Enhanced to support both WS and WSS protocols with dynamic certificate generation
 */
class WebSocketService {
    constructor() {
        this.wss = null;             // Regular WebSocket server
        this.secureWss = null;       // Secure WebSocket server
        this.httpServer = null;      // HTTP server for WS
        this.httpsServer = null;     // HTTPS server for WSS
        this.wsPort = 59210;         // Default WebSocket port (WS)
        this.wssPort = 59211;        // Default Secure WebSocket port (WSS)
        this.host = '127.0.0.1';     // Bind to localhost only for security
        this.isInitializing = false;
        this.sources = [];
        this.sourceService = null;
        this.appDataPath = null;     // Will be set during initialization

        // Certificate info
        this.certificatePaths = {
            keyPath: null,
            certPath: null,
            fingerprint: null
        };
    }

    /**
     * Initialize the WebSocket service with both WS and WSS servers
     * @param {Object} options - Optional configuration parameters
     * @returns {boolean} - Success status
     */
    initialize(options = {}) {
        if (this.isInitializing) return false;
        this.isInitializing = true;

        try {
            log.info('Initializing WebSocket service with WS and WSS support...');

            // Apply options
            if (options.wsPort) this.wsPort = options.wsPort;
            if (options.wssPort) this.wssPort = options.wssPort;
            if (options.sourceService) this.sourceService = options.sourceService;
            if (options.appDataPath) this.appDataPath = options.appDataPath;

            // If appDataPath wasn't provided, try to get it from electron app
            if (!this.appDataPath) {
                try {
                    // Try to access electron app if available
                    const electron = require('electron');
                    if (electron && electron.app) {
                        this.appDataPath = electron.app.getPath('userData');
                        log.info(`Using Electron userData path: ${this.appDataPath}`);
                    }
                } catch (e) {
                    log.info('Electron app not available, using current directory for certificates');
                    this.appDataPath = process.cwd();
                }
            }

            // Start both servers
            this._setupWsServer();
            this._setupWssServer();

            // Register source service events if available
            if (this.sourceService) {
                this._registerSourceEvents();
            }

            this.isInitializing = false;
            return true;
        } catch (error) {
            log.error('Failed to initialize WebSocket service:', error);
            this.isInitializing = false;
            return false;
        }
    }

    /**
     * Set up plain WebSocket server (WS)
     * @private
     */
    _setupWsServer() {
        try {
            log.info(`WebSocket server (WS) starting on ${this.host}:${this.wsPort}`);

            // Create HTTP server
            this.httpServer = http.createServer((req, res) => {
                // Get the URL path
                const urlParts = new URL(`http://${this.host}:${this.wsPort}${req.url}`);
                const path = urlParts.pathname;

                // Handle ping endpoint
                if (path === '/ping') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('pong');
                } else {
                    // Default response for all other requests
                    res.writeHead(426, { 'Content-Type': 'text/plain' });
                    res.end('Upgrade Required - WebSocket Only');
                }
            });

            // Create WebSocket server with the HTTP server
            this.wss = new WebSocket.Server({
                server: this.httpServer,
                host: this.host
            });

            // Configure WebSocket server events
            this._configureWebSocketServer(this.wss, 'WS');

            // Start listening
            this.httpServer.listen(this.wsPort, this.host, () => {
                log.info(`WebSocket server (WS) listening on ${this.host}:${this.wsPort}`);
            });
        } catch (error) {
            log.error('Error setting up WS server:', error);
        }
    }

    /**
     * Set up secure WebSocket server (WSS)
     * @private
     */
    _setupWssServer() {
        try {
            log.info(`Secure WebSocket server (WSS) starting on ${this.host}:${this.wssPort}`);

            // Ensure certificate files exist or create them
            const certInfo = this._ensureCertificatesExist();
            if (!certInfo.success) {
                log.error('Failed to set up certificates for WSS server:', certInfo.error);
                return;
            }

            // Read the key and certificate files
            const key = fs.readFileSync(this.certificatePaths.keyPath);
            const cert = fs.readFileSync(this.certificatePaths.certPath);

            // Create HTTPS server with the loaded certificates
            this.httpsServer = https.createServer({
                key: key,
                cert: cert
            }, (req, res) => {
                // Get the URL path
                const urlParts = new URL(`https://${this.host}:${this.wssPort}${req.url}`);
                const path = urlParts.pathname;

                // Handle different endpoints
                if (path === '/ping') {
                    // Simple ping endpoint
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('pong');
                }
                else if (path === '/verify-cert') {
                    // Certificate verification endpoint with auto-close
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>Certificate Verified</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                text-align: center;
                                margin-top: 50px;
                                background-color: #f8f9fa;
                                color: #333;
                            }
                            .container {
                                max-width: 500px;
                                margin: 0 auto;
                                padding: 20px;
                                background-color: white;
                                border-radius: 8px;
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            }
                            .success-icon {
                                font-size: 48px;
                                color: #34A853;
                                margin-bottom: 20px;
                            }
                            h1 {
                                color: #4285F4;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="success-icon">✓</div>
                            <h1>Certificate Accepted</h1>
                            <p>Certificate has been verified successfully. This window will close automatically.</p>
                            <p>Connection status: <strong style="color: #34A853">Connected</strong></p>
                        </div>
                        <script>
                            // Close this window after 2 seconds
                            setTimeout(() => {
                                window.close();
                            }, 2000);
                        </script>
                    </body>
                    </html>
                `);
                }
                else if (path === '/accept-cert') {
                    // Redirect to the verification page
                    res.writeHead(302, { 'Location': '/verify-cert' });
                    res.end();
                }
                else {
                    // Default response for all other requests
                    res.writeHead(426, { 'Content-Type': 'text/plain' });
                    res.end('Upgrade Required - WebSocket Only');
                }
            });

            // Create secure WebSocket server with the HTTPS server
            this.secureWss = new WebSocket.Server({
                server: this.httpsServer,
                host: this.host
            });

            // Configure WebSocket server events
            this._configureWebSocketServer(this.secureWss, 'WSS');

            // Start listening
            this.httpsServer.listen(this.wssPort, this.host, () => {
                log.info(`Secure WebSocket server (WSS) listening on ${this.host}:${this.wssPort}`);
                log.info(`Certificate fingerprint: ${this.certificatePaths.fingerprint}`);
            });
        } catch (error) {
            log.error('Error setting up WSS server:', error);
        }
    }

    /**
     * Ensure certificate files exist, or create them
     * @private
     * @returns {Object} - Status object with success flag and error message if applicable
     */
    _ensureCertificatesExist() {
        try {
            // Create certificates directory if needed
            const certsDir = this._getCertificatesDirectory();
            if (!fs.existsSync(certsDir)) {
                fs.mkdirSync(certsDir, { recursive: true });
                log.info(`Created certificates directory: ${certsDir}`);
            }

            const keyPath = path.join(certsDir, 'server.key');
            const certPath = path.join(certsDir, 'server.cert');

            // Check if certificates already exist
            if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
                log.info('Using existing certificate files');

                // Calculate and store fingerprint
                const cert = fs.readFileSync(certPath);
                const fingerprint = this._calculateCertFingerprint(cert);

                // Store the paths
                this.certificatePaths = {
                    keyPath,
                    certPath,
                    fingerprint
                };

                return { success: true };
            }

            // Certificates don't exist, generate them
            log.info('Certificate files not found, generating new ones...');

            try {
                // Generate certificates using OpenSSL
                this._generateCertificates(certsDir, keyPath, certPath);

                // Calculate and store fingerprint
                const cert = fs.readFileSync(certPath);
                const fingerprint = this._calculateCertFingerprint(cert);

                // Store the paths
                this.certificatePaths = {
                    keyPath,
                    certPath,
                    fingerprint
                };

                return { success: true };
            } catch (genError) {
                return {
                    success: false,
                    error: `Failed to generate certificates: ${genError.message}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Error ensuring certificates exist: ${error.message}`
            };
        }
    }

    /**
     * Gets the appropriate directory for storing certificates
     * @private
     * @returns {string} - Path to the certificates directory
     */
    _getCertificatesDirectory() {
        if (this.appDataPath) {
            return path.join(this.appDataPath, 'certs');
        }

        // Fallback to current working directory
        return path.join(process.cwd(), 'certs');
    }

    /**
     * Generate SSL certificates using OpenSSL
     * @private
     * @param {string} certsDir - Directory to store certificates
     * @param {string} keyPath - Path for the key file
     * @param {string} certPath - Path for the certificate file
     */
    _generateCertificates(certsDir, keyPath, certPath) {
        try {
            // Generate private key
            log.info('Generating private key...');
            execSync(`openssl genrsa -out "${keyPath}" 2048`);

            // Generate self-signed certificate
            log.info('Generating self-signed certificate...');
            execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 3650 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`);

            log.info('Successfully generated certificate files');
        } catch (error) {
            log.error('Failed to generate certificates with OpenSSL:', error.message);

            // Try a different approach with different OpenSSL syntax for older versions
            try {
                log.info('Trying alternative certificate generation method...');

                // Generate private key
                execSync(`openssl genrsa -out "${keyPath}" 2048`);

                // Generate CSR without SAN extension
                const csrPath = path.join(certsDir, 'server.csr');
                execSync(`openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=localhost"`);

                // Create openssl config file for SAN
                const configPath = path.join(certsDir, 'openssl.cnf');
                const configContent = `
                [req]
                distinguished_name = req_distinguished_name
                req_extensions = v3_req
                prompt = no
                
                [req_distinguished_name]
                CN = localhost
                
                [v3_req]
                subjectAltName = @alt_names
                
                [alt_names]
                DNS.1 = localhost
                IP.1 = 127.0.0.1
                `;

                fs.writeFileSync(configPath, configContent);

                // Generate self-signed certificate with SAN
                execSync(`openssl x509 -req -days 3650 -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}" -extensions v3_req -extfile "${configPath}"`);

                // Clean up temporary files
                if (fs.existsSync(csrPath)) fs.unlinkSync(csrPath);
                if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

                log.info('Successfully generated certificate files with alternative method');
            } catch (altError) {
                log.error('Failed to generate certificates with alternative method:', altError.message);
                throw new Error('Unable to generate certificates with either method');
            }
        }
    }

    /**
     * Calculate certificate fingerprint
     * @private
     * @param {Buffer} cert - Certificate buffer
     * @returns {string} - Certificate fingerprint
     */
    _calculateCertFingerprint(cert) {
        try {
            const fingerprint = crypto
                .createHash('sha1')
                .update(cert)
                .digest('hex')
                .match(/.{2}/g)
                .join(':')
                .toUpperCase();

            return fingerprint;
        } catch (error) {
            log.error('Error calculating certificate fingerprint:', error);
            return 'UNKNOWN_FINGERPRINT';
        }
    }

    /**
     * Configure WebSocket server events
     * @private
     * @param {WebSocket.Server} server - The WebSocket server to configure
     * @param {string} serverType - Server type identifier (WS or WSS)
     */
    _configureWebSocketServer(server, serverType) {
        server.on('connection', (ws) => {
            log.info(`${serverType} client connected`);

            // Track client initialization state
            ws.isInitialized = false;

            // Send initial sources to newly connected client
            this._sendSourcesToClient(ws);

            // Handle client disconnection
            ws.on('close', () => {
                log.info(`${serverType} client disconnected`);
            });

            // Handle client errors
            ws.on('error', (error) => {
                log.error(`${serverType} client error:`, error);
            });

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    log.info(`Received message from ${serverType} client:`, data);

                    // Handle specific message types
                    if (data.type === 'requestSources') {
                        this._sendSourcesToClient(ws);
                    }
                } catch (err) {
                    log.error(`Error processing ${serverType} client message:`, err);
                }
            });
        });

        // Handle server errors
        server.on('error', (error) => {
            log.error(`${serverType} server error:`, error);

            // Attempt to restart server after a delay
            setTimeout(() => {
                this._restartWebSocketServer(serverType);
            }, 5000);
        });
    }

    /**
     * Update sources and broadcast to all clients
     * @param {Array} sources - Array of source objects
     */
    updateSources(sources) {
        this.sources = sources;
        this._broadcastSources();
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
            log.info(`Sent initial ${this.sources.length} source(s) to client`);
        } catch (error) {
            log.error('Error sending sources to client:', error);
        }
    }

    /**
     * Broadcast sources to all connected clients on both servers
     * @private
     */
    _broadcastSources() {
        // Prepare message once for efficiency
        const message = JSON.stringify({
            type: 'sourcesUpdated',
            sources: this.sources
        });

        let clientCount = 0;

        // Function to send to all clients of a server
        const sendToAllClients = (server) => {
            if (!server) return 0;

            let count = 0;
            server.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                    count++;
                }
            });
            return count;
        };

        // Send to regular WS clients
        if (this.wss) {
            clientCount += sendToAllClients(this.wss);
        }

        // Send to secure WSS clients
        if (this.secureWss) {
            clientCount += sendToAllClients(this.secureWss);
        }

        if (clientCount > 0) {
            log.info(`Broadcasted ${this.sources.length} source(s) to ${clientCount} client(s)`);
        }
    }

    /**
     * Restart a specific WebSocket server
     * @private
     * @param {string} serverType - The server type to restart ('WS' or 'WSS')
     */
    _restartWebSocketServer(serverType) {
        try {
            if (serverType === 'WS') {
                if (this.wss) {
                    log.info('Closing WS server for restart...');
                    this.wss.close();
                    if (this.httpServer) this.httpServer.close();
                }
                // Wait before restarting
                setTimeout(() => this._setupWsServer(), 1000);
            }
            else if (serverType === 'WSS') {
                if (this.secureWss) {
                    log.info('Closing WSS server for restart...');
                    this.secureWss.close();
                    if (this.httpsServer) this.httpsServer.close();
                }
                // Wait before restarting
                setTimeout(() => this._setupWssServer(), 1000);
            }
        } catch (error) {
            log.error(`Error restarting ${serverType} server:`, error);
        }
    }

    /**
     * Register for source service events
     * @private
     */
    _registerSourceEvents() {
        if (!this.sourceService) return;

        try {
            // For EventEmitter-based service
            if (typeof this.sourceService.on === 'function') {
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

            log.info('Registered for source service events');
        } catch (error) {
            log.error('Error registering for source service events:', error);
        }
    }

    /**
     * Update from source service and broadcast
     * @private
     */
    _updateAndBroadcast() {
        if (!this.sourceService) return;

        try {
            // Update internal sources if source service provides them
            if (typeof this.sourceService.getAllSources === 'function') {
                this.sources = this.sourceService.getAllSources();
            }

            // Broadcast to all clients
            this._broadcastSources();
        } catch (error) {
            log.error('Error updating and broadcasting sources:', error);
        }
    }

    /**
     * Close all WebSocket servers
     */
    close() {
        // Close WS server
        if (this.wss) {
            try {
                this.wss.close();
                if (this.httpServer) this.httpServer.close();
                log.info(`WebSocket server (WS) on ${this.host}:${this.wsPort} closed`);
            } catch (error) {
                log.error('Error closing WS server:', error);
            }
        }

        // Close WSS server
        if (this.secureWss) {
            try {
                this.secureWss.close();
                if (this.httpsServer) this.httpsServer.close();
                log.info(`Secure WebSocket server (WSS) on ${this.host}:${this.wssPort} closed`);
            } catch (error) {
                log.error('Error closing WSS server:', error);
            }
        }
    }
}

module.exports = new WebSocketService();