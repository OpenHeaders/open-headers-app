import { describe, it, expect, beforeEach } from 'vitest';
import type WebSocket from 'ws';
import { WSNetworkStateHandler } from '../../../src/services/websocket/ws-network-state';

function createMockService(): ConstructorParameters<typeof WSNetworkStateHandler>[0] {
    return {
        wss: null,
        secureWss: null
    };
}

function makeMockWs(overrides: { readyState?: number; send?: (msg: string) => void } = {}): WebSocket {
    return {
        readyState: 1,
        send: () => {},
        ...overrides,
    } as unknown as WebSocket;
}

describe('WSNetworkStateHandler', () => {
    let handler: WSNetworkStateHandler;

    beforeEach(() => {
        handler = new WSNetworkStateHandler(createMockService());
    });

    describe('constructor', () => {
        it('initializes with default online state', () => {
            const state = handler.getCurrentState();
            expect(state.isOnline).toBe(true);
            expect(state.networkQuality).toBe('unknown');
            expect(state.lastUpdate).toBeGreaterThan(0);
        });
    });

    describe('updateNetworkState', () => {
        it('updates state with new values', () => {
            handler.updateNetworkState({
                isOnline: false,
                networkQuality: 'poor',
                vpnActive: true,
                connectionType: 'wifi',
                lastUpdate: 0
            });
            const state = handler.getCurrentState();
            expect(state.isOnline).toBe(false);
            expect(state.networkQuality).toBe('poor');
            expect(state.vpnActive).toBe(true);
            expect(state.connectionType).toBe('wifi');
            expect(state.lastUpdate).toBeGreaterThan(0); // lastUpdate is always refreshed
        });

        it('defaults isOnline to true when not provided', () => {
            handler.updateNetworkState({ networkQuality: 'good', lastUpdate: 0 });
            expect(handler.getCurrentState().isOnline).toBe(true);
        });

        it('defaults networkQuality to unknown when not provided', () => {
            handler.updateNetworkState({ isOnline: true, lastUpdate: 0 });
            expect(handler.getCurrentState().networkQuality).toBe('unknown');
        });

        it('ignores null state', () => {
            const before = handler.getCurrentState();
            handler.updateNetworkState(null);
            const after = handler.getCurrentState();
            expect(after.isOnline).toBe(before.isOnline);
        });
    });

    describe('getCurrentState', () => {
        it('returns a copy, not the internal object', () => {
            const state1 = handler.getCurrentState();
            const state2 = handler.getCurrentState();
            expect(state1).toEqual(state2);
            expect(state1).not.toBe(state2);
        });
    });

    describe('initialize', () => {
        it('subscribes to state-changed events', () => {
            let registeredCallback: ((event: { newState: { isOnline: boolean; networkQuality: string; lastUpdate: number } }) => void) | null = null;
            const mockNetworkService = {
                getState: () => ({ isOnline: true, networkQuality: 'good', lastUpdate: Date.now() }),
                on: (event: string, cb: (event: { newState: { isOnline: boolean; networkQuality: string; lastUpdate: number } }) => void) => {
                    if (event === 'state-changed') registeredCallback = cb;
                }
            };

            handler.initialize(mockNetworkService);
            expect(handler.getCurrentState().networkQuality).toBe('good');

            // Simulate state change event
            registeredCallback!({ newState: { isOnline: false, networkQuality: 'poor', lastUpdate: Date.now() } });
            expect(handler.getCurrentState().isOnline).toBe(false);
            expect(handler.getCurrentState().networkQuality).toBe('poor');
        });

        it('handles null network service gracefully', () => {
            handler.initialize(null);
            // Should not throw
            expect(handler.getCurrentState().isOnline).toBe(true);
        });

        it('handles network service with no initial state', () => {
            const mockNetworkService = {
                getState: () => null,
                on: () => {}
            };
            handler.initialize(mockNetworkService);
            // State should remain default
            expect(handler.getCurrentState().isOnline).toBe(true);
        });
    });

    describe('sendInitialState', () => {
        it('sends state to open client', () => {
            let sentMessage: string | null = null;
            const ws = makeMockWs({ send: (msg: string) => { sentMessage = msg; } });
            handler.sendInitialState(ws);
            expect(sentMessage).not.toBeNull();
            const parsed = JSON.parse(sentMessage!);
            expect(parsed.type).toBe('network-state-initial');
            expect(parsed.data.networkState.isOnline).toBe(true);
        });

        it('does not send to non-open client', () => {
            let sentMessage: string | null = null;
            const ws = makeMockWs({ readyState: 3, send: (msg: string) => { sentMessage = msg; } });
            handler.sendInitialState(ws);
            expect(sentMessage).toBeNull();
        });

        it('does not send to null ws', () => {
            // Should not throw
            handler.sendInitialState(null as unknown as WebSocket);
        });
    });

    describe('broadcastNetworkState', () => {
        it('sends to all open WS clients', () => {
            const messages: string[] = [];
            const mockWss = {
                clients: new Set([
                    { readyState: 1, send: (msg: string) => messages.push(msg) },
                    { readyState: 3, send: () => {} }, // closed - should not receive
                ])
            };
            handler.wsService.wss = mockWss;
            handler.broadcastNetworkState();
            expect(messages).toHaveLength(1);
            const parsed = JSON.parse(messages[0]);
            expect(parsed.type).toBe('network-state-update');
        });

        it('handles null servers', () => {
            handler.wsService.wss = null;
            handler.wsService.secureWss = null;
            // Should not throw
            handler.broadcastNetworkState();
        });
    });
});
