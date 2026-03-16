// ws-service.js - WebSocket service core: server lifecycle, message routing, public API
const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { createLogger } = require('../../utils/mainLogger');
const WSNetworkStateHandler = require('./ws-network-state');
const WSCertificateHandler = require('./ws-certificate-handler');
const WSRecordingHandler = require('./ws-recording-handler');
const WSRuleHandler = require('./ws-rule-handler');
const WSSourceHandler = require('./ws-source-handler');
const WSEnvironmentHandler = require('./ws-environment-handler');
const WSClientHandler = require('./ws-client-handler');
const windowsFocusHelper = require('../../main/modules/utils/windowsFocus');
const log = createLogger('WebSocketService');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.secureWss = null;
        this.httpServer = null;
        this.httpsServer = null;
        this.wsPort = 59210;
        this.wssPort = 59211;
        this.host = '127.0.0.1';
        this.isInitializing = false;
        this.sources = [];
        this.rules = {};
        this.sourceService = null;
        this.appDataPath = null;
        this.connectedClients = new Map();
        this.clientInitializationLocks = new Map();
        this.rulesBroadcastTimer = null;
        this.lastRulesBroadcast = 0;
        this._closing = false;

        // Handlers
        this.certificateHandler = new WSCertificateHandler(this);
        this.recordingHandler = new WSRecordingHandler(this);
        this.ruleHandler = new WSRuleHandler(this);
        this.sourceHandler = new WSSourceHandler(this);
        this.environmentHandler = new WSEnvironmentHandler(this);
        this.clientHandler = new WSClientHandler(this);
        this.networkStateHandler = null;
    }

    /**
     * Initialize the WebSocket service
     * @param {Object} options
     * @returns {boolean}
     */
    initialize(options = {}) {
        if (this.isInitializing) return false;
        this.isInitializing = true;

        try {
            log.info('Initializing WebSocket service with WS and WSS support...');

            if (options.wsPort) this.wsPort = options.wsPort;
            if (options.wssPort) this.wssPort = options.wssPort;
            if (options.sourceService) this.sourceService = options.sourceService;
            if (options.appDataPath) this.appDataPath = options.appDataPath;

            if (!this.appDataPath) {
                try {
                    const electron = require('electron');
                    if (electron && electron.app) {
                        this.appDataPath = electron.app.getPath('userData');
                    }
                } catch (e) {
                    this.appDataPath = process.cwd();
                }
            }

            this._setupWsServer();
            this._setupWssServer();

            if (this.sourceService) this.sourceHandler.registerSourceEvents();
            this.sourceHandler.loadInitialData();
            this.clientHandler.startClientCleanup();

            this.networkStateHandler = new WSNetworkStateHandler(this);
            if (options.networkService) {
                this.networkStateHandler.initialize(options.networkService);
            }

            this.recordingHandler.initializeVideoCaptureService();
            this.environmentHandler.setupEnvironmentListener();
            this.environmentHandler.syncProxyService();

            this.isInitializing = false;
            return true;
        } catch (error) {
            log.error('Failed to initialize WebSocket service:', error);
            this.isInitializing = false;
            return false;
        }
    }

    // ── Shared broadcast utility ──────────────────

    /**
     * Broadcast a pre-serialized message to all WS and WSS clients
     * @param {string} message - JSON string
     * @returns {number} clients reached
     */
    _broadcastToAll(message) {
        let count = 0;
        const send = (server) => {
            if (!server) return;
            server.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    try { client.send(message); count++; }
                    catch (e) { log.error('Error broadcasting to client:', e); }
                }
            });
        };
        send(this.wss);
        send(this.secureWss);
        return count;
    }

    // ── Server lifecycle ──────────────────────────

    /** @private */
    _setupWsServer() {
        try {
            log.info(`WebSocket server (WS) starting on ${this.host}:${this.wsPort}`);

            this.httpServer = http.createServer((req, res) => {
                const p = new URL(`http://${this.host}:${this.wsPort}${req.url}`).pathname;
                if (p === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('pong'); }
                else { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Upgrade Required - WebSocket Only'); }
            });

            this.wss = new WebSocket.Server({ server: this.httpServer, host: this.host });
            this._configureWebSocketServer(this.wss, 'WS');

            this._listenWithRetry(this.httpServer, this.wsPort, this.host, 'WS', () => {
                log.info(`WebSocket server (WS) listening on ${this.host}:${this.wsPort}`);
            });
        } catch (error) {
            log.error('Error setting up WS server:', error);
        }
    }

    /** @private */
    async _setupWssServer() {
        try {
            log.info(`Secure WebSocket server (WSS) starting on ${this.host}:${this.wssPort}`);

            const certInfo = await this.certificateHandler.ensureCertificatesExist();
            if (!certInfo.success) {
                log.error('Failed to set up certificates for WSS server:', certInfo.error);
                return;
            }

            const key = fs.readFileSync(this.certificateHandler.certificatePaths.keyPath);
            const cert = fs.readFileSync(this.certificateHandler.certificatePaths.certPath);

            this.httpsServer = https.createServer({ key, cert },
                this.certificateHandler.createHttpsRequestHandler()
            );

            this.secureWss = new WebSocket.Server({ server: this.httpsServer, host: this.host });
            this._configureWebSocketServer(this.secureWss, 'WSS');

            this._listenWithRetry(this.httpsServer, this.wssPort, this.host, 'WSS', () => {
                log.info(`Secure WebSocket server (WSS) listening on ${this.host}:${this.wssPort}`);
                log.info(`Certificate fingerprint: ${this.certificateHandler.certificatePaths.fingerprint}`);
            });
        } catch (error) {
            log.error('Error setting up WSS server:', error);
        }
    }

    /** @private */
    _listenWithRetry(server, port, host, label, onListening) {
        const maxRetries = 5;
        const retryDelay = 500;
        let attempts = 0;

        const retryHandler = (error) => {
            if (error.code === 'EADDRINUSE' && attempts < maxRetries) {
                attempts++;
                log.warn(`${label} port ${port} in use, retrying in ${retryDelay}ms (attempt ${attempts}/${maxRetries})`);
                setTimeout(() => server.listen(port, host), retryDelay);
            } else {
                log.error(`${label} server error on port ${port}:`, error);
            }
        };

        server.on('error', retryHandler);
        server.once('listening', () => {
            server.removeListener('error', retryHandler);
            if (attempts > 0) log.info(`${label} server bound to port ${port} after ${attempts} retries`);
            if (onListening) onListening();
        });
        server.listen(port, host);
    }

    /** @private */
    _restartWebSocketServer(serverType) {
        try {
            if (serverType === 'WS') {
                if (this.wss) { this.wss.close(); if (this.httpServer) this.httpServer.close(); }
                setTimeout(() => this._setupWsServer(), 1000);
            } else if (serverType === 'WSS') {
                if (this.secureWss) { this.secureWss.close(); if (this.httpsServer) this.httpsServer.close(); }
                setTimeout(() => this._setupWssServer(), 1000);
            }
        } catch (error) {
            log.error(`Error restarting ${serverType} server:`, error);
        }
    }

    async close() {
        this._closing = true;
        this.clientHandler.stopClientCleanup();

        this.connectedClients.clear();
        this.clientInitializationLocks.clear();

        const terminateAll = (server) => {
            if (!server) return;
            for (const c of server.clients) { try { c.terminate(); } catch (e) { /* ignore */ } }
        };
        terminateAll(this.wss);
        terminateAll(this.secureWss);

        const closeServer = (httpSrv, wsSrv, label) => {
            if (!httpSrv) return Promise.resolve();
            return new Promise((resolve) => {
                const t = setTimeout(() => { log.warn(`${label} close timed out`); resolve(); }, 2000);
                try { wsSrv?.close(); } catch (e) { /* ignore */ }
                httpSrv.close(() => { clearTimeout(t); log.info(`${label} server closed`); resolve(); });
            });
        };

        await closeServer(this.httpServer, this.wss, 'WS');
        await closeServer(this.httpsServer, this.secureWss, 'WSS');
        log.info('All WebSocket servers closed');
    }

    // ── Message routing ───────────────────────────

    /** @private */
    _configureWebSocketServer(server, serverType) {
        server.on('connection', (ws, request) => {
            log.info(`${serverType} client connected`);

            const clientId = `${serverType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const userAgent = request.headers['user-agent'] || '';
            const browserInfo = this.clientHandler.parseBrowserInfo(userAgent);

            this.connectedClients.set(clientId, {
                id: clientId, connectionType: serverType,
                browser: browserInfo.browser, browserVersion: browserInfo.version,
                platform: browserInfo.platform, userAgent,
                connectedAt: new Date(), lastActivity: new Date()
            });
            ws.clientId = clientId;

            this.clientHandler.initializeClient(ws, clientId);
            this.clientHandler.broadcastConnectionStatus();

            ws.on('close', () => {
                if (this._closing) return;
                log.info(`${serverType} client disconnected`);
                this.connectedClients.delete(clientId);
                this.clientInitializationLocks.delete(clientId);
                this.clientHandler.broadcastConnectionStatus();
            });
            ws.on('error', (error) => log.error(`${serverType} client error:`, error));
            ws.on('pong', () => {
                ws.isAlive = true;
                const c = this.connectedClients.get(clientId);
                if (c) c.lastActivity = new Date();
            });

            ws.on('message', (msg) => {
                try {
                    const data = JSON.parse(msg);
                    const c = this.connectedClients.get(clientId);
                    if (c) c.lastActivity = new Date();

                    // Browser self-identification
                    if (data.type === 'browserInfo' && data.browser) {
                        if (c) {
                            if (c.browser === 'unknown') c.browser = data.browser;
                            if (!c.browserVersion) c.browserVersion = data.version || c.browserVersion;
                            c.extensionVersion = data.extensionVersion;
                        }
                        return;
                    }

                    this._dispatchMessage(ws, data);
                } catch (err) {
                    log.error(`Error processing ${serverType} client message:`, err);
                }
            });
        });

        server.on('error', (error) => {
            log.error(`${serverType} server error:`, error);
            setTimeout(() => this._restartWebSocketServer(serverType), 5000);
        });
    }

    /** @private */
    _dispatchMessage(ws, data) {
        switch (data.type) {
            case 'requestSources':
                if (ws.isInitialized) this.sourceHandler.sendSourcesToClient(ws);
                break;
            case 'requestRules':
                if (ws.isInitialized) this.ruleHandler.sendRulesToClient(ws);
                break;
            case 'getVideoRecordingState':
                this.recordingHandler.sendVideoRecordingState(ws);
                break;
            case 'getRecordingHotkey':
                this.recordingHandler.sendRecordingHotkey(ws);
                break;
            case 'toggleRule':
                this.ruleHandler.handleToggleRule(data.ruleId, data.enabled);
                break;
            case 'toggleAllRules':
                this.ruleHandler.handleToggleAllRules(data.ruleIds, data.enabled);
                break;
            case 'saveRecording':
            case 'saveWorkflow':
                this.recordingHandler.handleSaveRecordingMessage(ws, data);
                break;
            case 'focusApp':
                this._handleFocusApp(data.navigation);
                break;
            case 'startSyncRecording':
                log.info('Received startSyncRecording request:', data.data);
                this.recordingHandler.handleStartSyncRecording(ws, data.data);
                break;
            case 'stopSyncRecording':
                log.info('Received stopSyncRecording request:', data.data);
                this.recordingHandler.handleStopSyncRecording(ws, data.data);
                break;
            case 'recordingStateSync':
                log.info('Received recordingStateSync:', data.data);
                this.recordingHandler.handleRecordingStateSync(ws, data.data);
                break;
        }
    }

    // ── Shared utilities ──────────────────────────

    /** @private */
    _handleFocusApp(navigation) {
        try {
            log.info('_handleFocusApp called with navigation:', navigation);
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            if (windows.length === 0) { log.warn('No windows available to focus'); return; }

            const mainWindow = windows[0];
            windowsFocusHelper.focusWindow(mainWindow);

            if (navigation && (navigation.tab || navigation.subTab)) {
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

    // ── Public API / delegators ───────────────────

    isConnected() { return this.connectedClients.size > 0; }

    sendToBrowserExtension(message) {
        if (this.connectedClients.size === 0) {
            log.warn('No connected browser extensions to send message to');
            return false;
        }
        const n = this._broadcastToAll(JSON.stringify(message));
        if (n > 0) log.info(`Sent message to ${n} browser extension(s):`, message.type);
        return n > 0;
    }

    // Source delegators
    updateSources(sources) { this.sourceHandler.updateSources(sources); }
    onWorkspaceSwitch(workspaceId) { return this.sourceHandler.onWorkspaceSwitch(workspaceId); }

    // Rule delegators
    updateRules(rules) { this.ruleHandler.updateRules(rules); }
    broadcastRules() { this.ruleHandler.broadcastRules(); }

    // Client delegators
    getConnectionStatus() { return this.clientHandler.getConnectionStatus(); }

    // Certificate delegators
    checkCertificateTrust() { return this.certificateHandler.checkCertificateTrust(); }
    trustCertificate() { return this.certificateHandler.trustCertificate(); }
    untrustCertificate() { return this.certificateHandler.untrustCertificate(); }

    // Recording delegators
    broadcastVideoRecordingState(enabled) { this.recordingHandler.broadcastVideoRecordingState(enabled); }
    broadcastRecordingHotkeyChange(hotkey, enabled) { this.recordingHandler.broadcastRecordingHotkeyChange(hotkey, enabled); }
}

module.exports = new WebSocketService();
