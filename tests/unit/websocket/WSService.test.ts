import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock mainLogger to prevent .js extension resolution issues in CJS→ESM chains
vi.mock('../../../src/utils/mainLogger', () => ({
    default: { createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) },
    createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { WebSocketService } from '../../../src/services/websocket/ws-service';
import type { WSClientInfo } from '../../../src/types/websocket';

describe('WebSocketService', () => {
    let service: WebSocketService;

    beforeEach(() => {
        service = new WebSocketService();
    });

    describe('constructor', () => {
        it('initializes with default ports', () => {
            expect(service.wsPort).toBe(59210);
            expect(service.wssPort).toBe(59211);
            expect(service.host).toBe('127.0.0.1');
        });

        it('initializes with null servers', () => {
            expect(service.wss).toBeNull();
            expect(service.secureWss).toBeNull();
            expect(service.httpServer).toBeNull();
            expect(service.httpsServer).toBeNull();
        });

        it('initializes with empty client collections', () => {
            expect(service.connectedClients.size).toBe(0);
            expect(service.clientInitializationLocks.size).toBe(0);
        });

        it('initializes with empty sources and rules', () => {
            expect(service.sources).toEqual([]);
            expect(service.rules).toEqual({ header: [], request: [], response: [] });
        });

        it('creates all handler instances', () => {
            expect(service.certificateHandler).toBeDefined();
            expect(service.recordingHandler).toBeDefined();
            expect(service.ruleHandler).toBeDefined();
            expect(service.sourceHandler).toBeDefined();
            expect(service.environmentHandler).toBeDefined();
            expect(service.clientHandler).toBeDefined();
            expect(service.networkStateHandler).toBeNull();
        });

        it('initializes _closing to false', () => {
            expect(service._closing).toBe(false);
        });
    });

    describe('isConnected', () => {
        it('returns false when no clients', () => {
            expect(service.isConnected()).toBe(false);
        });

        it('returns true when clients are connected', () => {
            service.connectedClients.set('test', { id: 'test' } as WSClientInfo);
            expect(service.isConnected()).toBe(true);
        });
    });

    describe('sendToBrowserExtension', () => {
        it('returns false when no clients connected', () => {
            const result = service.sendToBrowserExtension({ type: 'test' });
            expect(result).toBe(false);
        });
    });

    describe('_broadcastToAll', () => {
        it('returns 0 when no servers', () => {
            const count = service._broadcastToAll('test');
            expect(count).toBe(0);
        });
    });
});
