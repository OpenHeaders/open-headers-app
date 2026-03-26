// ws-service.ts - WebSocket service core: server lifecycle, message routing, public API
import WS, { WebSocketServer } from 'ws';
import electron from 'electron';
import http from 'http';
import mainLogger from '../../utils/mainLogger';
import { WSNetworkStateHandler } from './ws-network-state';
import { WSRecordingHandler } from './ws-recording-handler';
import type { SaveRecordingMessageData, StartSyncRecordingData, StopSyncRecordingData, RecordingStateSyncData } from './ws-recording-handler';
import { WSRuleHandler } from './ws-rule-handler';
import { WSSourceHandler } from './ws-source-handler';
import { WSEnvironmentHandler } from './ws-environment-handler';
import { WSClientHandler } from './ws-client-handler';
import type { Source } from '../../types/source';
import type { RulesCollection } from '../../types/rules';
import type { ExtendedWebSocket, WSClientInfo } from '../../types/websocket';
import settingsCache from '../core/SettingsCache';

const { createLogger } = mainLogger;
const log = createLogger('WebSocketService');

interface InitLock {
    status: 'initializing' | 'initialized';
    promise: Promise<boolean> | null;
}


interface NetworkServiceLike {
    getState(): { isOnline: boolean; networkQuality: string; lastUpdate: number } | null;
    on(event: string, cb: (event: { newState?: { isOnline: boolean; networkQuality: string; lastUpdate: number } }) => void): void;
}

type WSMessage =
    | { type: 'getVideoRecordingState' | 'getRecordingHotkey' }
    | { type: 'browserInfo'; browser: string; version?: string; extensionVersion?: string }
    | { type: 'toggleRule'; ruleId: string | number; enabled: boolean }
    | { type: 'toggleAllRules'; ruleIds: string[]; enabled: boolean }
    | { type: 'focusApp'; navigation?: { tab?: string; subTab?: string } }
    | { type: 'saveRecording' | 'saveWorkflow'; recording: SaveRecordingMessageData['recording'] }
    | { type: 'startSyncRecording'; data: StartSyncRecordingData }
    | { type: 'stopSyncRecording'; data: StopSyncRecordingData }
    | { type: 'recordingStateSync'; data: RecordingStateSyncData };

interface InitializeOptions {
    wsPort?: number;
    appDataPath?: string;
    networkService?: NetworkServiceLike;
}

class WebSocketService {
    wss: WebSocketServer | null;
    httpServer: http.Server | null;
    wsPort: number;
    host: string;
    isInitializing: boolean;
    sources: Source[];
    rules: RulesCollection;
    appDataPath: string | null;
    connectedClients: Map<string, WSClientInfo>;
    clientInitializationLocks: Map<string, InitLock>;
    _closing: boolean;

    // Handlers
    recordingHandler: WSRecordingHandler;
    ruleHandler: WSRuleHandler;
    sourceHandler: WSSourceHandler;
    environmentHandler: WSEnvironmentHandler;
    clientHandler: WSClientHandler;
    networkStateHandler: WSNetworkStateHandler | null;

    constructor() {
        this.wss = null;
        this.httpServer = null;
        this.wsPort = 59210;
        this.host = '127.0.0.1';
        this.isInitializing = false;
        this.sources = [];
        this.rules = { header: [], request: [], response: [] };
        this.appDataPath = null;
        this.connectedClients = new Map();
        this.clientInitializationLocks = new Map();
        this._closing = false;

        // Handlers
        this.recordingHandler = new WSRecordingHandler(this);
        this.recordingHandler.onFocusApp = (nav) => this._handleFocusApp(nav);
        this.recordingHandler.onNotifyRenderers = (channel, data) => this._sendToRenderers(channel, data);
        this.ruleHandler = new WSRuleHandler(this);
        this.sourceHandler = new WSSourceHandler(this);
        this.environmentHandler = new WSEnvironmentHandler();
        this.clientHandler = new WSClientHandler(this);
        this.networkStateHandler = null;
    }

    /**
     * Initialize the WebSocket service
     */
    initialize(options: InitializeOptions = {}): boolean {
        if (this.isInitializing) return false;
        this.isInitializing = true;

        try {
            log.info('Initializing WebSocket service...');

            if (options.wsPort) this.wsPort = options.wsPort;
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

            // Wire SettingsCache reader — loaded in Phase A before services init
            this.recordingHandler.onReadSetting = (key) => settingsCache.get()[key];

            // Initial data loading is handled by WorkspaceStateService.initialize()
            // which calls broadcastToServices() to populate this.sources and this.rules.
            this.clientHandler.startClientCleanup();

            this.networkStateHandler = new WSNetworkStateHandler(this);
            if (options.networkService) {
                this.networkStateHandler.initialize(options.networkService);
            }

            void this.recordingHandler.initializeVideoCaptureService();
            // Environment changes and proxy sync are handled by WorkspaceStateService.

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
     * Broadcast a pre-serialized message to all connected clients
     */
    _broadcastToAll(message: string): number {
        let count = 0;
        if (!this.wss) return count;
        this.wss.clients.forEach((client: WS) => {
            if (client.readyState === WS.OPEN) {
                try { client.send(message); count++; }
                catch (e) { log.error('Error broadcasting to client:', e); }
            }
        });
        return count;
    }

    // ── Server lifecycle ──────────────────────────

    _setupWsServer(): void {
        try {
            log.info(`WebSocket server starting on ${this.host}:${this.wsPort}`);

            this.httpServer = http.createServer((req, res) => {
                const p = new URL(`http://${this.host}:${this.wsPort}${req.url}`).pathname;
                if (p === '/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('pong'); }
                else { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('Upgrade Required - WebSocket Only'); }
            });

            this.wss = new WebSocketServer({ server: this.httpServer, host: this.host });
            this._configureWebSocketServer(this.wss);

            this._listenWithRetry(this.httpServer, this.wsPort, this.host, () => {
                log.info(`WebSocket server listening on ${this.host}:${this.wsPort}`);
            });
        } catch (error) {
            log.error('Error setting up WS server:', error);
        }
    }

    _listenWithRetry(server: http.Server, port: number, host: string, onListening?: () => void): void {
        const maxRetries = 5;
        const retryDelay = 500;
        let attempts = 0;

        const retryHandler = (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE' && attempts < maxRetries) {
                attempts++;
                log.warn(`WS port ${port} in use, retrying in ${retryDelay}ms (attempt ${attempts}/${maxRetries})`);
                setTimeout(() => server.listen(port, host), retryDelay);
            } else {
                log.error(`WS server error on port ${port}:`, error);
            }
        };

        server.on('error', retryHandler);
        server.once('listening', () => {
            server.removeListener('error', retryHandler);
            if (attempts > 0) log.info(`WS server bound to port ${port} after ${attempts} retries`);
            if (onListening) onListening();
        });
        server.listen(port, host);
    }

    _restartWebSocketServer(): void {
        try {
            if (this.wss) { this.wss.close(); if (this.httpServer) this.httpServer.close(); }
            setTimeout(() => this._setupWsServer(), 1000);
        } catch (error) {
            log.error('Error restarting WS server:', error);
        }
    }

    async close(): Promise<void> {
        this._closing = true;
        this.clientHandler.stopClientCleanup();

        this.connectedClients.clear();
        this.clientInitializationLocks.clear();

        if (this.wss) {
            for (const c of this.wss.clients) { try { c.terminate(); } catch (e) { /* ignore */ } }
        }

        if (!this.httpServer) return;
        await new Promise<void>((resolve) => {
            const t = setTimeout(() => { log.warn('WS close timed out'); resolve(); }, 2000);
            try { this.wss?.close(); } catch (e) { /* ignore */ }
            this.httpServer!.close(() => { clearTimeout(t); log.info('WS server closed'); resolve(); });
        });
    }

    // ── Message routing ───────────────────────────

    _configureWebSocketServer(server: WebSocketServer): void {
        server.on('connection', (ws: ExtendedWebSocket, request: http.IncomingMessage) => {
            log.info('WS client connected');

            const clientId = `WS-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            const userAgent = request.headers['user-agent'] || '';
            const browserInfo = this.clientHandler.parseBrowserInfo(userAgent);

            this.connectedClients.set(clientId, {
                id: clientId, connectionType: 'WS',
                browser: browserInfo.browser, browserVersion: browserInfo.version,
                platform: browserInfo.platform, userAgent,
                connectedAt: new Date(), lastActivity: new Date()
            });
            ws.clientId = clientId;

            void this.clientHandler.initializeClient(ws, clientId);
            this.clientHandler.broadcastConnectionStatus();

            ws.on('close', () => {
                if (this._closing) return;
                log.info('WS client disconnected');
                this.connectedClients.delete(clientId);
                this.clientInitializationLocks.delete(clientId);
                this.clientHandler.broadcastConnectionStatus();
            });
            ws.on('error', (error: Error) => log.error('WS client error:', error));
            ws.on('pong', () => {
                ws.isAlive = true;
                const c = this.connectedClients.get(clientId);
                if (c) c.lastActivity = new Date();
            });

            ws.on('message', (msg: WS.RawData) => {
                try {
                    const data = JSON.parse(msg.toString()) as WSMessage;
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
                    log.error('Error processing WS client message:', err);
                }
            });
        });

        server.on('error', (error: Error) => {
            log.error('WS server error:', error);
            setTimeout(() => this._restartWebSocketServer(), 5000);
        });
    }

    _dispatchMessage(ws: ExtendedWebSocket, data: WSMessage): void {
        switch (data.type) {
            case 'getVideoRecordingState':
                void this.recordingHandler.sendVideoRecordingState(ws);
                break;
            case 'getRecordingHotkey':
                void this.recordingHandler.sendRecordingHotkey(ws);
                break;
            case 'toggleRule':
                void this.ruleHandler.handleToggleRule(data.ruleId, data.enabled);
                break;
            case 'toggleAllRules':
                void this.ruleHandler.handleToggleAllRules(data.ruleIds, data.enabled);
                break;
            case 'saveRecording':
            case 'saveWorkflow':
                this.recordingHandler.handleSaveRecordingMessage(ws, { type: data.type, recording: data.recording });
                break;
            case 'focusApp':
                void this._handleFocusApp(data.navigation ?? {});
                break;
            case 'startSyncRecording':
                log.info('Received startSyncRecording request:', data.data);
                void this.recordingHandler.handleStartSyncRecording(ws, data.data);
                break;
            case 'stopSyncRecording':
                log.info('Received stopSyncRecording request:', data.data);
                void this.recordingHandler.handleStopSyncRecording(ws, data.data);
                break;
            case 'recordingStateSync':
                log.info('Received recordingStateSync:', data.data);
                void this.recordingHandler.handleRecordingStateSync(ws, data.data);
                break;
        }
    }

    // ── Shared utilities ──────────────────────────

    /** Send an IPC message to all open renderer windows. No-ops with zero windows. */
    _sendToRenderers(channel: string, data: unknown): void {
        try {
            const { BrowserWindow } = electron;
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) win.webContents.send(channel, data);
            }
        } catch { /* non-critical */ }
    }

    async _handleFocusApp(navigation: { tab?: string; subTab?: string; action?: string; itemId?: string }): Promise<void> {
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

    sendToBrowserExtension(message: { type: string }): boolean {
        if (this.connectedClients.size === 0) {
            log.warn('No connected browser extensions to send message to');
            return false;
        }
        const n = this._broadcastToAll(JSON.stringify(message));
        if (n > 0) log.info(`Sent message to ${n} browser extension(s):`, message.type);
        return n > 0;
    }

    // Source delegators
    updateSources(sources: Source[]): void { this.sourceHandler.updateSources(sources); }

    // Rule delegators
    updateRules(rules: RulesCollection): void { this.ruleHandler.updateRules(rules); }
    broadcastRules(): void { this.ruleHandler.broadcastRules(); }

    // Client delegators
    getConnectionStatus() { return this.clientHandler.getConnectionStatus(); }

    // Recording delegators
    broadcastVideoRecordingState(enabled: boolean): void { this.recordingHandler.broadcastVideoRecordingState(enabled); }
    broadcastRecordingHotkeyChange(hotkey: string, enabled?: boolean): void { this.recordingHandler.broadcastRecordingHotkeyChange(hotkey, enabled); }
}

const wsServiceInstance = new WebSocketService();
export { WebSocketService, wsServiceInstance };
export default wsServiceInstance;
