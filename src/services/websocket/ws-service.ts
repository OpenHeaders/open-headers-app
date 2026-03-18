// ws-service.ts - WebSocket service core: server lifecycle, message routing, public API
import WS from 'ws';
import electron from 'electron';
import https from 'https';
import http from 'http';
import fs from 'fs';
import mainLogger from '../../utils/mainLogger';
import { WSNetworkStateHandler } from './ws-network-state';
import { WSCertificateHandler } from './ws-certificate-handler';
import { WSRecordingHandler } from './ws-recording-handler';
import { WSRuleHandler } from './ws-rule-handler';
import { WSSourceHandler } from './ws-source-handler';
import { WSEnvironmentHandler } from './ws-environment-handler';
import { WSClientHandler } from './ws-client-handler';

const { createLogger } = mainLogger;
const log = createLogger('WebSocketService');

interface InitializeOptions {
    wsPort?: number;
    wssPort?: number;
    sourceService?: any;
    appDataPath?: string;
    networkService?: any;
}

class WebSocketService {
    wss: any | null;
    secureWss: any | null;
    httpServer: http.Server | null;
    httpsServer: https.Server | null;
    wsPort: number;
    wssPort: number;
    host: string;
    isInitializing: boolean;
    sources: any[];
    rules: any;
    sourceService: any;
    appDataPath: string | null;
    connectedClients: Map<string, any>;
    clientInitializationLocks: Map<string, any>;
    rulesBroadcastTimer: ReturnType<typeof setTimeout> | null;
    lastRulesBroadcast: number;
    _closing: boolean;

    // Handlers
    certificateHandler: WSCertificateHandler;
    recordingHandler: WSRecordingHandler;
    ruleHandler: WSRuleHandler;
    sourceHandler: WSSourceHandler;
    environmentHandler: WSEnvironmentHandler;
    clientHandler: WSClientHandler;
    networkStateHandler: WSNetworkStateHandler | null;

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
        this.ruleHandler = new WSRuleHandler(this as any);
        this.sourceHandler = new WSSourceHandler(this as any);
        this.environmentHandler = new WSEnvironmentHandler(this as any);
        this.clientHandler = new WSClientHandler(this as any);
        this.networkStateHandler = null;
    }

    /**
     * Initialize the WebSocket service
     */
    initialize(options: InitializeOptions = {}): boolean {
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
     */
    _broadcastToAll(message: string): number {
        let count = 0;
        const send = (server: any | null) => {
            if (!server) return;
            server.clients.forEach((client: { readyState: number; send: (msg: string) => void }) => {
                if (client.readyState === WS.OPEN) {
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

    _setupWsServer(): void {
        try {
            log.info(`WebSocket server (WS) starting on ${this.host}:${this.wsPort}`);

            this.httpServer = http.createServer((req, res) => {
                const p = new URL(`http://${this.host}:${this.wsPort}${req.url}`).pathname;
                if (p === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('pong'); }
                else { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Upgrade Required - WebSocket Only'); }
            });

            this.wss = new WS.Server({ server: this.httpServer, host: this.host });
            this._configureWebSocketServer(this.wss, 'WS');

            this._listenWithRetry(this.httpServer, this.wsPort, this.host, 'WS', () => {
                log.info(`WebSocket server (WS) listening on ${this.host}:${this.wsPort}`);
            });
        } catch (error) {
            log.error('Error setting up WS server:', error);
        }
    }

    async _setupWssServer(): Promise<void> {
        try {
            log.info(`Secure WebSocket server (WSS) starting on ${this.host}:${this.wssPort}`);

            const certInfo = await this.certificateHandler.ensureCertificatesExist();
            if (!certInfo.success) {
                log.error('Failed to set up certificates for WSS server:', certInfo.error);
                return;
            }

            const key = fs.readFileSync(this.certificateHandler.certificatePaths.keyPath!);
            const cert = fs.readFileSync(this.certificateHandler.certificatePaths.certPath!);

            this.httpsServer = https.createServer({ key, cert },
                this.certificateHandler.createHttpsRequestHandler()
            );

            this.secureWss = new WS.Server({ server: this.httpsServer, host: this.host });
            this._configureWebSocketServer(this.secureWss, 'WSS');

            this._listenWithRetry(this.httpsServer, this.wssPort, this.host, 'WSS', () => {
                log.info(`Secure WebSocket server (WSS) listening on ${this.host}:${this.wssPort}`);
                log.info(`Certificate fingerprint: ${this.certificateHandler.certificatePaths.fingerprint}`);
            });
        } catch (error) {
            log.error('Error setting up WSS server:', error);
        }
    }

    _listenWithRetry(server: http.Server | https.Server, port: number, host: string, label: string, onListening?: () => void): void {
        const maxRetries = 5;
        const retryDelay = 500;
        let attempts = 0;

        const retryHandler = (error: NodeJS.ErrnoException) => {
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

    _restartWebSocketServer(serverType: string): void {
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

    async close(): Promise<void> {
        this._closing = true;
        this.clientHandler.stopClientCleanup();

        this.connectedClients.clear();
        this.clientInitializationLocks.clear();

        const terminateAll = (server: any | null) => {
            if (!server) return;
            for (const c of server.clients) { try { c.terminate(); } catch (e) { /* ignore */ } }
        };
        terminateAll(this.wss);
        terminateAll(this.secureWss);

        const closeServer = (httpSrv: http.Server | https.Server | null, wsSrv: any | null, label: string): Promise<void> => {
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

    _configureWebSocketServer(server: any, serverType: string): void {
        server.on('connection', (ws: any, request: http.IncomingMessage) => {
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
            ws.on('error', (error: Error) => log.error(`${serverType} client error:`, error));
            ws.on('pong', () => {
                ws.isAlive = true;
                const c = this.connectedClients.get(clientId);
                if (c) c.lastActivity = new Date();
            });

            ws.on('message', (msg: string) => {
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

        server.on('error', (error: Error) => {
            log.error(`${serverType} server error:`, error);
            setTimeout(() => this._restartWebSocketServer(serverType), 5000);
        });
    }

    _dispatchMessage(ws: any, data: any): void {
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

    async _handleFocusApp(navigation: Record<string, unknown>): Promise<void> {
        try {
            log.info('_handleFocusApp called with navigation:', navigation);
            const { BrowserWindow } = electron;
            const windows = BrowserWindow.getAllWindows();
            if (windows.length === 0) { log.warn('No windows available to focus'); return; }

            const mainWindow = windows[0];
            const windowsFocusHelper = (await import('../../main/modules/utils/windowsFocus')).default;
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

    isConnected(): boolean { return this.connectedClients.size > 0; }

    sendToBrowserExtension(message: any): boolean {
        if (this.connectedClients.size === 0) {
            log.warn('No connected browser extensions to send message to');
            return false;
        }
        const n = this._broadcastToAll(JSON.stringify(message));
        if (n > 0) log.info(`Sent message to ${n} browser extension(s):`, message.type);
        return n > 0;
    }

    // Source delegators
    updateSources(sources: any): void { this.sourceHandler.updateSources(sources); }
    onWorkspaceSwitch(workspaceId: string): Promise<void> { return this.sourceHandler.onWorkspaceSwitch(workspaceId); }

    // Rule delegators
    updateRules(rules: any): void { this.ruleHandler.updateRules(rules); }
    broadcastRules(): void { this.ruleHandler.broadcastRules(); }

    // Client delegators
    getConnectionStatus(): Record<string, any> { return this.clientHandler.getConnectionStatus(); }

    // Certificate delegators
    checkCertificateTrust(): Promise<any> { return this.certificateHandler.checkCertificateTrust(); }
    trustCertificate(): Promise<any> { return this.certificateHandler.trustCertificate(); }
    untrustCertificate(): Promise<any> { return this.certificateHandler.untrustCertificate(); }

    // Recording delegators
    broadcastVideoRecordingState(enabled: boolean): void { this.recordingHandler.broadcastVideoRecordingState(enabled); }
    broadcastRecordingHotkeyChange(hotkey: string, enabled?: boolean): void { this.recordingHandler.broadcastRecordingHotkeyChange(hotkey, enabled); }
}

const wsServiceInstance = new WebSocketService();
export { WebSocketService, wsServiceInstance };
export default wsServiceInstance;
