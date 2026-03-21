import { describe, it, expect, beforeEach } from 'vitest';
import { WSClientHandler } from '../../../src/services/websocket/ws-client-handler';

function createMockService(): ConstructorParameters<typeof WSClientHandler>[0] {
    return {
        connectedClients: new Map(),
        clientInitializationLocks: new Map(),
        wss: null,
        secureWss: null,
        wsPort: 59210,
        wssPort: 59211,
        sourceHandler: { sendSourcesToClient: async () => {} },
        ruleHandler: { sendRulesToClient: async () => {} },
        recordingHandler: { sendVideoRecordingState: async () => {} },
        networkStateHandler: null,
        certificateHandler: {
            certificatePaths: {
                fingerprint: 'AA:BB:CC',
                certPath: '/tmp/cert.pem',
                validTo: '2027-01-01',
                subject: 'CN=test'
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
        it('initializes with default values', () => {
            expect(handler.clientCleanupInterval).toBeNull();
            expect(handler.maxClientInactivity).toBe(5 * 60 * 1000);
            expect(handler.cleanupIntervalTime).toBe(60 * 1000);
        });
    });

    // ------- parseBrowserInfo -------
    describe('parseBrowserInfo', () => {
        it('detects Chrome', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('chrome');
            expect(info.version).toBe('120.0.0.0');
            expect(info.platform).toBe('windows');
        });

        it('detects Firefox', () => {
            const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('firefox');
            expect(info.version).toBe('121.0');
            expect(info.platform).toBe('linux');
        });

        it('detects Edge', () => {
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('edge');
            expect(info.version).toBe('120.0.0.0');
            expect(info.platform).toBe('windows');
        });

        it('detects Safari', () => {
            const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
            const info = handler.parseBrowserInfo(ua);
            expect(info.browser).toBe('safari');
            expect(info.version).toBe('17.2');
            expect(info.platform).toBe('macos');
        });

        it('returns unknown for unrecognized user agent', () => {
            const info = handler.parseBrowserInfo('SomeBot/1.0');
            expect(info.browser).toBe('unknown');
            expect(info.version).toBe('');
            expect(info.platform).toBe('unknown');
        });

        it('handles empty string', () => {
            const info = handler.parseBrowserInfo('');
            expect(info.browser).toBe('unknown');
            expect(info.platform).toBe('unknown');
        });
    });

    // ------- getConnectionStatus -------
    describe('getConnectionStatus', () => {
        it('returns empty status when no clients', () => {
            const status = handler.getConnectionStatus();
            expect(status.totalConnections).toBe(0);
            expect(status.clients).toEqual([]);
            expect(status.browserCounts).toEqual({});
            expect(status.wsServerRunning).toBe(false);
            expect(status.wssServerRunning).toBe(false);
            expect(status.wsPort).toBe(59210);
            expect(status.wssPort).toBe(59211);
        });

        it('returns correct status with connected clients', () => {
            mockService.connectedClients.set('client-1', {
                id: 'client-1',
                browser: 'chrome',
                browserVersion: '120.0',
                platform: 'windows',
                connectionType: 'WS',
                connectedAt: new Date(),
                lastActivity: new Date(),
                extensionVersion: '1.0.0'
            });
            mockService.connectedClients.set('client-2', {
                id: 'client-2',
                browser: 'firefox',
                browserVersion: '121.0',
                platform: 'linux',
                connectionType: 'WSS',
                connectedAt: new Date(),
                lastActivity: new Date()
            });

            const status = handler.getConnectionStatus();
            expect(status.totalConnections).toBe(2);
            expect(status.browserCounts).toEqual({ chrome: 1, firefox: 1 });
            expect(status.clients).toHaveLength(2);
            expect(status.clients[0].browser).toBe('chrome');
            expect(status.clients[1].browser).toBe('firefox');
        });

        it('counts multiple same-browser connections', () => {
            mockService.connectedClients.set('c1', {
                id: 'c1', browser: 'chrome', browserVersion: '120', platform: 'windows',
                connectionType: 'WS', connectedAt: new Date(), lastActivity: new Date()
            });
            mockService.connectedClients.set('c2', {
                id: 'c2', browser: 'chrome', browserVersion: '121', platform: 'macos',
                connectionType: 'WS', connectedAt: new Date(), lastActivity: new Date()
            });

            const status = handler.getConnectionStatus();
            expect(status.browserCounts).toEqual({ chrome: 2 });
        });

        it('includes certificate information', () => {
            const status = handler.getConnectionStatus();
            expect(status.certificateFingerprint).toBe('AA:BB:CC');
            expect(status.certificatePath).toBe('/tmp/cert.pem');
            expect(status.certificateExpiry).toBe('2027-01-01');
            expect(status.certificateSubject).toBe('CN=test');
        });
    });

    // ------- startClientCleanup / stopClientCleanup -------
    describe('startClientCleanup', () => {
        it('starts cleanup interval', () => {
            handler.startClientCleanup();
            expect(handler.clientCleanupInterval).not.toBeNull();
            handler.stopClientCleanup();
        });

        it('stops cleanup interval', () => {
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
    });
});
