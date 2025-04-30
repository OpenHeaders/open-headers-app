// ws-service.js - WebSocket service for communicating with browser extensions
const WebSocket = require('ws');
const https = require('https');
const http = require('http');

/**
 * WebSocket service for communicating with browser extensions
 * Enhanced to support both WS and WSS protocols
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

        // Pre-generated, hardcoded certificate for localhost - key and cert pair
        this.certificates = {
            key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDWAP8xndgTepM3
3vBjgEVIppXva8vPKf0lvZ/iCxAzYyipwfxzdzUPKU3X5+sZgaB1eFbfBoII5OBr
cGKUkCn3vycS8uUkNvGxGR5jJiXlB2EOi2oIsJxX+FR78GxuiLZkDIJ9vBcndN0m
XY9/M75IxQnNxzOo9+SBY0OdNlN3/QhgcffuNhUJuFb6tJU/O9Yd9eG1z0m9ZcMJ
2x1dkXDpMc8+T7miIX0xCz1v+5ib0hwrpg/8QvIKPpPOnOJ/i6yoGQGagVMGvAhH
TcquHw39jeHPl2jYOiCGJDhZuHmRBB9dYVQvzFxJRiX5V1eu5CXr7JfmjMNW7vXw
BDd5YhzDAgMBAAECggEAVgTUuQGZ0wUQJPQwAuQnR1gOZO6ySNR3bTrQXPBg4Sqd
vdH4nmoMIJ67/MR3J+N5Wzm1+DjLQwY2A1L8VPGT9KyV/3TP3WdQrUSFLxwxqKge
B1A7MIbBHMkUTxlIW0A80+JA1XBT8JlEQL3VsMLWB5kZQL6rh3lvlpQkDYcZ9Z4v
68+F1S2LICoS5NgiUQ8j5E1siD1cBUOeMt9tSN7/b+PW7oFCDXSbxDTazEFe4hyt
y3VVLbvoYZWCvi+HasnCnWWY/dFEKPHU2ULiMnTRAOd8V81qbE0uH1t9yBqmyUcK
c7+H3XFGmWDCNjQ5CQ5trMhbPHmmLqKpHZzj7EfG4QKBgQDvpLGc53APBsxfBvS6
mX7n+L+Q6a/UtOvJCCCUUtXGgPIdjJm2tqivSH/YQSJQBl0SQJHuCzEn49giIE35
H/vMwzqzP3dkFuPsYq0N/R9gCFGVIL0ZhZuP5bJfpYkYWGkyAA+nSWsY5bwsGjjK
lmCqQ6qdLYYJvuhKc1JKhCgq2QKBgQDkvfnW7+fTK0hQhEGXM1VIbAVaK83LRZ3n
IxTqArdWJ9UYq1PzQs7a3lZfJuJL7DVyiyHQmAgCdXcVSDpcSMBtBq4r2CYM3o2w
A3jj7vp8JLgikRu409YXfGaOOWbKB4QfOW3BbWvjnZdGjoUr8sEXxXQqj5S+2W32
rGtVACm+OwKBgQCwVyRHx5c5Z2wzRbXCoAGQQxPjn0MmkVlTFGxPWFJl/QAuCcJx
19YTmA8BRFF3JYvkf5pf9khxYUKfTvgbpnGRZQIiNMw3VD9+xyW9KSxBdASFO4ZF
/ZYdcrsLUB3Yd43bkwK1hYBxLJj31DP0OW3JZpsrcU/qDpRAgdA1g2PtYQKBgBYt
p3vMvKZoGsQMuZOuSm+fEKSKN58K5SXwFjxQkjgrnI0GcdRY8LUcK4K5FpSmNJ2S
fdd+GvLyQw4pveNmREdIqGuTjxbB4CYbY4bYjVXxrwyNy4It+2wAiKDcZ3xKdBZv
/UESOjJBZfVG18+CZMFtLNdYS6v1uLNqaLO+nj9/AoGAMJkBBX2hq5WUCMW/hHPy
lJ63KaULHGrJLPE0X1RkG50LKnDirYXZ1iXcYCYnWvE21ZIvAx1qefLLQQJm6IzK
c4kP6jOwCFFYVVGJa2S2xjM6qxy6PpXzEHLYUJAjSxn3SmH0jLaFlUC+pjIpEyUE
3eVXzuGadKfEe1JGNp+GIWc=
-----END PRIVATE KEY-----`,
            cert: `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIUdl8TOP+3VYGDBQcz03TFYMYc7fMwDQYJKoZIhvcNAQEL
BQAwPjELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMSIwIAYDVQQDDBlPcGVuIEhl
YWRlcnMgTG9jYWxob3N0IENBMB4XDTIzMDQyODIwMTU1OVoXDTMzMDQyNTIwMTU1
OVowPjELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMSIwIAYDVQQDDBlPcGVuIEhl
YWRlcnMgTG9jYWxob3N0IENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEA1gD/MZ3YE3qTN97wY4BFSKaV72vLzyn9Jb2f4gsQM2MoqcH8c3c1DylN1+fr
GYGgdXhW3waCCOTga3BilJAp978nEvLlJDbxsRkeYyYl5QdhDotqCLCcV/hUe/Bs
boi2ZAyCfbwXJ3TdJl2PfzO+SMUJzccz6PfkgWNDnTZTd/0IYHH37jYVCbhW+rSV
PzvWHfXhtc9JvWXDCdsdXZFw6THPPk+5oiF9MQs9b/uYm9IcK6YP/ELyCj6Tzpzi
f4usqBkBmoFTBrwIR03Krh8N/Y3hz5do2DoghiQ4Wbh5kQQfXWFUL8xcSUYl+VdX
ruQl6+yX5ozDVu718AQ3eWIcwwIDAQABo1MwUTAdBgNVHQ4EFgQUc3cV39ebpXd2
9WR5zNuv+BuYhpcwHwYDVR0jBBgwFoAUc3cV39ebpXd29WR5zNuv+BuYhpcwDwYD
VR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAFIEF+iJBZswi2mgvTkQj
Dut4TGNTXouFW/GLfhHj29NgWVjHBZQeHMJgEq0SvIPwJALVgJiJpMcGSXg59cKI
j8PM97M4vAM6pkRYJI9BnJ6gHiJSsqFIotMspwKVZTrHTz2sYDMSNZWFAj5YCAsI
SnCLc8S7RrXbjJGQ56PjYFxp8W0xKjgSCvzgAJkXQK8xUFii2q1sYYkXDqJpDvRW
K9kvfHn4jZ8RFmvPQaNXMkHQDG9o3kLVVXF8k8aRphoHfBKAw5LqYRZAWMlGTLOV
QjR4bnJFbZP+vYzKPXMWFcPR23kFwU1LUKqUvrKtZPv3qT64g72gLM7dT22WQC3C
QA==
-----END CERTIFICATE-----`,
            // Updated fingerprint
            fingerprint: "73:77:15:DF:D7:9B:A5:77:76:F5:64:79:CC:DB:AF:F8:1B:98:86:97"
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
            console.log('Initializing WebSocket service with WS and WSS support...');

            // Apply options
            if (options.wsPort) this.wsPort = options.wsPort;
            if (options.wssPort) this.wssPort = options.wssPort;
            if (options.sourceService) this.sourceService = options.sourceService;

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
            console.error('Failed to initialize WebSocket service:', error);
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
            console.log(`WebSocket server (WS) starting on ${this.host}:${this.wsPort}`);

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
                console.log(`WebSocket server (WS) listening on ${this.host}:${this.wsPort}`);
            });
        } catch (error) {
            console.error('Error setting up WS server:', error);
        }
    }

    /**
     * Set up secure WebSocket server (WSS)
     * @private
     */
    _setupWssServer() {
        try {
            console.log(`Secure WebSocket server (WSS) starting on ${this.host}:${this.wssPort}`);

            // Path to certificate files
            const fs = require('fs');
            const path = require('path');

            // Check several possible locations for the certificate files
            const possiblePaths = [
                // Current directory
                path.join(process.cwd(), 'certs'),
                // App directory
                path.join(__dirname, 'certs'),
                // User data directory if available
                this.appDataPath ? path.join(this.appDataPath, 'certs') : null
            ].filter(Boolean);

            let keyPath = null;
            let certPath = null;

            // Find the first location that has both files
            for (const basePath of possiblePaths) {
                const keyFile = path.join(basePath, 'server.key');
                const certFile = path.join(basePath, 'server.cert');

                if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
                    keyPath = keyFile;
                    certPath = certFile;
                    console.log(`Found certificate files in ${basePath}`);
                    break;
                }
            }

            // If no files found, create them
            if (!keyPath || !certPath) {
                console.log('Certificate files not found, attempting to create them...');

                // Create certs directory in current working directory
                const certsDir = path.join(process.cwd(), 'certs');
                if (!fs.existsSync(certsDir)) {
                    fs.mkdirSync(certsDir, { recursive: true });
                }

                // Log the path for debugging
                console.log(`Using certs directory: ${certsDir}`);

                // Use OpenSSL to generate certificates
                const { execSync } = require('child_process');

                try {
                    console.log('Generating private key...');
                    execSync(`openssl genrsa -out ${path.join(certsDir, 'server.key')} 2048`);

                    console.log('Generating self-signed certificate...');
                    execSync(`openssl req -new -x509 -key ${path.join(certsDir, 'server.key')} -out ${path.join(certsDir, 'server.cert')} -days 3650 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`);

                    keyPath = path.join(certsDir, 'server.key');
                    certPath = path.join(certsDir, 'server.cert');

                    console.log('Successfully generated certificate files');
                } catch (execError) {
                    console.error('Failed to generate certificates with OpenSSL:', execError.message);
                    console.log('Certificate generation will need to be done manually');
                    throw new Error('Unable to generate certificate files');
                }
            }

            // Read the key and certificate files
            const key = fs.readFileSync(keyPath);
            const cert = fs.readFileSync(certPath);

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
                console.log(`Secure WebSocket server (WSS) listening on ${this.host}:${this.wssPort}`);

                // Calculate certificate fingerprint
                try {
                    const crypto = require('crypto');
                    const fingerprint = crypto
                        .createHash('sha1')
                        .update(cert)
                        .digest('hex')
                        .match(/.{2}/g)
                        .join(':')
                        .toUpperCase();

                    console.log(`Certificate fingerprint: ${fingerprint}`);

                    // Store the fingerprint for reference
                    this.certificates = {
                        fingerprint: fingerprint,
                        keyPath: keyPath,
                        certPath: certPath
                    };
                } catch (hashError) {
                    console.error('Error calculating certificate fingerprint:', hashError);
                }
            });
        } catch (error) {
            console.error('Error setting up WSS server:', error);
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
            console.log(`${serverType} client connected`);

            // Track client initialization state
            ws.isInitialized = false;

            // Send initial sources to newly connected client
            this._sendSourcesToClient(ws);

            // Handle client disconnection
            ws.on('close', () => {
                console.log(`${serverType} client disconnected`);
            });

            // Handle client errors
            ws.on('error', (error) => {
                console.error(`${serverType} client error:`, error);
            });

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log(`Received message from ${serverType} client:`, data);

                    // Handle specific message types
                    if (data.type === 'requestSources') {
                        this._sendSourcesToClient(ws);
                    }
                } catch (err) {
                    console.error(`Error processing ${serverType} client message:`, err);
                }
            });
        });

        // Handle server errors
        server.on('error', (error) => {
            console.error(`${serverType} server error:`, error);

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
            console.log(`Sent initial ${this.sources.length} source(s) to client`);
        } catch (error) {
            console.error('Error sending sources to client:', error);
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
            console.log(`Broadcasted ${this.sources.length} source(s) to ${clientCount} client(s)`);
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
                    console.log('Closing WS server for restart...');
                    this.wss.close();
                    if (this.httpServer) this.httpServer.close();
                }
                // Wait before restarting
                setTimeout(() => this._setupWsServer(), 1000);
            }
            else if (serverType === 'WSS') {
                if (this.secureWss) {
                    console.log('Closing WSS server for restart...');
                    this.secureWss.close();
                    if (this.httpsServer) this.httpsServer.close();
                }
                // Wait before restarting
                setTimeout(() => this._setupWssServer(), 1000);
            }
        } catch (error) {
            console.error(`Error restarting ${serverType} server:`, error);
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

            console.log('Registered for source service events');
        } catch (error) {
            console.error('Error registering for source service events:', error);
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
            console.error('Error updating and broadcasting sources:', error);
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
                console.log(`WebSocket server (WS) on ${this.host}:${this.wsPort} closed`);
            } catch (error) {
                console.error('Error closing WS server:', error);
            }
        }

        // Close WSS server
        if (this.secureWss) {
            try {
                this.secureWss.close();
                if (this.httpsServer) this.httpsServer.close();
                console.log(`Secure WebSocket server (WSS) on ${this.host}:${this.wssPort} closed`);
            } catch (error) {
                console.error('Error closing WSS server:', error);
            }
        }
    }
}

module.exports = new WebSocketService();