import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mainLogger to prevent .js extension resolution issues in CJS→ESM chains
vi.mock('@/utils/mainLogger', () => ({
  default: { createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) },
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { WebSocketService } from '@/services/websocket/ws-service';
import type { RulesCollection } from '@/types/rules';
import type { Source } from '@/types/source';
import type { WSClientInfo } from '@/types/websocket';

function makeClientInfo(overrides: Partial<WSClientInfo> & { id: string }): WSClientInfo {
  return {
    connectionType: 'WS',
    browser: 'chrome',
    browserVersion: '122.0.6261.112',
    platform: 'macos',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
    connectedAt: new Date('2026-01-20T14:45:12.345Z'),
    lastActivity: new Date('2026-01-20T14:50:00.000Z'),
    ...overrides,
  };
}

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    service = new WebSocketService();
  });

  describe('constructor', () => {
    it('initializes with correct default port and host', () => {
      expect(service.wsPort).toBe(59210);
      expect(service.host).toBe('127.0.0.1');
    });

    it('initializes servers to null', () => {
      expect(service.wss).toBeNull();
      expect(service.httpServer).toBeNull();
    });

    it('initializes with empty client collections', () => {
      expect(service.connectedClients).toBeInstanceOf(Map);
      expect(service.connectedClients.size).toBe(0);
      expect(service.clientInitializationLocks).toBeInstanceOf(Map);
      expect(service.clientInitializationLocks.size).toBe(0);
    });

    it('initializes with empty sources and rules', () => {
      expect(service.sources).toEqual([]);
      expect(service.rules).toEqual({ header: [], request: [], response: [] });
    });

    it('creates all handler instances with correct types', () => {
      expect(service.recordingHandler).toBeDefined();
      expect(service.recordingHandler.constructor.name).toBe('WSRecordingHandler');
      expect(service.ruleHandler).toBeDefined();
      expect(service.ruleHandler.constructor.name).toBe('WSRuleHandler');
      expect(service.sourceHandler).toBeDefined();
      expect(service.sourceHandler.constructor.name).toBe('WSSourceHandler');
      expect(service.environmentHandler).toBeDefined();
      expect(service.environmentHandler.constructor.name).toBe('WSEnvironmentHandler');
      expect(service.clientHandler).toBeDefined();
      expect(service.clientHandler.constructor.name).toBe('WSClientHandler');
      expect(service.networkStateHandler).toBeNull();
    });

    it('initializes lifecycle flags correctly', () => {
      expect(service._closing).toBe(false);
      expect(service.isInitializing).toBe(false);
      expect(service.appDataPath).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('returns false when no clients', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('returns true when a single client is connected', () => {
      service.connectedClients.set(
        'WS-1709123456789-a1b2c3d4e',
        makeClientInfo({
          id: 'WS-1709123456789-a1b2c3d4e',
        }),
      );
      expect(service.isConnected()).toBe(true);
    });

    it('returns true when multiple clients are connected', () => {
      service.connectedClients.set(
        'WS-1709123456789-a1b2c3d4e',
        makeClientInfo({
          id: 'WS-1709123456789-a1b2c3d4e',
          browser: 'chrome',
        }),
      );
      service.connectedClients.set(
        'WS-1709123456790-f5g6h7i8j',
        makeClientInfo({
          id: 'WS-1709123456790-f5g6h7i8j',
          browser: 'firefox',
        }),
      );
      expect(service.isConnected()).toBe(true);
      expect(service.connectedClients.size).toBe(2);
    });

    it('returns false after all clients disconnect', () => {
      service.connectedClients.set('WS-1', makeClientInfo({ id: 'WS-1' }));
      expect(service.isConnected()).toBe(true);
      service.connectedClients.delete('WS-1');
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('sendToBrowserExtension', () => {
    it('returns false when no clients connected', () => {
      const result = service.sendToBrowserExtension({ type: 'rules-update' });
      expect(result).toBe(false);
    });

    it('returns false for various message types when no clients', () => {
      expect(service.sendToBrowserExtension({ type: 'sourcesUpdated' })).toBe(false);
      expect(service.sendToBrowserExtension({ type: 'videoRecordingStateChanged' })).toBe(false);
      expect(service.sendToBrowserExtension({ type: 'network-state-update' })).toBe(false);
    });
  });

  describe('_broadcastToAll', () => {
    it('returns 0 when no servers', () => {
      const count = service._broadcastToAll(
        JSON.stringify({
          type: 'rules-update',
          data: { rules: { header: [], request: [], response: [] } },
        }),
      );
      expect(count).toBe(0);
    });

    it('returns 0 when server exists but has no clients', () => {
      service.wss = { clients: new Set() } as unknown as typeof service.wss;
      const count = service._broadcastToAll(JSON.stringify({ type: 'test' }));
      expect(count).toBe(0);
    });

    it('broadcasts to open WS clients and skips closed ones', () => {
      const messages: string[] = [];
      const openClient = { readyState: 1, send: (msg: string) => messages.push(msg) };
      const closedClient = { readyState: 3, send: vi.fn() };

      service.wss = {
        clients: new Set([openClient, closedClient]),
      } as unknown as typeof service.wss;

      const testMsg = JSON.stringify({ type: 'sourcesUpdated', sources: [] });
      const count = service._broadcastToAll(testMsg);

      expect(count).toBe(1);
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0])).toEqual({ type: 'sourcesUpdated', sources: [] });
      expect(closedClient.send).not.toHaveBeenCalled();
    });

    it('broadcasts to multiple WS clients', () => {
      const messages: string[] = [];

      service.wss = {
        clients: new Set([
          { readyState: 1, send: (msg: string) => messages.push(msg) },
          { readyState: 1, send: (msg: string) => messages.push(msg) },
          { readyState: 1, send: (msg: string) => messages.push(msg) },
        ]),
      } as unknown as typeof service.wss;

      const testMsg = JSON.stringify({ type: 'videoRecordingStateChanged', enabled: true });
      const count = service._broadcastToAll(testMsg);

      expect(count).toBe(3);
      expect(messages).toHaveLength(3);
    });

    it('handles client send errors gracefully', () => {
      const throwingClient = {
        readyState: 1,
        send: () => {
          throw new Error('Connection reset');
        },
      };
      const goodClient = { readyState: 1, send: vi.fn() };

      service.wss = {
        clients: new Set([throwingClient, goodClient]),
      } as unknown as typeof service.wss;

      service._broadcastToAll(JSON.stringify({ type: 'test' }));
      // Throwing client errors silently, good client still receives
      expect(goodClient.send).toHaveBeenCalled();
    });
  });

  describe('delegators', () => {
    it('updateSources delegates to sourceHandler', () => {
      const spy = vi.spyOn(service.sourceHandler, 'updateSources').mockImplementation(() => {});
      const sources: Source[] = [
        {
          sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          sourceType: 'http',
          sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
          sourceName: 'Production API Gateway Token',
          sourceContent: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
        },
      ];
      service.updateSources(sources);
      expect(spy).toHaveBeenCalledWith(sources);
    });

    it('updateRules delegates to ruleHandler', () => {
      const spy = vi.spyOn(service.ruleHandler, 'updateRules').mockImplementation(() => {});
      const rules: RulesCollection = {
        header: [],
        request: [],
        response: [],
      };
      service.updateRules(rules);
      expect(spy).toHaveBeenCalledWith(rules);
    });

    it('broadcastRules delegates to ruleHandler', () => {
      const spy = vi.spyOn(service.ruleHandler, 'broadcastRules').mockImplementation(() => {});
      service.broadcastRules();
      expect(spy).toHaveBeenCalled();
    });

    it('getConnectionStatus delegates to clientHandler', () => {
      const spy = vi.spyOn(service.clientHandler, 'getConnectionStatus');
      const status = service.getConnectionStatus();
      expect(spy).toHaveBeenCalled();
      expect(status).toHaveProperty('totalConnections');
      expect(status).toHaveProperty('browserCounts');
      expect(status).toHaveProperty('clients');
      expect(status).toHaveProperty('wsServerRunning');
      expect(status).toHaveProperty('wsPort');
    });

    it('broadcastVideoRecordingState delegates to recordingHandler', () => {
      const spy = vi.spyOn(service.recordingHandler, 'broadcastVideoRecordingState').mockImplementation(() => {});
      service.broadcastVideoRecordingState(true);
      expect(spy).toHaveBeenCalledWith(true);
    });

    it('broadcastRecordingHotkeyChange delegates to recordingHandler', () => {
      const spy = vi.spyOn(service.recordingHandler, 'broadcastRecordingHotkeyChange').mockImplementation(() => {});
      service.broadcastRecordingHotkeyChange('CommandOrControl+Shift+E', true);
      expect(spy).toHaveBeenCalledWith('CommandOrControl+Shift+E', true);
    });
  });

  describe('_dispatchMessage', () => {
    it('dispatches toggleRule to ruleHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.ruleHandler, 'handleToggleRule').mockResolvedValue();
      service._dispatchMessage(mockWs, {
        type: 'toggleRule',
        ruleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        enabled: false,
      });
      expect(spy).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890', false);
    });

    it('dispatches toggleAllRules to ruleHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.ruleHandler, 'handleToggleAllRules').mockResolvedValue();
      const ruleIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f23456789012'];
      service._dispatchMessage(mockWs, { type: 'toggleAllRules', ruleIds, enabled: true });
      expect(spy).toHaveBeenCalledWith(ruleIds, true);
    });

    it('dispatches getVideoRecordingState to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'sendVideoRecordingState').mockResolvedValue();
      service._dispatchMessage(mockWs, { type: 'getVideoRecordingState' });
      expect(spy).toHaveBeenCalledWith(mockWs);
    });

    it('dispatches getRecordingHotkey to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'sendRecordingHotkey').mockResolvedValue();
      service._dispatchMessage(mockWs, { type: 'getRecordingHotkey' });
      expect(spy).toHaveBeenCalledWith(mockWs);
    });

    it('dispatches saveRecording to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'handleSaveRecordingMessage').mockImplementation(() => {});
      const recording = {
        record: {
          events: [],
          metadata: {
            startTime: 1709123456789,
            url: 'https://app.openheaders.io/dashboard',
            recordId: 'record-1709123456789-x7y8z9',
          },
        },
      };
      service._dispatchMessage(mockWs, { type: 'saveRecording', recording } as Parameters<
        typeof service._dispatchMessage
      >[1]);
      expect(spy).toHaveBeenCalledWith(mockWs, { type: 'saveRecording', recording });
    });

    it('dispatches saveWorkflow to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'handleSaveRecordingMessage').mockImplementation(() => {});
      const recording = { record: { events: [] } };
      service._dispatchMessage(mockWs, { type: 'saveWorkflow', recording } as Parameters<
        typeof service._dispatchMessage
      >[1]);
      expect(spy).toHaveBeenCalledWith(mockWs, { type: 'saveWorkflow', recording });
    });

    it('dispatches startSyncRecording to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'handleStartSyncRecording').mockResolvedValue();
      const data = {
        recordingId: 'record-1709123456789-x7y8z9',
        url: 'https://app.openheaders.io/dashboard',
        title: 'OpenHeaders Dashboard Recording',
      };
      service._dispatchMessage(mockWs, { type: 'startSyncRecording', data });
      expect(spy).toHaveBeenCalledWith(mockWs, data);
    });

    it('dispatches stopSyncRecording to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'handleStopSyncRecording').mockResolvedValue();
      const data = { recordingId: 'record-1709123456789-x7y8z9' };
      service._dispatchMessage(mockWs, { type: 'stopSyncRecording', data });
      expect(spy).toHaveBeenCalledWith(mockWs, data);
    });

    it('dispatches recordingStateSync to recordingHandler', () => {
      const mockWs = {} as Parameters<typeof service._dispatchMessage>[0];
      const spy = vi.spyOn(service.recordingHandler, 'handleRecordingStateSync').mockResolvedValue();
      const data = { recordingId: 'record-1709123456789-x7y8z9', state: 'paused' };
      service._dispatchMessage(mockWs, { type: 'recordingStateSync', data });
      expect(spy).toHaveBeenCalledWith(mockWs, data);
    });
  });

  describe('initialize', () => {
    it('returns false if already initializing', () => {
      service.isInitializing = true;
      const result = service.initialize();
      expect(result).toBe(false);
    });
  });
});
