// ws-service.js - WebSocket service for communicating with browser extensions
const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../utils/mainLogger');
const log = createLogger('WebSocketService');

let selfsigned;
try {
    selfsigned = require('selfsigned');
} catch (error) {
    log.error('Failed to load selfsigned module:', error);
    throw new Error('selfsigned module is required but not found. Please run npm install.');
}

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
            this.httpServer.listen(this.wsPort, this.host, (err) => {
                if (err) {
                    log.error('Failed to start WS server:', err);
                    return;
                }
                log.info(`WebSocket server (WS) listening on ${this.host}:${this.wsPort}`);
            });
            
            // Add error handler for HTTP server
            this.httpServer.on('error', (error) => {
                log.error('HTTP server error:', error);
                if (error.code === 'EADDRINUSE') {
                    log.error(`Port ${this.wsPort} is already in use`);
                } else if (error.code === 'EACCES') {
                    log.error(`Permission denied to bind to port ${this.wsPort}`);
                }
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
            this.httpsServer.listen(this.wssPort, this.host, (err) => {
                if (err) {
                    log.error('Failed to start WSS server:', err);
                    return;
                }
                log.info(`Secure WebSocket server (WSS) listening on ${this.host}:${this.wssPort}`);
                if (this.certificatePaths && this.certificatePaths.fingerprint) {
                    log.info(`Certificate fingerprint: ${this.certificatePaths.fingerprint}`);
                }
            });
            
            // Add error handler for HTTPS server
            this.httpsServer.on('error', (error) => {
                log.error('HTTPS server error:', error);
                if (error.code === 'EADDRINUSE') {
                    log.error(`Port ${this.wssPort} is already in use`);
                } else if (error.code === 'EACCES') {
                    log.error(`Permission denied to bind to port ${this.wssPort}`);
                }
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
                log.info('Found existing certificate files, checking validity...');

                try {
                    // Read the certificate
                    const certPem = fs.readFileSync(certPath, 'utf8');
                    const cert = fs.readFileSync(certPath);
                    
                    // Check if certificate is expired or will expire soon
                    if (this._isCertificateExpiredOrExpiringSoon(certPem)) {
                        log.info('Certificate is expired or expiring soon, regenerating...');
                        // Delete old certificates
                        fs.unlinkSync(keyPath);
                        fs.unlinkSync(certPath);
                        // Fall through to generation logic below
                    } else {
                        log.info('Using existing valid certificate files');
                        
                        // Calculate and store fingerprint
                        const fingerprint = this._calculateCertFingerprint(cert);

                        // Store the paths
                        this.certificatePaths = {
                            keyPath,
                            certPath,
                            fingerprint
                        };

                        return { success: true };
                    }
                } catch (error) {
                    log.error('Error checking certificate validity:', error);
                    // If we can't check validity, regenerate to be safe
                    log.info('Unable to verify certificate, regenerating...');
                    try {
                        fs.unlinkSync(keyPath);
                        fs.unlinkSync(certPath);
                    } catch (unlinkError) {
                        // Ignore unlink errors
                    }
                }
            }

            // Certificates don't exist, generate them
            log.info('Certificate files not found, generating new ones...');

            try {
                // Generate certificates using selfsigned package
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

                log.info(`Calculated fingerprint for new certificate: ${fingerprint}`);
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
     * Generate SSL certificates using selfsigned package
     * @private
     * @param {string} certsDir - Directory to store certificates
     * @param {string} keyPath - Path for the key file
     * @param {string} certPath - Path for the certificate file
     */
    _generateCertificates(certsDir, keyPath, certPath) {
        try {
            log.info('Generating self-signed certificate using selfsigned package...');

            // Certificate attributes
            const attrs = [
                { name: 'commonName', value: 'localhost' },
                { name: 'countryName', value: 'US' },
                { shortName: 'ST', value: 'State' },
                { name: 'localityName', value: 'City' },
                { name: 'organizationName', value: 'OpenHeaders' },
                { shortName: 'OU', value: 'Development' }
            ];

            // Certificate options with Subject Alternative Names for localhost
            const options = {
                keySize: 2048,
                days: 365, // 1 year for browser extension compatibility
                algorithm: 'sha256',
                extensions: [
                    {
                        name: 'subjectAltName',
                        altNames: [
                            { type: 2, value: 'localhost' }, // DNS
                            { type: 7, ip: '127.0.0.1' }     // IP
                        ]
                    },
                    {
                        name: 'keyUsage',
                        keyCertSign: true,
                        digitalSignature: true,
                        nonRepudiation: true,
                        keyEncipherment: true,
                        dataEncipherment: true
                    },
                    {
                        name: 'extKeyUsage',
                        serverAuth: true,
                        clientAuth: true
                    }
                ]
            };

            // Generate certificate
            let pems;
            try {
                pems = selfsigned.generate(attrs, options);
                
                if (!pems || !pems.private || !pems.cert) {
                    throw new Error('Certificate generation returned invalid data');
                }
            } catch (genError) {
                log.error('Error during certificate generation:', genError);
                throw genError;
            }

            // Write certificate and key files
            fs.writeFileSync(keyPath, pems.private);
            fs.writeFileSync(certPath, pems.cert);

            log.info('Successfully generated certificate files');
            
            // Only log fingerprint if it exists
            if (pems.fingerprint) {
                log.info(`Certificate fingerprint from selfsigned: ${pems.fingerprint}`);
            }
        } catch (error) {
            log.error('Failed to generate certificates:', error.message);
            throw new Error(`Unable to generate certificates: ${error.message}`);
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
            // Ensure cert is a Buffer
            const certBuffer = Buffer.isBuffer(cert) ? cert : Buffer.from(cert);
            
            const fingerprint = crypto
                .createHash('sha1')
                .update(certBuffer)
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
     * Check if certificate is expired or expiring soon (within 30 days)
     * @private
     * @param {string} certPem - Certificate in PEM format
     * @returns {boolean} - True if expired or expiring soon
     */
    _isCertificateExpiredOrExpiringSoon(certPem) {
        try {
            // Parse the certificate to extract validity dates
            // Extract the certificate content between BEGIN and END markers
            const certMatch = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
            if (!certMatch) {
                log.error('Invalid certificate format');
                return true; // Regenerate if invalid
            }

            // Since we generate certificates with 1-year validity,
            // we can check the file modification time as a proxy
            const certPath = this.certificatePaths?.certPath || path.join(this._getCertificatesDirectory(), 'server.cert');
            const stats = fs.statSync(certPath);
            const certAge = Date.now() - stats.mtime.getTime();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            const elevenMonths = 11 * 30 * 24 * 60 * 60 * 1000; // ~330 days
            
            // Regenerate if older than 11 months (30 days before expiry)
            if (certAge > elevenMonths) {
                const ageInDays = Math.floor(certAge / (24 * 60 * 60 * 1000));
                log.info(`Certificate is ${ageInDays} days old, will regenerate (expires after 365 days)`);
                return true;
            }
            
            // Also check if certificate will expire within 30 days
            const oneYear = 365 * 24 * 60 * 60 * 1000;
            const timeUntilExpiry = oneYear - certAge;
            if (timeUntilExpiry < thirtyDays) {
                const daysUntilExpiry = Math.floor(timeUntilExpiry / (24 * 60 * 60 * 1000));
                log.info(`Certificate expires in ${daysUntilExpiry} days, will regenerate`);
                return true;
            }
            
            return false;
        } catch (error) {
            log.error('Error checking certificate expiration:', error);
            // If we can't check, assume it needs renewal for safety
            return true;
        }
    }

    /**
     * Configure WebSocket server events
     * @private
     * @param {WebSocket.Server} server - The WebSocket server to configure
     * @param {string} serverType - Server type identifier (WS or WSS)
     */
    _configureWebSocketServer(server, serverType) {
        // Add error handler for the server itself
        server.on('error', (error) => {
            log.error(`${serverType} server error:`, error);
        });

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
            // Ensure sources is an array
            const sources = this.sources || [];
            
            const message = JSON.stringify({
                type: 'sourcesInitial',
                sources: sources
            });

            ws.send(message);
            ws.isInitialized = true;
            log.info(`Sent initial ${sources.length} source(s) to client`);
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