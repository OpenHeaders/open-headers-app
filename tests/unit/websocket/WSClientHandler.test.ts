import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSClientHandler } from '../../../src/services/websocket/ws-client-handler';
import type { WSClientInfo } from '../../../src/types/websocket';

function makeClientInfo(overrides: Partial<WSClientInfo> & { id: string }): WSClientInfo {
    return {
        connectionType: 'WS',
        browser: 'chrome',
        browserVersion: '122.0.6261.112',
        platform: 'macos',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
        connectedAt: new Date('2026-01-20T14:45:12.345Z'),
        lastActivity: new Date('2026-01-20T14:50:00.000Z'),
        ...overrides,
    };
}

function createMockService(): ConstructorParameters<typeof WSClientHandler>[0] {
    return {
        connectedClients: new Map(),
        clientInitializationLocks: new Map(),
        wss: null,
        secureWss: null,
        wsPort: 59210,
        wssPort: 59211,
        sourceHandler: { sendSourcesToClient: vi.fn().mockResolvedValue(undefined) },
        ruleHandler: { sendRulesToClient: vi.fn().mockResolvedValue(undefined) },
        recordingHandler: { sendVideoRecordingState: vi.fn().mockResolvedValue(undefined) },
        networkStateHandler: null,
        certificateHandler: {
            certificatePaths: {
                fingerprint: 'A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:12:34:56:78:90:A1:B2:C3:D4',
                certPath: '/Users/jane.doe/Library/Application Support/OpenHeaders/certs/server.cert',
                validTo: '2027-03-15T12:00:00.000Z',
                subject: 'O=OpenHeaders\nCN=OpenHeaders localhost'
            }
        }
    };
}

describe('WSClientHandler', () => {
    let handler: WSClientHandler;
    let mockService: ReturnType<typeof createMockService>;

    beforeEach(() => {
        mockService = createMockService();
        handler = new WSClientHandler(mockService);
    });

    describe('constructor', () => {
        it('initializes with correct default values', () => {
            expect(handler.clientCleanupInterval).toBeNull();
            expect(handler.maxClientInactivity).toBe(5 * 60 * 1000);
            expect(handler.cleanupIntervalTime).toBe(60 * 1000);
            expect(handler.wsService).toBe(mockService);
        });
    });

    describe('parseBrowserInfo', () => {
        it('detects Chrome on Windows with full version', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36';
            const info = handler.parseBrowserInfo(ua);
            expect(info).toEqual({
                browser: 'chrome',
                version: '122.0.6261.112',
                platform: 'windows',
            });
        });

        it('detects Firefox on Linux', () => {
            const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
            const info = handler.parseBrowserInfo(ua);
            expect(info).toEqual({
                browser: 'firefox',
                version: '123.0',
                platform: 'linux',
            });
        });

        it('detects Edge on Windows (not Chrome)', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36 Edg/122.0.2365.92';
            const info = handler.parseBrowserInfo(ua);
            expect(info).toEqual({
                browser: 'edge',
                version: '122.0.2365.92',
                platform: 'windows',
            });
        });

        it('detects Safari on macOS', () => {
            const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15';
            const info = handler.parseBrowserInfo(ua);
            expect(info).toEqual({
                browser: 'safari',
                version: '17.3.1',
                platform: 'macos',
            });
        });

        it('returns unknown for unrecognized user agent', () => {
            const info = handler.parseBrowserInfo('OpenHeaders-Extension/2.1.0');
            expect(info).toEqual({
                browser: 'unknown',
                version: '',
                platform: 'unknown',
            });
        });

        it('returns unknown for empty string', () => {
            const info = handler.parseBrowserInfo('');
            expect(info).toEqual({
                browser: 'unknown',
                version: '',
                platform: 'unknown',
            });
        });

        it('detects Chrome on macOS (not Safari)', () => {
            const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('chrome');
            expect(info.platform).toBe('macos');
        });

        it('detects Firefox on Windows', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('firefox');
            expect(info.platform).toBe('windows');
        });
    });

    describe('getConnectionStatus', () => {
        it('returns full empty status shape when no clients', () => {
            const status = handler.getConnectionStatus();
            expect(status).toEqual({
                totalConnections: 0,
                browserCounts: {},
                clients: [],
                wsServerRunning: false,
                wssServerRunning: false,
                wsPort: 59210,
                wssPort: 59211,
                certificateFingerprint: 'A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:12:34:56:78:90:A1:B2:C3:D4',
                certificatePath: '/Users/jane.doe/Library/Application Support/OpenHeaders/certs/server.cert',
                certificateExpiry: '2027-03-15T12:00:00.000Z',
                certificateSubject: 'O=OpenHeaders\nCN=OpenHeaders localhost',
            });
        });

        it('returns correct status with enterprise clients', () => {
            const connectedAt = new Date('2026-01-20T14:45:12.345Z');
            const lastActivity = new Date('2026-01-20T14:50:00.000Z');

            mockService.connectedClients.set('WS-1709123456789-a1b2c3d4e', makeClientInfo({
                id: 'WS-1709123456789-a1b2c3d4e',
                browser: 'chrome',
                browserVersion: '122.0.6261.112',
                platform: 'macos',
                connectionType: 'WS',
                extensionVersion: '2.1.0',
                connectedAt,
                lastActivity,
            }));
            mockService.connectedClients.set('WSS-1709123456790-f5g6h7i8j', makeClientInfo({
                id: 'WSS-1709123456790-f5g6h7i8j',
                browser: 'firefox',
                browserVersion: '123.0',
                platform: 'linux',
                connectionType: 'WSS',
                connectedAt,
                lastActivity,
            }));

            const status = handler.getConnectionStatus();
            expect(status.totalConnections).toBe(2);
            expect(status.browserCounts).toEqual({ chrome: 1, firefox: 1 });
            expect(status.clients).toHaveLength(2);

            const chromeClient = status.clients.find(c => c.browser === 'chrome')!;
            expect(chromeClient.id).toBe('WS-1709123456789-a1b2c3d4e');
            expect(chromeClient.connectionType).toBe('WS');
            expect(chromeClient.extensionVersion).toBe('2.1.0');
            expect(chromeClient.connectedAt).toEqual(connectedAt);
            expect(chromeClient.lastActivity).toEqual(lastActivity);

            const firefoxClient = status.clients.find(c => c.browser === 'firefox')!;
            expect(firefoxClient.connectionType).toBe('WSS');
            expect(firefoxClient.extensionVersion).toBeUndefined();
        });

        it('counts multiple same-browser connections', () => {
            for (let i = 0; i < 5; i++) {
                mockService.connectedClients.set(`WS-${i}`, makeClientInfo({
                    id: `WS-${i}`,
                    browser: 'chrome',
                    browserVersion: `122.0.${i}`,
                }));
            }
            mockService.connectedClients.set('WS-edge', makeClientInfo({
                id: 'WS-edge',
                browser: 'edge',
            }));

            const status = handler.getConnectionStatus();
            expect(status.totalConnections).toBe(6);
            expect(status.browserCounts).toEqual({ chrome: 5, edge: 1 });
        });

        it('handles unknown browser gracefully', () => {
            mockService.connectedClients.set('WS-unknown', makeClientInfo({
                id: 'WS-unknown',
                browser: '',
            }));
            const status = handler.getConnectionStatus();
            expect(status.browserCounts).toEqual({ unknown: 1 });
        });

        it('reports server running status based on wss/secureWss', () => {
            mockService.wss = {} as typeof mockService.wss;
            const status1 = handler.getConnectionStatus();
            expect(status1.wsServerRunning).toBe(true);
            expect(status1.wssServerRunning).toBe(false);

            mockService.secureWss = {} as typeof mockService.secureWss;
            const status2 = handler.getConnectionStatus();
            expect(status2.wsServerRunning).toBe(true);
            expect(status2.wssServerRunning).toBe(true);
        });

        it('returns null certificate fields when handler is missing', () => {
            (mockService as Record<string, unknown>).certificateHandler = undefined;
            const status = handler.getConnectionStatus();
            expect(status.certificateFingerprint).toBeNull();
            expect(status.certificatePath).toBeNull();
            expect(status.certificateExpiry).toBeNull();
            expect(status.certificateSubject).toBeNull();
        });
    });

    describe('initializeClient', () => {
        it('initializes client with sources, rules, and recording state', async () => {
            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];
            const clientId = 'WS-1709123456789-a1b2c3d4e';

            await handler.initializeClient(mockWs, clientId);

            expect(mockWs.isInitialized).toBe(true);
            expect(mockService.sourceHandler.sendSourcesToClient).toHaveBeenCalledWith(mockWs);
            expect(mockService.ruleHandler.sendRulesToClient).toHaveBeenCalledWith(mockWs);
            expect(mockService.recordingHandler.sendVideoRecordingState).toHaveBeenCalledWith(mockWs);
        });

        it('sends initial network state when networkStateHandler is available', async () => {
            const sendInitialState = vi.fn();
            mockService.networkStateHandler = { sendInitialState };
            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];

            await handler.initializeClient(mockWs, 'client-1');

            expect(sendInitialState).toHaveBeenCalledWith(mockWs);
        });

        it('skips network state when networkStateHandler is null', async () => {
            mockService.networkStateHandler = null;
            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];

            await handler.initializeClient(mockWs, 'client-1');
            expect(mockWs.isInitialized).toBe(true);
        });

        it('sets lock to initialized after success', async () => {
            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];
            const clientId = 'WS-1709123456789-a1b2c3d4e';

            await handler.initializeClient(mockWs, clientId);

            const lock = mockService.clientInitializationLocks.get(clientId);
            expect(lock).toBeDefined();
            expect(lock!.status).toBe('initialized');
            expect(lock!.promise).toBeNull();
        });

        it('returns early if client already initialized', async () => {
            const clientId = 'client-already-init';
            mockService.clientInitializationLocks.set(clientId, {
                status: 'initialized',
                promise: null,
            });
            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];

            await handler.initializeClient(mockWs, clientId);
            // Should NOT call any send methods (early return)
            expect(mockService.sourceHandler.sendSourcesToClient).not.toHaveBeenCalled();
        });

        it('waits for existing initializing lock', async () => {
            const clientId = 'client-waiting';
            let resolveExisting!: (value: boolean) => void;
            const existingPromise = new Promise<boolean>((resolve) => { resolveExisting = resolve; });
            mockService.clientInitializationLocks.set(clientId, {
                status: 'initializing',
                promise: existingPromise,
            });

            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];
            const initPromise = handler.initializeClient(mockWs, clientId);
            resolveExisting(true);
            await initPromise;
            // Should return without calling send (waited on existing)
            expect(mockService.sourceHandler.sendSourcesToClient).not.toHaveBeenCalled();
        });

        it('cleans up lock on initialization failure', async () => {
            const clientId = 'client-fail';
            (mockService.sourceHandler.sendSourcesToClient as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection lost'));

            const mockWs = { isInitialized: false } as Parameters<typeof handler.initializeClient>[0];

            // initializeClient creates an internal lock promise that rejects on failure.
            // We need to catch both the main call and the lock promise to avoid unhandled rejections.
            const initPromise = handler.initializeClient(mockWs, clientId);

            // The lock promise is stored in clientInitializationLocks — catch it to prevent unhandled rejection
            const lock = mockService.clientInitializationLocks.get(clientId);
            if (lock?.promise) {
                lock.promise.catch(() => { /* expected rejection */ });
            }

            try {
                await initPromise;
            } catch {
                // expected
            }

            expect(mockService.clientInitializationLocks.has(clientId)).toBe(false);
        });
    });

    describe('startClientCleanup / stopClientCleanup', () => {
        it('starts cleanup interval', () => {
            handler.startClientCleanup();
            expect(handler.clientCleanupInterval).not.toBeNull();
            handler.stopClientCleanup();
        });

        it('stops cleanup interval and sets to null', () => {
            handler.startClientCleanup();
            handler.stopClientCleanup();
            expect(handler.clientCleanupInterval).toBeNull();
        });

        it('replaces existing interval on restart', () => {
            handler.startClientCleanup();
            const firstInterval = handler.clientCleanupInterval;
            handler.startClientCleanup();
            expect(handler.clientCleanupInterval).not.toBe(firstInterval);
            handler.stopClientCleanup();
        });

        it('stopClientCleanup is idempotent when no interval', () => {
            handler.stopClientCleanup();
            handler.stopClientCleanup();
            expect(handler.clientCleanupInterval).toBeNull();
        });
    });

    describe('_cleanupStaleClients', () => {
        it('does nothing when no stale clients', () => {
            mockService.connectedClients.set('fresh-client', makeClientInfo({
                id: 'fresh-client',
                lastActivity: new Date(), // just now
            }));

            handler._cleanupStaleClients();
            expect(mockService.connectedClients.size).toBe(1);
        });

        it('removes stale clients from connectedClients when no ws match found', () => {
            const staleTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
            mockService.connectedClients.set('stale-1', makeClientInfo({
                id: 'stale-1',
                lastActivity: staleTime,
                connectedAt: staleTime,
            }));

            handler._cleanupStaleClients();
            // Stale client removed from map since no WS server to find it in
            expect(mockService.connectedClients.has('stale-1')).toBe(false);
        });

        it('uses connectedAt as fallback when lastActivity is missing', () => {
            const staleTime = new Date(Date.now() - 10 * 60 * 1000);
            const clientInfo = makeClientInfo({
                id: 'stale-no-activity',
                connectedAt: staleTime,
            });
            // Simulate missing lastActivity by casting
            (clientInfo as Record<string, unknown>).lastActivity = undefined;
            mockService.connectedClients.set('stale-no-activity', clientInfo);

            handler._cleanupStaleClients();
            expect(mockService.connectedClients.has('stale-no-activity')).toBe(false);
        });
    });
});
