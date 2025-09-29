// ws-service.js - WebSocket service for communicating with browser extensions
const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');
const CertificateGenerator = require('../../utils/certificateGenerator');
const WSNetworkStateHandler = require('./ws-network-state');
const windowsFocusHelper = require('../../main/modules/utils/windowsFocus');
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
        this.rules = {};             // Store unified rules
        this.sourceService = null;
        this.appDataPath = null;     // Will be set during initialization
        this.connectedClients = new Map(); // Track connected clients with their info
        this.clientInitializationLocks = new Map(); // Track client initialization status
        this.clientCleanupInterval = null; // Cleanup interval timer
        this.maxClientInactivity = 5 * 60 * 1000; // 5 minutes
        this.cleanupIntervalTime = 60 * 1000; // Check every minute
        
        // Debounce timer for rules broadcast
        this.rulesBroadcastTimer = null;
        this.lastRulesBroadcast = 0;

        // Certificate info
        this.certificatePaths = {
            keyPath: null,
            certPath: null,
            fingerprint: null
        };

        // Network state handler
        this.networkStateHandler = null;

        // Video capture service
        this.videoCaptureService = null;
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
                    }
                } catch (e) {
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
            
            // Load initial rules and sources
            this._loadInitialData();
            
            // Start periodic client cleanup
            this._startClientCleanup();

            // Initialize network state handler
            this.networkStateHandler = new WSNetworkStateHandler(this);
            
            // Connect to network service if available
            if (options.networkService) {
                this.networkStateHandler.initialize(options.networkService);
            }

            // Initialize video capture service
            this._initializeVideoCaptureService();
            
            // Setup environment change listener for re-broadcasting rules
            this._setupEnvironmentListener();
            
            // Initialize proxy service with current rules and environment variables
            this._initializeProxyService();

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

            // Add error handler for HTTP server
            this.httpServer.on('error', (error) => {
                log.error(`HTTP server error on port ${this.wsPort}:`, error);
                if (error.code === 'EADDRINUSE') {
                    log.error(`Port ${this.wsPort} is already in use`);
                }
            });

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
    async _setupWssServer() {
        try {
            log.info(`Secure WebSocket server (WSS) starting on ${this.host}:${this.wssPort}`);

            // Ensure certificate files exist or create them
            const certInfo = await this._ensureCertificatesExist();
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

            // Add error handler for HTTPS server
            this.httpsServer.on('error', (error) => {
                log.error(`HTTPS server error on port ${this.wssPort}:`, error);
                if (error.code === 'EADDRINUSE') {
                    log.error(`Port ${this.wssPort} is already in use`);
                }
            });

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
     * @returns {Promise<Object>} - Status object with success flag and error message if applicable
     */
    async _ensureCertificatesExist() {
        try {
            // Create certificates directory if needed
            const certsDir = this._getCertificatesDirectory();
            if (!fs.existsSync(certsDir)) {
                fs.mkdirSync(certsDir, { recursive: true });
                log.info(`Created certificates directory: ${certsDir}`);
            }

            const keyPath = path.join(certsDir, 'server.key');
            const certPath = path.join(certsDir, 'server.cert');
            const certPathAlt = path.join(certsDir, 'server.crt');

            // Check if certificates already exist (try both .cert and .crt extensions)
            if (fs.existsSync(keyPath) && (fs.existsSync(certPath) || fs.existsSync(certPathAlt))) {
                log.info('Using existing certificate files');
                
                // Use whichever certificate file exists
                const actualCertPath = fs.existsSync(certPath) ? certPath : certPathAlt;

                // Calculate and store fingerprint
                const cert = fs.readFileSync(actualCertPath);
                const fingerprint = this._calculateCertFingerprint(cert);

                // Store the paths
                this.certificatePaths = {
                    keyPath,
                    certPath: actualCertPath,
                    fingerprint
                };

                return { success: true };
            }

            // Certificates don't exist, generate them
            log.info('Certificate files not found, generating new ones...');

            try {
                // Generate certificates using cross-platform method
                await this._generateCertificates(certsDir, keyPath, certPath);

                // After generation, check which certificate file actually exists
                const actualCertPath = fs.existsSync(certPath) ? certPath : certPathAlt;
                
                // Calculate and store fingerprint
                const cert = fs.readFileSync(actualCertPath);
                const fingerprint = this._calculateCertFingerprint(cert);

                // Store the paths
                this.certificatePaths = {
                    keyPath,
                    certPath: actualCertPath,
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
     * Generate SSL certificates using cross-platform method
     * @private
     * @param {string} certsDir - Directory to store certificates
     * @param {string} keyPath - Path for the key file
     * @param {string} certPath - Path for the certificate file
     */
    async _generateCertificates(certsDir, keyPath, certPath) {
        try {
            // First try OpenSSL if available (for compatibility)
            if (this._isOpenSSLAvailable()) {
                try {
                    log.info('OpenSSL detected, using it for certificate generation...');
                    // Generate private key
                    execSync(`openssl genrsa -out "${keyPath}" 2048`);
                    // Generate self-signed certificate
                    execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 397 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`);
                    log.info('Successfully generated certificate files with OpenSSL');
                    return;
                } catch (opensslError) {
                    log.warn('OpenSSL command failed, falling back to Node.js implementation:', opensslError.message);
                }
            }

            // Use cross-platform certificate generator
            log.info('Using cross-platform certificate generator...');
            const generator = new CertificateGenerator(log);
            const result = await generator.generateCertificates(certsDir);
            
            if (!result || !result.keyPath || !result.certPath) {
                throw new Error('Certificate generation failed');
            }

            log.info('Successfully generated certificate files');
        } catch (error) {
            log.error('Failed to generate certificates:', error.message);
            throw error;
        }
    }

    /**
     * Check if OpenSSL is available on the system
     * @private
     * @returns {boolean}
     */
    _isOpenSSLAvailable() {
        try {
            execSync('openssl version', { stdio: 'ignore' });
            return true;
        } catch (error) {
            return false;
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
     * Load initial data (rules and sources) from storage
     * @private
     */
    async _loadInitialData() {
        try {
            if (!this.appDataPath) return;
            
            // Try to load data from the active workspace
            // First, try to get the active workspace ID from workspaces.json
            const workspacesPath = path.join(this.appDataPath, 'workspaces.json');
            let activeWorkspaceId = 'default-personal'; // Default fallback
            
            try {
                if (fs.existsSync(workspacesPath)) {
                    const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                    const workspaces = JSON.parse(workspacesData);
                    if (workspaces.activeWorkspaceId) {
                        activeWorkspaceId = workspaces.activeWorkspaceId;
                    }
                }
            } catch (error) {
                log.warn('Could not read active workspace, using default:', error.message);
            }
            
            // Load rules from the workspace-specific directory
            const rulesPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'rules.json');
            
            if (fs.existsSync(rulesPath)) {
                const rulesData = await fs.promises.readFile(rulesPath, 'utf8');
                const rulesStorage = JSON.parse(rulesData);
                this.rules = rulesStorage.rules || {};
                log.info(`Loaded ${Object.keys(this.rules).length} rule types from workspace`);
            } else {
                log.info(`No rules file found at ${rulesPath}, starting with empty rules`);
                this.rules = {};
            }
            
            // Load sources from the workspace-specific directory
            const sourcesPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
            
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                this.sources = JSON.parse(sourcesData) || [];
                log.info(`Loaded ${this.sources.length} sources from workspace`);
            } else {
                log.info(`No sources file found at ${sourcesPath}, starting with empty sources`);
                this.sources = [];
            }
        } catch (error) {
            log.error('Error loading initial data:', error);
            this.rules = {};
            this.sources = [];
        }
    }
    
    /**
     * Configure WebSocket server events
     * @private
     * @param {WebSocket.Server} server - The WebSocket server to configure
     * @param {string} serverType - Server type identifier (WS or WSS)
     */
    _configureWebSocketServer(server, serverType) {
        server.on('connection', (ws, request) => {
            log.info(`${serverType} client connected`);

            // Generate unique client ID
            const clientId = `${serverType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Extract browser info from headers
            const userAgent = request.headers['user-agent'] || '';
            const browserInfo = this._parseBrowserInfo(userAgent);
            
            // Store client info
            const clientInfo = {
                id: clientId,
                connectionType: serverType,
                browser: browserInfo.browser,
                browserVersion: browserInfo.version,
                platform: browserInfo.platform,
                userAgent: userAgent,
                connectedAt: new Date(),
                lastActivity: new Date()
            };
            
            this.connectedClients.set(clientId, clientInfo);
            ws.clientId = clientId;

            // Initialize client with proper locking
            this._initializeClient(ws, clientId);
            
            // Broadcast connection status update
            this._broadcastConnectionStatus();

            // Handle client disconnection
            ws.on('close', () => {
                log.info(`${serverType} client disconnected`);
                this.connectedClients.delete(clientId);
                this.clientInitializationLocks.delete(clientId);
                this._broadcastConnectionStatus();
            });

            // Handle client errors
            ws.on('error', (error) => {
                log.error(`${serverType} client error:`, error);
            });

            // Handle pong messages for heartbeat
            ws.on('pong', () => {
                ws.isAlive = true;
                // Update last activity
                if (this.connectedClients.has(clientId)) {
                    this.connectedClients.get(clientId).lastActivity = new Date();
                }
            });

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    
                    // Update last activity
                    if (this.connectedClients.has(clientId)) {
                        this.connectedClients.get(clientId).lastActivity = new Date();
                    }

                    // Handle browser identification if provided
                    if (data.type === 'browserInfo' && data.browser) {
                        const client = this.connectedClients.get(clientId);
                        if (client) {
                            client.browser = data.browser;
                            client.browserVersion = data.version || client.browserVersion;
                            client.extensionVersion = data.extensionVersion;
                        }
                    }

                    // Handle specific message types
                    if (data.type === 'requestSources') {
                        this._sendSourcesToClient(ws);
                    } else if (data.type === 'requestRules') {
                        this._sendRulesToClient(ws);
                    } else if (data.type === 'getVideoRecordingState') {
                        // Handle request for video recording state
                        this._sendVideoRecordingState(ws);
                    } else if (data.type === 'getRecordingHotkey') {
                        // Handle request for recording hotkey
                        this._sendRecordingHotkey(ws);
                    } else if (data.type === 'toggleRule') {
                        // Handle toggle rule request from extension (without focusing app)
                        this._handleToggleRule(data.ruleId, data.enabled);
                    } else if (data.type === 'toggleAllRules') {
                        // Handle toggle all rules request from extension
                        this._handleToggleAllRules(data.ruleIds, data.enabled);
                    } else if (data.type === 'saveRecording' || data.type === 'saveWorkflow') {
                        // Handle workflow from extension (support both old and new message types)
                        log.info(`Received ${data.type} request from extension`);
                        
                        // Preprocess to ensure consistent record ID
                        if (!data.recording?.record?.metadata?.recordId) {
                            // Generate ID if not provided
                            const generatedId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            if (!data.recording.record) {
                                data.recording.record = {};
                            }
                            if (!data.recording.record.metadata) {
                                data.recording.record.metadata = {};
                            }
                            data.recording.record.metadata.recordId = generatedId;
                            log.info(`Generated record ID: ${generatedId}`);
                        }
                        
                        const recordId = data.recording.record.metadata.recordId;
                        
                        // Immediately navigate to records tab to show processing state
                        log.info('Immediately navigating to records tab for:', recordId);
                        this._handleFocusApp({
                            tab: 'record-viewer',
                            action: 'highlight',
                            itemId: recordId
                        });
                        
                        // Immediately notify UI that recording is being processed
                        this._notifyRecordingProcessing(recordId, {
                            url: data.recording.record.metadata.url || 'Unknown',
                            timestamp: data.recording.record.metadata.timestamp || Date.now(),
                            eventCount: data.recording.record.events?.length || 0
                        });
                        
                        this._handleSaveRecording(data.recording).then(result => {
                            log.info('Workflow saved successfully:', result.recordId);
                            
                            // Send success response back to extension
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'saveRecordingResponse',
                                    success: true,
                                    recordId: result.recordId
                                }));
                            }
                        }).catch(error => {
                            log.error('Error handling save workflow:', error);
                            
                            // Send error response back to extension
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'saveRecordingResponse',
                                    success: false,
                                    error: error.message
                                }));
                            }
                        });
                    } else if (data.type === 'focusApp') {
                        // Handle app focus request from extension
                        this._handleFocusApp(data.navigation);
                    } else if (data.type === 'startSyncRecording') {
                        // Handle synchronized video recording start
                        log.info('Received startSyncRecording request:', data.data);
                        this._handleStartSyncRecording(ws, data.data);
                    } else if (data.type === 'stopSyncRecording') {
                        // Handle synchronized video recording stop
                        log.info('Received stopSyncRecording request:', data.data);
                        this._handleStopSyncRecording(ws, data.data);
                    } else if (data.type === 'recordingStateSync') {
                        // Handle recording state synchronization
                        log.info('Received recordingStateSync:', data.data);
                        this._handleRecordingStateSync(ws, data.data);
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
     * @param {Array|Object} sources - Array of source objects or message object
     */
    updateSources(sources) {
        // Check if this is a rules update
        if (sources && typeof sources === 'object' && sources.type === 'rules-update') {
            // This is a rules update - handle the proper data structure
            if (sources.data && sources.data.rules) {
                // Extract rules from the export data structure
                this.rules = sources.data.rules;
                this._broadcastRules();
            }
            return;
        }
        
        // Otherwise, it's a regular sources update
        log.info(`Sources updated: ${sources.length} sources received`);
        
        // Store the updated sources
        this.sources = sources;
        
        // Sync proxy service with new sources
        this._syncProxyService();
        
        // Immediately broadcast to all connected clients
        this._broadcastSources();
        
        // Also broadcast rules to update dynamic header values
        if (this.rules && Object.keys(this.rules).length > 0) {
            this._broadcastRules();
        }
    }
    
    /**
     * Update rules and broadcast to all clients
     * @param {Object} rules - Rules object with different rule types
     */
    updateRules(rules) {
        this.rules = rules;
        this._broadcastRules();
    }
    
    /**
     * Handle workspace switch - reload rules and sources from new workspace
     * @param {string} workspaceId - The workspace ID to switch to
     */
    async onWorkspaceSwitch(workspaceId) {
        try {
            log.info(`WebSocket service switching to workspace: ${workspaceId}`);
            
            // Load rules from the new workspace
            const rulesPath = path.join(this.appDataPath, 'workspaces', workspaceId, 'rules.json');
            
            if (fs.existsSync(rulesPath)) {
                const rulesData = await fs.promises.readFile(rulesPath, 'utf8');
                const rulesStorage = JSON.parse(rulesData);
                this.rules = rulesStorage.rules || {};
                log.info(`Loaded ${Object.keys(this.rules).length} rule types from workspace ${workspaceId}`);
                
                // Sync proxy service with new rules
                this._syncProxyService();
                
                // Broadcast the updated rules to all connected clients
                this._broadcastRules();
            } else {
                log.info(`No rules found for workspace ${workspaceId}, using empty rules`);
                this.rules = {};
                this._broadcastRules();
            }
            
            // Load sources from the new workspace
            const sourcesPath = path.join(this.appDataPath, 'workspaces', workspaceId, 'sources.json');
            
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                this.sources = JSON.parse(sourcesData) || [];
                log.info(`Loaded ${this.sources.length} sources from workspace ${workspaceId}`);
                
                // Sync proxy service with new sources
                this._syncProxyService();
                
                // Broadcast the updated sources to all connected clients
                this._broadcastSources();
            } else {
                log.info(`No sources found for workspace ${workspaceId}, using empty sources`);
                this.sources = [];
                this._broadcastSources();
            }
        } catch (error) {
            log.error(`Error loading data for workspace ${workspaceId}:`, error);
            this.rules = {};
            this.sources = [];
            this._broadcastRules();
            this._broadcastSources();
        }
    }

    /**
     * Send sources to a specific client
     * @private
     * @param {WebSocket} ws - The WebSocket client
     */
    async _sendSourcesToClient(ws) {
        return new Promise(async (resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }

            try {
                // For Git workspaces, reload sources from disk to get latest content
                // This ensures we send the most up-to-date content that may have been
                // populated after environment import
                if (this.appDataPath) {
                    try {
                        // Get active workspace ID
                        const workspacesPath = path.join(this.appDataPath, 'workspaces.json');
                        let activeWorkspaceId = 'default-personal';
                        
                        if (fs.existsSync(workspacesPath)) {
                            const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                            const workspaces = JSON.parse(workspacesData);
                            if (workspaces.activeWorkspaceId) {
                                activeWorkspaceId = workspaces.activeWorkspaceId;
                            }
                        }
                        
                        // Check if it's a git workspace
                        const workspaceList = JSON.parse(await fs.promises.readFile(workspacesPath, 'utf8')).workspaces || [];
                        const activeWorkspace = workspaceList.find(w => w.id === activeWorkspaceId);
                        
                        if (activeWorkspace && (activeWorkspace.type === 'git' || activeWorkspace.type === 'team')) {
                            // Reload sources from disk for git workspaces
                            const sourcesPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
                            if (fs.existsSync(sourcesPath)) {
                                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                                const freshSources = JSON.parse(sourcesData) || [];
                                log.info(`Reloaded ${freshSources.length} sources from disk for git workspace ${activeWorkspaceId}`);
                                // Update our sources with fresh data
                                this.sources = freshSources;
                            }
                        }
                    } catch (error) {
                        log.warn('Failed to reload sources from disk:', error);
                        // Continue with existing sources
                    }
                }
                
                
                const message = JSON.stringify({
                    type: 'sourcesInitial',
                    sources: this.sources
                });

                ws.send(message, (error) => {
                    if (error) {
                        log.error('Error sending sources to client:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
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

    }
    
    /**
     * Populate dynamic header values from sources and resolve environment variables
     * @private
     * @param {Object} rules - Rules object to populate
     * @returns {Object} Rules with populated dynamic values and resolved env vars
     */
    _populateDynamicHeaderValues(rules) {
        // Create a deep copy to avoid modifying the original
        const populatedRules = JSON.parse(JSON.stringify(rules));
        
        // Get environment variables from workspace files
        let environmentVariables = null;
        try {
            environmentVariables = this._loadEnvironmentVariables();
        } catch (error) {
            log.warn('Failed to load environment variables:', error.message);
        }
        
        // Only process header rules
        if (populatedRules.header && Array.isArray(populatedRules.header)) {
            populatedRules.header = populatedRules.header.map(rule => {
                let processedRule = { ...rule };
                
                
                // First, resolve environment variables if the rule has any
                if (rule.hasEnvVars && environmentVariables) {
                    try {
                        // Check if all required variables are available
                        const missingVars = rule.envVars ? rule.envVars.filter(varName => {
                            const value = environmentVariables[varName];
                            return value === undefined || value === null || value === '';
                        }) : [];
                        
                        if (missingVars.length > 0) {
                            // Mark rule as waiting for dependencies
                            processedRule.activationState = 'waiting_for_deps';
                            processedRule.missingDependencies = missingVars;
                            
                            // Don't send this rule to the extension if it's missing dependencies
                            return null;
                        }
                        
                        // Resolve environment variables in all fields
                        if (rule.headerName && rule.headerName.includes('{{')) {
                            const resolved = this._resolveTemplate(rule.headerName, environmentVariables);
                            processedRule.headerName = resolved;
                        }
                        
                        // For static values
                        if (!rule.isDynamic && rule.headerValue && rule.headerValue.includes('{{')) {
                            const resolved = this._resolveTemplate(rule.headerValue, environmentVariables);
                            processedRule.headerValue = resolved;
                        }
                        
                        // For dynamic values - resolve prefix and suffix
                        if (rule.isDynamic) {
                            if (rule.prefix && rule.prefix.includes('{{')) {
                                const resolved = this._resolveTemplate(rule.prefix, environmentVariables);
                                processedRule.prefix = resolved;
                            }
                            if (rule.suffix && rule.suffix.includes('{{')) {
                                const resolved = this._resolveTemplate(rule.suffix, environmentVariables);
                                processedRule.suffix = resolved;
                            }
                        }
                        
                        // Resolve domains and split comma-separated lists
                        if (rule.domains && Array.isArray(rule.domains)) {
                            processedRule.domains = rule.domains.flatMap(domain => {
                                if (domain && domain.includes('{{')) {
                                    const resolved = this._resolveTemplate(domain, environmentVariables);
                                    // Split comma-separated domains if env var resolved to multiple domains
                                    if (resolved && resolved.includes(',')) {
                                        return resolved.split(',').map(d => d.trim()).filter(d => d);
                                    }
                                    return resolved;
                                }
                                return domain;
                            });
                        }
                        
                        // Clear env-related flags after resolution
                        delete processedRule.hasEnvVars;
                        delete processedRule.envVars;
                        processedRule.activationState = 'active';
                        
                    } catch (error) {
                        log.error(`Error resolving env vars for rule "${rule.headerName}":`, error);
                        // Keep the rule but mark it as having an error
                        processedRule.activationState = 'error';
                    }
                }
                
                // Then handle dynamic source values (existing logic)
                if (processedRule.isDynamic && processedRule.sourceId) {
                    // Find the matching source
                    const source = this.sources.find(s => s.sourceId === processedRule.sourceId.toString());
                    
                    if (source && source.sourceContent) {
                        // Combine prefix + source content + suffix
                        const prefix = processedRule.prefix || '';
                        const suffix = processedRule.suffix || '';
                        processedRule.headerValue = prefix + source.sourceContent + suffix;
                    }
                }
                
                return processedRule;
            }).filter(rule => rule !== null); // Remove rules that are waiting for dependencies
        }
        
        return populatedRules;
    }

    /**
     * Send rules to a specific client
     * @private
     * @param {WebSocket} ws - The WebSocket client
     */
    async _sendRulesToClient(ws) {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }
            
            try {
                // Populate dynamic header values before sending
                const populatedRules = this._populateDynamicHeaderValues(this.rules);
                
                const message = JSON.stringify({
                    type: 'rules-update',
                    data: {
                        rules: populatedRules,
                        version: '3.0.0'
                    }
                });
                
                ws.send(message, (error) => {
                    if (error) {
                        log.error('Error sending rules to client:', error);
                        reject(error);
                    } else {
                        const totalRules = Object.values(populatedRules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Send video recording state to specific client (used during initialization)
     * @private
     * @param {WebSocket} ws - WebSocket client
     */
    async _sendVideoRecordingState(ws) {
        try {
            // Get current settings
            const { app } = require('electron');
            const fs = require('fs').promises;
            const path = require('path');
            
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            let settings = {};
            
            try {
                const settingsData = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(settingsData);
            } catch (error) {
                // Settings file might not exist yet
                log.debug('Settings file not found, using defaults');
            }
            
            const videoRecordingEnabled = settings.videoRecording || false;
            
            const message = JSON.stringify({
                type: 'videoRecordingStateChanged',
                enabled: videoRecordingEnabled
            });
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(message);
                log.debug('Sent video recording state to client:', videoRecordingEnabled);
            }
        } catch (error) {
            log.error('Error sending video recording state:', error);
            // Non-critical error, don't throw
        }
    }
    
    /**
     * Initialize client with proper locking to prevent race conditions
     * @private
     * @param {WebSocket} ws - WebSocket client
     * @param {string} clientId - Unique client identifier
     */
    async _initializeClient(ws, clientId) {
        // Check if already initializing or initialized
        const existingLock = this.clientInitializationLocks.get(clientId);
        if (existingLock) {
            if (existingLock.status === 'initializing') {
                log.warn(`Client ${clientId} is already initializing, waiting...`);
                await existingLock.promise;
                return;
            } else if (existingLock.status === 'initialized') {
                log.info(`Client ${clientId} is already initialized`);
                return;
            }
        }

        // Create initialization promise
        let resolveInit, rejectInit;
        const initPromise = new Promise((resolve, reject) => {
            resolveInit = resolve;
            rejectInit = reject;
        });

        // Set initialization lock
        this.clientInitializationLocks.set(clientId, {
            status: 'initializing',
            promise: initPromise
        });

        try {
            log.info(`Initializing client ${clientId}`);
            
            // Send initial data with proper error handling
            await Promise.all([
                this._sendSourcesToClient(ws),
                this._sendRulesToClient(ws),
                this._sendVideoRecordingState(ws)
            ]);
            
            // Send initial network state
            if (this.networkStateHandler) {
                this.networkStateHandler.sendInitialState(ws);
            }
            
            // Mark as initialized
            ws.isInitialized = true;
            this.clientInitializationLocks.set(clientId, {
                status: 'initialized',
                promise: null
            });
            
            log.info(`Client ${clientId} initialized successfully`);
            resolveInit(true);
        } catch (error) {
            log.error(`Failed to initialize client ${clientId}:`, error);
            this.clientInitializationLocks.delete(clientId);
            rejectInit(error);
        }
    }
    
    // Removed _handleToggleRuleEnabled - toggle functionality moved to desktop app only
    
    /**
     * Broadcast video recording state to all connected clients
     * @param {boolean} enabled - Whether video recording is enabled
     */
    broadcastVideoRecordingState(enabled) {
        const message = JSON.stringify({
            type: 'videoRecordingStateChanged',
            enabled: enabled
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
        
        log.info(`Broadcast video recording state (${enabled}) to ${clientCount} client(s)`);
    }
    
    /**
     * Send recording hotkey to client
     * @private
     * @param {WebSocket} ws - WebSocket client
     */
    async _sendRecordingHotkey(ws) {
        try {
            // Get current settings
            const { app } = require('electron');
            const fs = require('fs').promises;
            const path = require('path');
            
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            let settings = {};
            
            try {
                const settingsData = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(settingsData);
            } catch (error) {
                // Settings file might not exist yet
                log.debug('Settings file not found, using defaults');
            }
            
            // Get the recording hotkey (default: CommandOrControl+Shift+E)
            const recordingHotkey = settings.recordingHotkey || 'CommandOrControl+Shift+E';
            // Get the enabled state (default: true for backward compatibility)
            const recordingHotkeyEnabled = settings.recordingHotkeyEnabled !== undefined ? settings.recordingHotkeyEnabled : true;
            
            // Send the hotkey and enabled state to the client
            ws.send(JSON.stringify({
                type: 'recordingHotkeyResponse',
                hotkey: recordingHotkey,
                enabled: recordingHotkeyEnabled
            }));
            
            log.debug('Sent recording hotkey to client:', recordingHotkey, 'enabled:', recordingHotkeyEnabled);
        } catch (error) {
            log.error('Failed to send recording hotkey:', error);
        }
    }
    
    /**
     * Broadcast recording hotkey change to all connected extensions
     * @param {string} hotkey - The new hotkey
     * @param {boolean} enabled - Whether the hotkey is enabled
     */
    broadcastRecordingHotkeyChange(hotkey, enabled) {
        try {
            const message = JSON.stringify({
                type: 'recordingHotkeyChanged',
                hotkey: hotkey,
                enabled: enabled !== undefined ? enabled : true
            });
            
            let clientCount = 0;
            
            // Function to send to all clients of a server
            const sendToAllClients = (server) => {
                if (!server) return 0;
                
                let count = 0;
                server.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            client.send(message);
                            count++;
                        } catch (error) {
                            log.error('Failed to send hotkey change to client:', error);
                        }
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
            
            log.info(`Broadcasted recording hotkey change to ${clientCount} extensions:`, hotkey);
        } catch (error) {
            log.error('Failed to broadcast recording hotkey change:', error);
        }
    }
    
    /**
     * Notify UI that a recording is being processed
     * @private
     * @param {string} recordId - Temporary or final record ID
     * @param {Object} metadata - Basic metadata about the recording
     */
    _notifyRecordingProcessing(recordId, metadata) {
        try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            
            const processingNotification = {
                id: recordId,
                status: 'processing',
                timestamp: metadata.timestamp,
                url: metadata.url,
                eventCount: metadata.eventCount,
                duration: 0, // Will be updated when processing completes
                size: 0, // Will be updated when processing completes
                source: 'extension',
                hasVideo: false,
                hasProcessedVersion: false
            };
            
            windows.forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('recording-processing', processingNotification);
                    log.info('Sent recording-processing event to renderer');
                }
            });
        } catch (error) {
            log.error('Failed to notify recording processing:', error);
        }
    }

    /**
     * Notify UI of recording processing progress
     * @private
     * @param {string} recordId - Record ID
     * @param {string} stage - Processing stage (preprocessing, prefetching, saving, complete)
     * @param {number} progress - Progress percentage (0-100)
     * @param {Object} details - Additional details about the progress
     */
    _notifyRecordingProgress(recordId, stage, progress, details = {}) {
        try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            
            windows.forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('recording-progress', {
                        recordId,
                        stage,
                        progress,
                        details
                    });
                }
            });
        } catch (error) {
            log.error('Failed to notify recording progress:', error);
        }
    }

    /**
     * Handle save recording from browser extension
     * @private
     * @param {Object} recordingData - The recording data from the extension
     */
    async _handleSaveRecording(recordingData) {
        try {
            const { app } = require('electron');
            const fs = require('fs').promises;
            const path = require('path');
            const { preprocessRecordingForSave } = require('./utils/recordingPreprocessor');
            
            const recordingsPath = path.join(app.getPath('userData'), 'recordings');
            await fs.mkdir(recordingsPath, { recursive: true });
            
            // Use the recording ID from the extension if provided, otherwise generate new one
            const originalRecordId = recordingData.record?.metadata?.recordId;
            const recordId = originalRecordId || `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            log.info(`Saving recording - Using ID: ${recordId}, Original ID: ${originalRecordId}`);
            
            // Emit processing progress update with event count
            this._notifyRecordingProgress(recordId, 'preprocessing', 0, {
                eventCount: recordingData.record?.events?.length || 0
            });
            
            // Update the record ID in the data to match our generated one
            if (recordingData.record?.metadata) {
                recordingData.record.metadata.recordId = recordId;
            }
            
            // Create subdirectory for this recording
            const recordingDir = path.join(recordingsPath, recordId);
            await fs.mkdir(recordingDir, { recursive: true });
            
            // Preprocess the recording FIRST
            let processedRecordingData;
            let hasProcessedVersion = false;
            
            try {
                log.info(`Preprocessing recording ${recordId} for optimized playback`);
                this._notifyRecordingProgress(recordId, 'preprocessing', 10, {
                    eventCount: recordingData.record?.events?.length || 0
                });
                
                // Get proxy status to check if it's running
                let proxyPort = null;
                try {
                    const proxyService = require('../proxy/ProxyService');
                    if (proxyService && proxyService.isRunning) {
                        proxyPort = proxyService.port;
                        log.info(`Proxy is running on port ${proxyPort}, will prefetch resources`);
                        
                        // Log proxy rules status for debugging
                        const proxyStatus = proxyService.getStatus();
                        log.info(`Proxy has ${proxyStatus.rulesCount} header rules and ${proxyStatus.sourcesCount} sources configured`);
                    } else {
                        log.info('Proxy is not running, skipping resource prefetch');
                    }
                } catch (error) {
                    log.warn('Could not check proxy status:', error.message);
                }
                
                // Create progress callback for preprocessing and prefetching
                const onProgress = (stage, progress, details) => {
                    if (stage === 'preprocessing') {
                        // Preprocessing progress: 10-25%
                        const overallProgress = 10 + Math.round(progress * 0.15);
                        this._notifyRecordingProgress(recordId, 'preprocessing', overallProgress, {
                            eventCount: recordingData.record?.events?.length || 0,
                            ...details
                        });
                    } else if (stage === 'prefetching') {
                        // Prefetching progress: 25-75%
                        const overallProgress = 25 + Math.round(progress * 0.5);
                        this._notifyRecordingProgress(recordId, 'prefetching', overallProgress, details);
                    }
                };
                
                processedRecordingData = await preprocessRecordingForSave(recordingData, {
                    proxyPort,
                    onProgress
                });
                hasProcessedVersion = true;
                
                this._notifyRecordingProgress(recordId, 'saving', 75, {
                    eventCount: recordingData.record?.events?.length || 0
                });
                log.info(`Successfully preprocessed recording ${recordId}`);
            } catch (preprocessError) {
                log.error('Failed to preprocess recording:', preprocessError);
                this._notifyRecordingProgress(recordId, 'error', 0);
                throw new Error(`Preprocessing failed: ${preprocessError.message}`);
            }
            
            // Save both original and processed recordings (75-90%)
            this._notifyRecordingProgress(recordId, 'saving', 80);
            
            // Save original recording first (for debugging and future reprocessing)
            const originalPath = path.join(recordingDir, 'record-original.json');
            await atomicWriter.writeJson(originalPath, recordingData);
            log.info(`Saved original recording ${recordId}`);
            
            this._notifyRecordingProgress(recordId, 'saving', 85);
            
            // Save processed recording
            const recordPath = path.join(recordingDir, 'record-processed.json');
            await atomicWriter.writeJson(recordPath, processedRecordingData);
            log.info(`Saved processed recording ${recordId}`);
            
            this._notifyRecordingProgress(recordId, 'saving', 90);
            
            // Check if video recording exists for this recording ID
            let hasVideo = false;
            const videoMetaPath = path.join(recordingsPath, recordId, 'video-metadata.json');
            try {
                await fs.access(videoMetaPath);
                hasVideo = true;
                log.info(`Found existing video recording for ${recordId}`);
            } catch (error) {
                // No video metadata found
            }
            
            // Save metadata separately for quick listing
            const metadata = {
                id: recordId,
                timestamp: recordingData.record?.metadata?.timestamp || Date.now(),
                url: recordingData.record?.metadata?.url || 'Unknown',
                duration: recordingData.record?.metadata?.duration || 0,
                eventCount: recordingData.record?.events?.length || 0,
                size: Buffer.byteLength(JSON.stringify(processedRecordingData)),
                originalSize: Buffer.byteLength(JSON.stringify(recordingData)),
                source: 'extension',
                metadata: recordingData.record?.metadata,
                hasVideo: hasVideo,
                hasProcessedVersion: hasProcessedVersion,
                hasOriginalVersion: true
            };
            
            const metaPath = path.join(recordingsPath, `${recordId}.meta.json`);
            await atomicWriter.writeJson(metaPath, metadata, { pretty: true });
            
            // Notify that processing is complete
            this._notifyRecordingProgress(recordId, 'complete', 100);
            
            // Notify renderer that a new recording was received
            try {
                const { BrowserWindow } = require('electron');
                const windows = BrowserWindow.getAllWindows();
                windows.forEach(window => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.send('recording-received', metadata);
                        log.info('Sent recording-received event to renderer');
                    }
                });
            } catch (error) {
                log.error('Failed to notify renderer:', error);
            }
            
            // Mark as complete
            this._notifyRecordingProgress(recordId, 'complete', 100);
            
            log.info(`Recording saved successfully with ID: ${recordId}`);
            return { success: true, recordId: recordId, metadata };
        } catch (error) {
            log.error('Error saving recording:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Handle toggle rule request from extension (without focusing app)
     * @private
     * @param {string} ruleId - The rule ID to toggle
     * @param {boolean} enabled - The new enabled state
     */
    async _handleToggleRule(ruleId, enabled) {
        try {
            // Make sure we have rules
            if (!this.rules || !this.rules.header) {
                log.error('No header rules available to toggle');
                return;
            }
            
            // Find and toggle the rule (compare as strings to handle type mismatches)
            let ruleFound = false;
            const updatedHeaderRules = this.rules.header.map(rule => {
                if (String(rule.id) === String(ruleId)) {
                    ruleFound = true;
                    return {
                        ...rule,
                        isEnabled: enabled,
                        updatedAt: new Date().toISOString()
                    };
                }
                return rule;
            });
            
            if (!ruleFound) {
                log.error(`Rule ${ruleId} not found`);
                return;
            }
            
            // Update the rules in memory
            this.rules.header = updatedHeaderRules;
            
            // Save to disk using the existing rules structure functions
            if (this.appDataPath) {
                try {
                    // Get active workspace ID
                    const workspacesPath = path.join(this.appDataPath, 'workspaces.json');
                    let activeWorkspaceId = 'default-personal';
                    
                    if (fs.existsSync(workspacesPath)) {
                        const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                        const workspaces = JSON.parse(workspacesData);
                        if (workspaces.activeWorkspaceId) {
                            activeWorkspaceId = workspaces.activeWorkspaceId;
                        }
                    }
                    
                    const rulesPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'rules.json');
                    
                    // Load existing rules storage to preserve structure
                    let rulesStorage;
                    try {
                        const existingData = await fs.promises.readFile(rulesPath, 'utf8');
                        rulesStorage = JSON.parse(existingData);
                    } catch (e) {
                        // If file doesn't exist, use the initial loaded rules structure
                        rulesStorage = {
                            version: '3.0.0',
                            rules: this.rules,
                            metadata: {}
                        };
                    }
                    
                    // Update with our modified rules
                    rulesStorage.rules = this.rules;
                    
                    // Update metadata using the same logic as HeaderRules component
                    rulesStorage.metadata = rulesStorage.metadata || {};
                    rulesStorage.metadata.totalRules = Object.values(this.rules)
                        .reduce((sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0), 0);
                    rulesStorage.metadata.lastUpdated = new Date().toISOString();
                    
                    await atomicWriter.writeJson(rulesPath, rulesStorage, { pretty: true });
                    log.info(`Rules persisted to disk for workspace ${activeWorkspaceId}`);
                } catch (error) {
                    log.error('Failed to persist rules to disk:', error);
                }
            }
            
            // Broadcast the updated rules to all connected clients (extensions)
            this._broadcastRules();
            
            // Notify the desktop app's UI to reload rules
            // The HeaderRules component listens for 'rules-updated' window event
            try {
                const { BrowserWindow } = require('electron');
                const windows = BrowserWindow.getAllWindows();
                windows.forEach(window => {
                    if (window && !window.isDestroyed()) {
                        // Execute JavaScript to dispatch the event that HeaderRules listens for
                        const rulesData = {
                            rules: {
                                header: this.rules.header || []
                            },
                            metadata: {
                                totalRules: this.rules.header ? this.rules.header.length : 0,
                                lastUpdated: new Date().toISOString()
                            },
                            version: '3.0.0'
                        };
                        
                        window.webContents.executeJavaScript(`
                            window.dispatchEvent(new CustomEvent('rules-updated', { 
                                detail: { 
                                    rules: ${JSON.stringify(rulesData)}
                                }
                            }));
                        `).catch(err => {
                            log.error('Failed to dispatch rules-updated event:', err);
                        });
                    }
                });
            } catch (error) {
                log.error('Failed to notify main window:', error);
            }
            
            log.info(`Successfully toggled rule ${ruleId} to ${enabled}`);
        } catch (error) {
            log.error('Error handling toggle rule:', error);
        }
    }
    
    /**
     * Handle toggle all rules request from extension
     * @private
     * @param {Array} ruleIds - Array of rule IDs to toggle
     * @param {boolean} enabled - The new enabled state for all rules
     */
    async _handleToggleAllRules(ruleIds, enabled) {
        try {
            log.info(`Handling toggle all rules request: ${ruleIds.length} rules -> ${enabled}`);
            
            // Make sure we have rules
            if (!this.rules || !this.rules.header) {
                log.error('No header rules available to toggle');
                return;
            }
            
            // Toggle all specified rules
            let rulesUpdated = 0;
            const updatedHeaderRules = this.rules.header.map(rule => {
                if (ruleIds.includes(String(rule.id))) {
                    rulesUpdated++;
                    return {
                        ...rule,
                        isEnabled: enabled,
                        updatedAt: new Date().toISOString()
                    };
                }
                return rule;
            });
            
            if (rulesUpdated === 0) {
                log.warn('No rules were updated');
                return;
            }
            
            // Update the rules in memory
            this.rules.header = updatedHeaderRules;
            
            // Save to disk using the existing rules structure
            if (this.appDataPath) {
                try {
                    // Get active workspace ID
                    const workspacesPath = path.join(this.appDataPath, 'workspaces.json');
                    let activeWorkspaceId = 'default-personal';
                    
                    if (fs.existsSync(workspacesPath)) {
                        const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                        const workspaces = JSON.parse(workspacesData);
                        if (workspaces.activeWorkspaceId) {
                            activeWorkspaceId = workspaces.activeWorkspaceId;
                        }
                    }
                    
                    const rulesPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'rules.json');
                    
                    // Load existing rules storage to preserve structure
                    let rulesStorage;
                    try {
                        const existingData = await fs.promises.readFile(rulesPath, 'utf8');
                        rulesStorage = JSON.parse(existingData);
                    } catch (e) {
                        // If file doesn't exist, use the initial loaded rules structure
                        rulesStorage = {
                            version: '3.0.0',
                            rules: this.rules,
                            metadata: {}
                        };
                    }
                    
                    // Update with our modified rules
                    rulesStorage.rules = this.rules;
                    
                    // Update metadata
                    rulesStorage.metadata = rulesStorage.metadata || {};
                    rulesStorage.metadata.totalRules = Object.values(this.rules)
                        .reduce((sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0), 0);
                    rulesStorage.metadata.lastUpdated = new Date().toISOString();
                    
                    await atomicWriter.writeJson(rulesPath, rulesStorage, { pretty: true });
                    log.info(`Toggled ${rulesUpdated} rules to ${enabled} for workspace ${activeWorkspaceId}`);
                } catch (error) {
                    log.error('Failed to persist rules to disk:', error);
                }
            }
            
            // Broadcast the updated rules to all connected clients (extensions)
            this._broadcastRules();
            
            // Notify the desktop app's UI to reload rules
            try {
                const { BrowserWindow } = require('electron');
                const windows = BrowserWindow.getAllWindows();
                windows.forEach(window => {
                    if (window && !window.isDestroyed()) {
                        // Execute JavaScript to dispatch the event that HeaderRules listens for
                        const rulesData = {
                            rules: {
                                header: this.rules.header || []
                            },
                            metadata: {
                                totalRules: this.rules.header ? this.rules.header.length : 0,
                                lastUpdated: new Date().toISOString()
                            },
                            version: '3.0.0'
                        };
                        
                        window.webContents.executeJavaScript(`
                            window.dispatchEvent(new CustomEvent('rules-updated', { 
                                detail: { 
                                    rules: ${JSON.stringify(rulesData)}
                                }
                            }));
                        `).catch(err => {
                            log.error('Failed to dispatch rules-updated event:', err);
                        });
                    }
                });
            } catch (error) {
                log.error('Failed to notify main window:', error);
            }
            
            log.info(`Successfully toggled ${rulesUpdated} rules to ${enabled}`);
        } catch (error) {
            log.error('Error handling toggle all rules:', error);
        }
    }

    /**
     * Handle focus app request from extension
     * @private
     * @param {Object} navigation - Navigation data with tab, subTab, action
     */
    _handleFocusApp(navigation) {
        try {
            log.info('_handleFocusApp called with navigation:', navigation);
            const { BrowserWindow, app } = require('electron');
            
            // Get all windows
            const windows = BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                log.warn('No windows available to focus');
                return;
            }
            
            // Get the main window (usually the first one)
            const mainWindow = windows[0];

            windowsFocusHelper.focusWindow(mainWindow);
            
            // Send navigation event to renderer if navigation data provided
            if (navigation && (navigation.tab || navigation.subTab)) {
                // Small delay to ensure window is focused first
                setTimeout(() => {
                    mainWindow.webContents.send('navigate-to', navigation);
                    log.info('Sent navigation event to renderer:', navigation);
                }, 500);
            }
            
            log.info('App focused successfully');
        } catch (error) {
            log.error('Error focusing app:', error);
        }
    }
    
    /**
     * Broadcast rules to all connected clients on both servers
     * @private
     */
    _broadcastRules() {
        // Populate dynamic header values before broadcasting
        const populatedRules = this._populateDynamicHeaderValues(this.rules);
        
        
        // Prepare message once for efficiency
        const message = JSON.stringify({
            type: 'rules-update',
            data: {
                rules: populatedRules,
                version: '3.0.0'
            }
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
     * Broadcast connection status to all renderer windows
     * @private
     */
    _broadcastConnectionStatus() {
        try {
            // Import electron only when needed to avoid issues
            const { BrowserWindow } = require('electron');
            const status = this.getConnectionStatus();
            
            BrowserWindow.getAllWindows().forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('ws-connection-status-changed', status);
                }
            });
        } catch (error) {
            // Electron might not be available in some contexts
            log.debug('Could not broadcast connection status:', error.message);
        }
    }

    /**
     * Parse browser information from user agent string
     * @private
     * @param {string} userAgent - User agent string
     * @returns {Object} Browser info object
     */
    _parseBrowserInfo(userAgent) {
        const browserInfo = {
            browser: 'unknown',
            version: '',
            platform: 'unknown'
        };

        // Detect browser
        if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
            browserInfo.browser = 'chrome';
            const match = userAgent.match(/Chrome\/(\S+)/);
            if (match) browserInfo.version = match[1];
        } else if (userAgent.includes('Firefox')) {
            browserInfo.browser = 'firefox';
            const match = userAgent.match(/Firefox\/(\S+)/);
            if (match) browserInfo.version = match[1];
        } else if (userAgent.includes('Edg')) {
            browserInfo.browser = 'edge';
            const match = userAgent.match(/Edg\/(\S+)/);
            if (match) browserInfo.version = match[1];
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            browserInfo.browser = 'safari';
            const match = userAgent.match(/Version\/(\S+)/);
            if (match) browserInfo.version = match[1];
        }

        // Detect platform
        if (userAgent.includes('Windows')) {
            browserInfo.platform = 'windows';
        } else if (userAgent.includes('Mac OS')) {
            browserInfo.platform = 'macos';
        } else if (userAgent.includes('Linux')) {
            browserInfo.platform = 'linux';
        }

        return browserInfo;
    }

    /**
     * Get current connection status and connected clients
     * @returns {Object} Connection status object
     */
    getConnectionStatus() {
        const clients = Array.from(this.connectedClients.values());
        
        // Group clients by browser
        const browserCounts = {};
        clients.forEach(client => {
            const browser = client.browser || 'unknown';
            browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        });

        return {
            totalConnections: clients.length,
            browserCounts,
            clients: clients.map(client => ({
                id: client.id,
                browser: client.browser,
                browserVersion: client.browserVersion,
                platform: client.platform,
                connectionType: client.connectionType,
                connectedAt: client.connectedAt,
                lastActivity: client.lastActivity,
                extensionVersion: client.extensionVersion
            })),
            wsServerRunning: this.wss !== null,
            wssServerRunning: this.secureWss !== null
        };
    }

    /**
     * Start periodic client cleanup
     * @private
     */
    _startClientCleanup() {
        // Clear any existing interval
        if (this.clientCleanupInterval) {
            clearInterval(this.clientCleanupInterval);
        }

        this.clientCleanupInterval = setInterval(() => {
            this._cleanupStaleClients();
        }, this.cleanupIntervalTime);

        log.info('Started periodic client cleanup');
    }

    /**
     * Clean up stale client connections
     * @private
     */
    _cleanupStaleClients() {
        const now = Date.now();
        const staleClients = [];

        // Find stale clients
        for (const [clientId, clientInfo] of this.connectedClients) {
            const lastActivity = clientInfo.lastActivity?.getTime() || clientInfo.connectedAt.getTime();
            const inactiveTime = now - lastActivity;

            if (inactiveTime > this.maxClientInactivity) {
                staleClients.push({ clientId, clientInfo, inactiveTime });
            }
        }

        if (staleClients.length === 0) return;

        log.info(`Found ${staleClients.length} stale clients to clean up`);

        // Clean up stale clients
        staleClients.forEach(({ clientId, clientInfo, inactiveTime }) => {
            log.info(`Cleaning up stale client ${clientId} (inactive for ${Math.round(inactiveTime / 1000)}s)`);

            // Find and close the WebSocket connection
            const closeClient = (server) => {
                if (!server) return false;

                for (const client of server.clients) {
                    if (client.clientId === clientId && client.readyState === WebSocket.OPEN) {
                        client.close(1000, 'Inactive connection');
                        return true;
                    }
                }
                return false;
            };

            // Try to close in both servers
            const closed = closeClient(this.wss) || closeClient(this.secureWss);

            if (!closed) {
                // Client already disconnected, just clean up our records
                this.connectedClients.delete(clientId);
                this.clientInitializationLocks.delete(clientId);
            }
        });

        this._broadcastConnectionStatus();
    }

    /**
     * Perform heartbeat check on all clients
     * @private
     */
    _performHeartbeat() {
        const pingClients = (server) => {
            if (!server) return;

            server.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    // Mark client as not alive
                    client.isAlive = false;
                    
                    // Send ping
                    client.ping(() => {
                        // Ping sent
                    });
                }
            });
        };

        // Ping all clients
        pingClients(this.wss);
        pingClients(this.secureWss);

        // Check for dead clients after a timeout
        setTimeout(() => {
            const terminateDeadClients = (server) => {
                if (!server) return;

                server.clients.forEach((client) => {
                    if (!client.isAlive && client.readyState === WebSocket.OPEN) {
                        log.info(`Terminating dead client: ${client.clientId}`);
                        client.terminate();
                    }
                });
            };

            terminateDeadClients(this.wss);
            terminateDeadClients(this.secureWss);
        }, 30000); // 30 second timeout for pong response
    }

    /**
     * Initialize video capture service
     * @private
     */
    async _initializeVideoCaptureService() {
        try {
            const VideoCaptureService = require('../video/video-capture-service');
            this.videoCaptureService = new VideoCaptureService();
            await this.videoCaptureService.initialize(this.appDataPath);
            log.info('Video capture service initialized');
        } catch (error) {
            log.error('Failed to initialize video capture service:', error);
            // Non-critical error - continue without video capture
        }
    }

    /**
     * Initialize proxy service with current rules and environment variables
     * @private
     */
    _initializeProxyService() {
        this._syncProxyService();
    }

    /**
     * Synchronize proxy service with current state (env vars, rules, sources)
     * @private
     */
    _syncProxyService() {
        try {
            const proxyService = require('../proxy/ProxyService');
            
            // Load and set environment variables
            const envVars = this._loadEnvironmentVariables();
            if (envVars) {
                proxyService.updateEnvironmentVariables(envVars);
            }
            
            // Set header rules if available
            if (this.rules && this.rules.header) {
                proxyService.updateHeaderRules(this.rules.header);
            }
            
            // Set sources if available
            if (this.sources && this.sources.length > 0) {
                proxyService.updateSources(this.sources);
            }
        } catch (error) {
            log.error('Failed to sync proxy service:', error);
            // Non-critical error - proxy service might not be running
        }
    }

    /**
     * Handle start sync recording request
     * @private
     * @param {WebSocket} ws - WebSocket client
     * @param {Object} data - Recording data
     */
    async _handleStartSyncRecording(ws, data) {
        try {
            // CHECK VIDEO RECORDING SETTING FIRST - BEFORE ANY SCREEN CAPTURE API CALLS
            const { app } = require('electron');
            const fs = require('fs').promises;
            const path = require('path');
            
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            let videoRecordingEnabled = false;
            
            try {
                const settingsData = await fs.readFile(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);
                videoRecordingEnabled = settings.videoRecording || false;
            } catch (error) {
                // Settings file might not exist or be readable
                log.debug('Could not read settings file, assuming video recording is disabled');
            }
            
            // If video recording is disabled, return early without triggering any screen capture APIs
            if (!videoRecordingEnabled) {
                log.info('Video recording is disabled in settings, skipping video capture');
                this._sendVideoRecordingStatus(ws, data.recordingId, 'disabled', 'Video recording is disabled in settings');
                return;
            }
            
            // Check if video capture service is available
            if (!this.videoCaptureService) {
                log.warn('Video capture service not available');
                this._sendVideoRecordingStatus(ws, data.recordingId, 'error', 'Video capture service not initialized');
                return;
            }

            // Only now that we've confirmed video recording is enabled, start the recording
            // This call will trigger desktopCapturer.getSources() which may show the macOS permission dialog
            const result = await this.videoCaptureService.startRecording({
                recordingId: data.recordingId,
                url: data.url,
                title: data.title,
                windowId: data.windowId,
                tabId: data.tabId,
                timestamp: data.timestamp,
                displayInfo: data.displayInfo  // Pass display detection info from browser
            });

            if (result.success) {
                log.info(`Started video recording for ${data.recordingId}`);
                this._sendVideoRecordingStatus(ws, data.recordingId, 'started');
            } else {
                log.error(`Failed to start video recording: ${result.error}`);
                this._sendVideoRecordingStatus(ws, data.recordingId, 'error', result.error);
            }
        } catch (error) {
            log.error('Error handling start sync recording:', error);
            this._sendVideoRecordingStatus(ws, data.recordingId, 'error', error.message);
        }
    }

    /**
     * Handle stop sync recording request
     * @private
     * @param {WebSocket} ws - WebSocket client
     * @param {Object} data - Recording data
     */
    async _handleStopSyncRecording(ws, data) {
        try {
            // Check video recording setting first for consistency
            const { app } = require('electron');
            const fs = require('fs').promises;
            const path = require('path');
            
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            let videoRecordingEnabled = false;
            
            try {
                const settingsData = await fs.readFile(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);
                videoRecordingEnabled = settings.videoRecording || false;
            } catch (error) {
                log.debug('Could not read settings file, assuming video recording is disabled');
            }
            
            // If video recording is disabled, just return
            if (!videoRecordingEnabled) {
                log.info('Video recording is disabled in settings, ignoring stop request');
                return;
            }
            
            if (!this.videoCaptureService) {
                log.warn('Video capture service not available');
                return;
            }

            // Stop video recording
            const result = await this.videoCaptureService.stopRecording(data.recordingId);

            if (result.success) {
                log.info(`Stopped video recording for ${data.recordingId}`);
                this._sendVideoRecordingStatus(ws, data.recordingId, 'stopped');
            } else {
                log.error(`Failed to stop video recording: ${result.error}`);
                this._sendVideoRecordingStatus(ws, data.recordingId, 'error', result.error);
            }
        } catch (error) {
            log.error('Error handling stop sync recording:', error);
            this._sendVideoRecordingStatus(ws, data.recordingId, 'error', error.message);
        }
    }

    /**
     * Handle recording state synchronization
     * @private
     * @param {WebSocket} ws - WebSocket client
     * @param {Object} data - State data
     */
    async _handleRecordingStateSync(ws, data) {
        try {
            if (!this.videoCaptureService) {
                return;
            }

            // Update recording state
            await this.videoCaptureService.updateRecordingState(data.recordingId, data.state);
            log.info(`Updated recording state for ${data.recordingId}: ${data.state}`);
        } catch (error) {
            log.error('Error handling recording state sync:', error);
        }
    }

    /**
     * Send video recording status to client
     * @private
     * @param {WebSocket} ws - WebSocket client
     * @param {string} recordingId - Recording ID
     * @param {string} status - Status message
     * @param {string} error - Error message (optional)
     */
    _sendVideoRecordingStatus(ws, recordingId, status, error = null) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'videoRecordingStatus',
                data: {
                    recordingId,
                    status,
                    error
                }
            };
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Load environment variables from workspace files
     * @private
     * @returns {Object|null} Environment variables or null if not available
     */
    _loadEnvironmentVariables() {
        try {
            // Get active workspace ID
            const workspacesPath = path.join(this.appDataPath, 'workspaces.json');
            let activeWorkspaceId = 'default-personal';
            
            if (fs.existsSync(workspacesPath)) {
                const workspacesData = fs.readFileSync(workspacesPath, 'utf8');
                const workspaces = JSON.parse(workspacesData);
                if (workspaces.activeWorkspaceId) {
                    activeWorkspaceId = workspaces.activeWorkspaceId;
                }
                
                // Load environment data from workspace
                const environmentsPath = path.join(this.appDataPath, 'workspaces', activeWorkspaceId, 'environments.json');
                
                if (fs.existsSync(environmentsPath)) {
                    const envData = fs.readFileSync(environmentsPath, 'utf8');
                    const environmentsData = JSON.parse(envData);
                    
                    // Get active environment from the environments file
                    const activeEnvironment = environmentsData.activeEnvironment || 'Default';
                    const environments = environmentsData.environments || {};
                    
                    // Get variables from active environment
                    if (environments[activeEnvironment]) {
                        const variables = {};
                        Object.entries(environments[activeEnvironment]).forEach(([key, data]) => {
                            // Handle both object format {value: "..."} and direct string format
                            variables[key] = typeof data === 'object' ? data.value : data;
                        });
                        return variables;
                    } else {
                        log.warn(`Active environment '${activeEnvironment}' not found in environments data`);
                    }
                }
            }
            
            return {};
        } catch (error) {
            log.error('Error loading environment variables:', error);
            return {};
        }
    }
    
    /**
     * Resolve template with environment variables
     * @private
     * @param {string} template - Template string with {{VAR}} placeholders
     * @param {Object} variables - Variables object
     * @returns {string} Resolved string
     */
    _resolveTemplate(template, variables) {
        if (!template || typeof template !== 'string') {
            return template;
        }
        
        return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
            const trimmedVarName = varName.trim();
            const value = variables[trimmedVarName];
            
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
            
            // Return original placeholder if variable not found
            return match;
        });
    }

    /**
     * Setup environment change listener
     * @private
     */
    _setupEnvironmentListener() {
        try {
            // Import electron to listen for IPC events
            const { ipcMain } = require('electron');
            
            // Listen for environment changes
            const handleEnvChange = () => {
                // Reload environment variables
                try {
                    this._loadEnvironmentVariables();
                } catch (error) {
                    log.warn('Failed to reload environment variables:', error);
                }
                
                // Only re-broadcast if we have rules with env vars
                if (this.rules && this.rules.header) {
                    const hasEnvVars = this.rules.header.some(rule => rule.hasEnvVars);
                    if (hasEnvVars) {
                        this._broadcastRules();
                    }
                }
            };
            
            // Listen to various environment-related events
            ipcMain.on('environment-variables-changed', (event, variables) => {
                // Sync proxy service with updated state
                this._syncProxyService();
                handleEnvChange();
            });
            ipcMain.on('environment-switched', handleEnvChange);
            ipcMain.on('workspace-switched', handleEnvChange);
            
            log.info('Environment change listener setup for WebSocket service');
        } catch (error) {
            log.warn('Could not setup environment listener:', error.message);
            // Non-critical error - service will work without auto-updates
        }
    }

    /**
     * Close all WebSocket servers
     */
    close() {
        // Stop client cleanup
        if (this.clientCleanupInterval) {
            clearInterval(this.clientCleanupInterval);
            this.clientCleanupInterval = null;
        }

        // Clear connected clients
        this.connectedClients.clear();
        this.clientInitializationLocks.clear();
        
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

    /**
     * Check if WebSocket is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.connectedClients.size > 0;
    }

    /**
     * Send message to browser extension
     * @param {Object} message - Message to send
     * @returns {boolean} Whether the message was sent
     */
    sendToBrowserExtension(message) {
        if (this.connectedClients.size === 0) {
            log.warn('No connected browser extensions to send message to');
            return false;
        }

        const messageStr = JSON.stringify(message);
        let sentCount = 0;

        // Send to all connected clients
        const sendToAllClients = (server) => {
            if (!server) return;
            
            server.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(messageStr);
                        sentCount++;
                    } catch (error) {
                        log.error('Failed to send message to browser extension:', error);
                    }
                }
            });
        };

        // Send to regular WS clients
        if (this.wss) {
            sendToAllClients(this.wss);
        }

        // Send to secure WSS clients  
        if (this.secureWss) {
            sendToAllClients(this.secureWss);
        }

        if (sentCount > 0) {
            log.info(`Sent message to ${sentCount} browser extension(s):`, message.type);
        }
        
        return sentCount > 0;
    }
}

module.exports = new WebSocketService();