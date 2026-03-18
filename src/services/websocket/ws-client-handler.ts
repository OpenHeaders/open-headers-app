/**
 * WebSocket Client Handler
 * Manages client initialization, heartbeat, cleanup, and connection status
 */

import WebSocket from 'ws';
import electron from 'electron';
import mainLogger from '../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('WSClientHandler');

interface BrowserInfo {
    browser: string;
    version: string;
    platform: string;
}

interface ClientInfo {
    id: string;
    connectionType: string;
    browser: string;
    browserVersion: string;
    platform: string;
    userAgent: string;
    connectedAt: Date;
    lastActivity: Date;
    extensionVersion?: string;
}

interface InitLock {
    status: 'initializing' | 'initialized';
    promise: Promise<boolean> | null;
}

interface WSServiceLike {
    connectedClients: Map<string, ClientInfo>;
    clientInitializationLocks: Map<string, InitLock>;
    wss: any;
    secureWss: any;
    wsPort: number;
    wssPort: number;
    sourceHandler: { sendSourcesToClient(ws: any): Promise<void> };
    ruleHandler: { sendRulesToClient(ws: any): Promise<void> };
    recordingHandler: { sendVideoRecordingState(ws: any): Promise<void> };
    networkStateHandler: { sendInitialState(ws: any): void } | null;
    certificateHandler: {
        certificatePaths: {
            fingerprint: string | null;
            certPath: string | null;
            validTo: string | null;
            subject: string | null;
        };
    };
}

class WSClientHandler {
    wsService: WSServiceLike;
    clientCleanupInterval: ReturnType<typeof setInterval> | null;
    maxClientInactivity: number;
    cleanupIntervalTime: number;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
        this.clientCleanupInterval = null;
        this.maxClientInactivity = 5 * 60 * 1000; // 5 minutes
        this.cleanupIntervalTime = 60 * 1000; // Check every minute
    }

    /**
     * Initialize client with proper locking to prevent race conditions
     */
    async initializeClient(ws: any, clientId: string): Promise<void> {
        const existingLock = this.wsService.clientInitializationLocks.get(clientId);
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

        let resolveInit!: (value: boolean) => void;
        let rejectInit!: (reason: any) => void;
        const initPromise = new Promise<boolean>((resolve, reject) => {
            resolveInit = resolve;
            rejectInit = reject;
        });

        this.wsService.clientInitializationLocks.set(clientId, {
            status: 'initializing',
            promise: initPromise
        });

        try {
            log.info(`Initializing client ${clientId}`);

            await Promise.all([
                this.wsService.sourceHandler.sendSourcesToClient(ws),
                this.wsService.ruleHandler.sendRulesToClient(ws),
                this.wsService.recordingHandler.sendVideoRecordingState(ws)
            ]);

            if (this.wsService.networkStateHandler) {
                this.wsService.networkStateHandler.sendInitialState(ws);
            }

            ws.isInitialized = true;
            this.wsService.clientInitializationLocks.set(clientId, {
                status: 'initialized',
                promise: null
            });

            log.info(`Client ${clientId} initialized successfully`);
            resolveInit(true);
        } catch (error) {
            log.error(`Failed to initialize client ${clientId}:`, error);
            this.wsService.clientInitializationLocks.delete(clientId);
            rejectInit(error);
        }
    }

    /**
     * Parse browser information from user agent string
     */
    parseBrowserInfo(userAgent: string): BrowserInfo {
        const browserInfo: BrowserInfo = {
            browser: 'unknown',
            version: '',
            platform: 'unknown'
        };

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
     */
    getConnectionStatus(): Record<string, any> {
        const clients = Array.from(this.wsService.connectedClients.values());

        const browserCounts: Record<string, number> = {};
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
            wsServerRunning: this.wsService.wss !== null,
            wssServerRunning: this.wsService.secureWss !== null,
            wsPort: this.wsService.wsPort,
            wssPort: this.wsService.wssPort,
            certificateFingerprint: this.wsService.certificateHandler?.certificatePaths?.fingerprint || null,
            certificatePath: this.wsService.certificateHandler?.certificatePaths?.certPath || null,
            certificateExpiry: this.wsService.certificateHandler?.certificatePaths?.validTo || null,
            certificateSubject: this.wsService.certificateHandler?.certificatePaths?.subject || null
        };
    }

    /**
     * Broadcast connection status to all renderer windows
     */
    broadcastConnectionStatus(): void {
        try {
            const { BrowserWindow } = electron;
            const status = this.getConnectionStatus();

            BrowserWindow.getAllWindows().forEach((window: any) => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('ws-connection-status-changed', status);
                }
            });
        } catch (error: any) {
            log.debug('Could not broadcast connection status:', error.message);
        }
    }

    /**
     * Start periodic client cleanup
     */
    startClientCleanup(): void {
        if (this.clientCleanupInterval) {
            clearInterval(this.clientCleanupInterval);
        }

        this.clientCleanupInterval = setInterval(() => {
            this._cleanupStaleClients();
        }, this.cleanupIntervalTime);

        log.info('Started periodic client cleanup');
    }

    /**
     * Stop periodic client cleanup
     */
    stopClientCleanup(): void {
        if (this.clientCleanupInterval) {
            clearInterval(this.clientCleanupInterval);
            this.clientCleanupInterval = null;
        }
    }

    /**
     * Clean up stale client connections
     */
    _cleanupStaleClients(): void {
        const now = Date.now();
        const staleClients: Array<{ clientId: string; clientInfo: ClientInfo; inactiveTime: number }> = [];

        for (const [clientId, clientInfo] of this.wsService.connectedClients) {
            const lastActivity = clientInfo.lastActivity?.getTime() || clientInfo.connectedAt.getTime();
            const inactiveTime = now - lastActivity;

            if (inactiveTime > this.maxClientInactivity) {
                staleClients.push({ clientId, clientInfo, inactiveTime });
            }
        }

        if (staleClients.length === 0) return;

        log.info(`Found ${staleClients.length} stale clients to clean up`);

        staleClients.forEach(({ clientId, inactiveTime }) => {
            log.info(`Cleaning up stale client ${clientId} (inactive for ${Math.round(inactiveTime / 1000)}s)`);

            const closeClient = (server: any): boolean => {
                if (!server) return false;
                for (const client of server.clients) {
                    if (client.clientId === clientId && client.readyState === WebSocket.OPEN) {
                        client.close(1000, 'Inactive connection');
                        return true;
                    }
                }
                return false;
            };

            const closed = closeClient(this.wsService.wss) || closeClient(this.wsService.secureWss);

            if (!closed) {
                this.wsService.connectedClients.delete(clientId);
                this.wsService.clientInitializationLocks.delete(clientId);
            }
        });

        this.broadcastConnectionStatus();
    }

    /**
     * Perform heartbeat check on all clients
     */
    performHeartbeat(): void {
        const pingClients = (server: any) => {
            if (!server) return;

            server.clients.forEach((client: any) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.isAlive = false;
                    client.ping(() => {});
                }
            });
        };

        pingClients(this.wsService.wss);
        pingClients(this.wsService.secureWss);

        setTimeout(() => {
            const terminateDeadClients = (server: any) => {
                if (!server) return;
                server.clients.forEach((client: any) => {
                    if (!client.isAlive && client.readyState === WebSocket.OPEN) {
                        log.info(`Terminating dead client: ${client.clientId}`);
                        client.terminate();
                    }
                });
            };

            terminateDeadClients(this.wsService.wss);
            terminateDeadClients(this.wsService.secureWss);
        }, 30000);
    }
}

export { WSClientHandler };
export default WSClientHandler;
