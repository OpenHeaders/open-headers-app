import { beforeEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { WSNetworkStateHandler } from '../../../src/services/websocket/ws-network-state';

function createMockService(): ConstructorParameters<typeof WSNetworkStateHandler>[0] {
  return {
    _broadcastToAll: vi.fn().mockReturnValue(0),
  };
}

function makeMockWs(overrides: { readyState?: number; send?: (msg: string) => void } = {}): WebSocket {
  return {
    readyState: 1,
    send: vi.fn(),
    ...overrides,
  } as unknown as WebSocket;
}

describe('WSNetworkStateHandler', () => {
  let handler: WSNetworkStateHandler;

  beforeEach(() => {
    handler = new WSNetworkStateHandler(createMockService());
  });

  describe('constructor', () => {
    it('initializes with default online state and unknown quality', () => {
      const state = handler.getCurrentState();
      expect(state).toEqual({
        isOnline: true,
        networkQuality: 'unknown',
        lastUpdate: expect.any(Number),
      });
      expect(state.lastUpdate).toBeGreaterThan(0);
    });
  });

  describe('updateNetworkState', () => {
    it('updates all fields with provided values', () => {
      handler.updateNetworkState({
        isOnline: false,
        networkQuality: 'poor',
        vpnActive: true,
        connectionType: 'wifi',
        lastUpdate: 0, // lastUpdate is always refreshed internally
      });
      const state = handler.getCurrentState();
      expect(state.isOnline).toBe(false);
      expect(state.networkQuality).toBe('poor');
      expect(state.vpnActive).toBe(true);
      expect(state.connectionType).toBe('wifi');
      expect(state.lastUpdate).toBeGreaterThan(0);
    });

    it('defaults isOnline to true when not provided', () => {
      handler.updateNetworkState({ networkQuality: 'excellent', lastUpdate: 0 });
      expect(handler.getCurrentState().isOnline).toBe(true);
    });

    it('defaults networkQuality to unknown when not provided', () => {
      handler.updateNetworkState({ isOnline: false, lastUpdate: 0 });
      expect(handler.getCurrentState().networkQuality).toBe('unknown');
    });

    it('defaults vpnActive to false when not provided', () => {
      handler.updateNetworkState({ isOnline: true, lastUpdate: 0 });
      expect(handler.getCurrentState().vpnActive).toBe(false);
    });

    it('defaults connectionType to unknown when not provided', () => {
      handler.updateNetworkState({ isOnline: true, lastUpdate: 0 });
      expect(handler.getCurrentState().connectionType).toBe('unknown');
    });

    it('ignores null state', () => {
      const before = handler.getCurrentState();
      handler.updateNetworkState(null);
      const after = handler.getCurrentState();
      expect(after.isOnline).toBe(before.isOnline);
      expect(after.networkQuality).toBe(before.networkQuality);
    });

    it('tracks successive state changes', () => {
      handler.updateNetworkState({ isOnline: true, networkQuality: 'excellent', lastUpdate: 0 });
      expect(handler.getCurrentState().networkQuality).toBe('excellent');

      handler.updateNetworkState({ isOnline: false, networkQuality: 'poor', lastUpdate: 0 });
      expect(handler.getCurrentState().isOnline).toBe(false);
      expect(handler.getCurrentState().networkQuality).toBe('poor');

      handler.updateNetworkState({
        isOnline: true,
        networkQuality: 'good',
        vpnActive: true,
        connectionType: 'ethernet',
        lastUpdate: 0,
      });
      const final = handler.getCurrentState();
      expect(final.isOnline).toBe(true);
      expect(final.networkQuality).toBe('good');
      expect(final.vpnActive).toBe(true);
      expect(final.connectionType).toBe('ethernet');
    });
  });

  describe('getCurrentState', () => {
    it('returns a copy, not the internal object', () => {
      const state1 = handler.getCurrentState();
      const state2 = handler.getCurrentState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('mutations to returned state do not affect internal state', () => {
      const state = handler.getCurrentState();
      state.isOnline = false;
      state.networkQuality = 'mutated';
      expect(handler.getCurrentState().isOnline).toBe(true);
      expect(handler.getCurrentState().networkQuality).toBe('unknown');
    });
  });

  describe('initialize', () => {
    it('sets initial state from network service and subscribes to changes', () => {
      let registeredCallback:
        | ((event: { newState: { isOnline: boolean; networkQuality: string; lastUpdate: number } }) => void)
        | null = null;
      const mockNetworkService = {
        getState: () => ({
          isOnline: true,
          networkQuality: 'excellent',
          lastUpdate: Date.now(),
        }),
        on: (
          event: string,
          cb: (event: { newState: { isOnline: boolean; networkQuality: string; lastUpdate: number } }) => void,
        ) => {
          if (event === 'state-changed') registeredCallback = cb;
        },
      };

      handler.initialize(mockNetworkService);
      expect(handler.getCurrentState().networkQuality).toBe('excellent');
      expect(handler.getCurrentState().isOnline).toBe(true);

      // Simulate going offline
      registeredCallback!({
        newState: { isOnline: false, networkQuality: 'poor', lastUpdate: Date.now() },
      });
      expect(handler.getCurrentState().isOnline).toBe(false);
      expect(handler.getCurrentState().networkQuality).toBe('poor');
    });

    it('handles null network service gracefully', () => {
      handler.initialize(null);
      expect(handler.getCurrentState().isOnline).toBe(true);
    });

    it('handles undefined network service gracefully', () => {
      handler.initialize(undefined);
      expect(handler.getCurrentState().isOnline).toBe(true);
    });

    it('handles network service with no initial state', () => {
      const mockNetworkService = {
        getState: () => null,
        on: vi.fn(),
      };
      handler.initialize(mockNetworkService);
      expect(handler.getCurrentState().isOnline).toBe(true);
      expect(mockNetworkService.on).toHaveBeenCalledWith('state-changed', expect.any(Function));
    });

    it('ignores state-changed events with no newState', () => {
      let registeredCallback: ((event: Record<string, unknown>) => void) | null = null;
      const mockNetworkService = {
        getState: () => ({ isOnline: true, networkQuality: 'good', lastUpdate: Date.now() }),
        on: (_event: string, cb: (event: Record<string, unknown>) => void) => {
          registeredCallback = cb;
        },
      };
      handler.initialize(mockNetworkService);
      expect(handler.getCurrentState().networkQuality).toBe('good');

      // Event with no newState should be ignored
      registeredCallback!({});
      expect(handler.getCurrentState().networkQuality).toBe('good');
    });
  });

  describe('sendInitialState', () => {
    it('sends full initial state message to open client', () => {
      handler.updateNetworkState({
        isOnline: true,
        networkQuality: 'excellent',
        vpnActive: false,
        connectionType: 'ethernet',
        lastUpdate: 0,
      });

      const sendFn = vi.fn();
      const ws = makeMockWs({ send: sendFn });
      handler.sendInitialState(ws);

      expect(sendFn).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(sendFn.mock.calls[0][0] as string);
      expect(parsed.type).toBe('network-state-initial');
      expect(parsed.data.networkState.isOnline).toBe(true);
      expect(parsed.data.networkState.networkQuality).toBe('excellent');
      expect(parsed.data.networkState.vpnActive).toBe(false);
      expect(parsed.data.networkState.connectionType).toBe('ethernet');
      expect(parsed.data.timestamp).toBeGreaterThan(0);
    });

    it('does not send to non-open client (readyState=3)', () => {
      const sendFn = vi.fn();
      const ws = makeMockWs({ readyState: 3, send: sendFn });
      handler.sendInitialState(ws);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('does not send to connecting client (readyState=0)', () => {
      const sendFn = vi.fn();
      const ws = makeMockWs({ readyState: 0, send: sendFn });
      handler.sendInitialState(ws);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('does not send to null ws', () => {
      handler.sendInitialState(null as unknown as WebSocket);
      // Should not throw
    });

    it('handles send error gracefully', () => {
      const ws = makeMockWs({
        send: () => {
          throw new Error('Connection reset by peer');
        },
      });
      // Should not throw
      handler.sendInitialState(ws);
    });
  });

  describe('broadcastNetworkState', () => {
    it('delegates to _broadcastToAll with correct message', () => {
      handler.broadcastNetworkState();

      const broadcastFn = handler.wsService._broadcastToAll as ReturnType<typeof vi.fn>;
      expect(broadcastFn).toHaveBeenCalledTimes(1);

      const parsed = JSON.parse(broadcastFn.mock.calls[0][0] as string);
      expect(parsed.type).toBe('network-state-update');
      expect(parsed.data.networkState).toBeDefined();
      expect(parsed.data.timestamp).toBeGreaterThan(0);
    });

    it('broadcasts current state including VPN and connection type', () => {
      handler.updateNetworkState({
        isOnline: true,
        networkQuality: 'good',
        vpnActive: true,
        connectionType: 'wifi',
        lastUpdate: 0,
      });

      const broadcastFn = handler.wsService._broadcastToAll as ReturnType<typeof vi.fn>;
      // updateNetworkState calls broadcastNetworkState internally
      const lastCall = broadcastFn.mock.calls[broadcastFn.mock.calls.length - 1];
      const parsed = JSON.parse(lastCall[0] as string);
      expect(parsed.data.networkState).toEqual({
        isOnline: true,
        networkQuality: 'good',
        vpnActive: true,
        connectionType: 'wifi',
        lastUpdate: expect.any(Number),
      });
    });
  });
});
