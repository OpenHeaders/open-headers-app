import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
const mockGetAllWindows = vi.fn().mockReturnValue([]);

// Mock electron
vi.mock('electron', () => ({
  default: {
    app: { getPath: () => '/tmp/test' },
    BrowserWindow: { getAllWindows: () => mockGetAllWindows() },
  },
}));

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger.js', () => ({
  default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

import {
  broadcastToServices,
  sendPatchToRenderers,
  sendProgressToRenderers,
  syncToRefreshService,
} from '@/services/workspace/state/StateBroadcaster';
import type {
  ProxyServiceLike,
  SourceRefreshServiceLike,
  WebSocketServiceLike,
  WorkspaceState,
} from '@/services/workspace/state/types';
import type { Source } from '@/types/source';

function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    initialized: true,
    loading: false,
    error: null,
    workspaces: [],
    activeWorkspaceId: 'default-personal',
    isWorkspaceSwitching: false,
    syncStatus: {},
    sources: [],
    rules: { header: [], request: [], response: [] },
    proxyRules: [],
    environments: { Default: {} },
    activeEnvironment: 'Default',
    ...overrides,
  };
}

function mockWindow() {
  return { isDestroyed: () => false, webContents: { send: mockSend } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('broadcastToServices', () => {
  it('updates webSocketService sources/rules and broadcasts', () => {
    const wsSources = vi.fn();
    const wsRules = vi.fn();
    const ws: WebSocketServiceLike = {
      sources: [],
      rules: { header: [], request: [], response: [] },
      sourceHandler: { broadcastSources: wsSources },
      ruleHandler: { broadcastRules: wsRules },
      environmentHandler: {
        loadEnvironmentVariables: () => ({}),
        resolveTemplate: vi.fn(),
        setVariables: vi.fn(),
        clearVariableCache: vi.fn(),
      },
    };
    const proxy: ProxyServiceLike = {
      switchWorkspace: vi.fn(),
      updateSources: vi.fn(),
      updateHeaderRules: vi.fn(),
      updateProxyRules: vi.fn(),
      updateEnvironmentVariables: vi.fn(),
      clearRules: vi.fn(),
    };

    const sources: Source[] = [{ sourceId: '1', sourceType: 'http', sourcePath: 'https://api.openheaders.io/data' }];
    const state = makeState({ sources });

    broadcastToServices(state, ws, proxy);

    expect(ws.sources).toBe(sources);
    expect(wsSources).toHaveBeenCalledOnce();
    expect(wsRules).toHaveBeenCalledOnce();
    expect(proxy.updateSources).toHaveBeenCalledWith(sources);
  });

  it('handles null services gracefully', () => {
    const state = makeState();
    expect(() => broadcastToServices(state, null, null)).not.toThrow();
  });
});

describe('syncToRefreshService', () => {
  it('registers HTTP sources and cleans up stale ones', () => {
    const updateSource = vi.fn().mockResolvedValue(undefined);
    const removeSourcesNotIn = vi.fn().mockResolvedValue(undefined);
    const refreshService: SourceRefreshServiceLike = {
      activeWorkspaceId: 'ws-test-1',
      updateSource,
      removeSourcesNotIn,
      clearAllSources: vi.fn(),
      manualRefresh: vi.fn(),
      resetCircuitBreaker: vi.fn(),
    };

    const sources: Source[] = [
      { sourceId: '1', sourceType: 'http', sourcePath: 'https://api.openheaders.io/data' },
      { sourceId: '2', sourceType: 'file', sourcePath: '/tmp/data.json' },
      { sourceId: '3', sourceType: 'http', sourcePath: 'https://api.openheaders.io/other' },
    ];

    syncToRefreshService(sources, refreshService);

    expect(updateSource).toHaveBeenCalledTimes(2);
    expect(removeSourcesNotIn).toHaveBeenCalledWith(new Set(['1', '3']));
  });

  it('handles null refreshService', () => {
    expect(() => syncToRefreshService([], null)).not.toThrow();
  });
});

describe('sendPatchToRenderers', () => {
  it('sends only specified keys to renderer windows', () => {
    mockGetAllWindows.mockReturnValue([mockWindow()]);
    const state = makeState({ sources: [{ sourceId: '1', sourceType: 'http' }], activeWorkspaceId: 'ws-1' });

    sendPatchToRenderers(state, ['sources', 'activeWorkspaceId']);

    expect(mockSend).toHaveBeenCalledOnce();
    const patch = mockSend.mock.calls[0][1];
    expect(patch.sources).toEqual(state.sources);
    expect(patch.activeWorkspaceId).toBe('ws-1');
    expect(patch.rules).toBeUndefined();
  });

  it('no-ops when no windows exist', () => {
    mockGetAllWindows.mockReturnValue([]);
    const state = makeState();
    sendPatchToRenderers(state, ['sources']);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips destroyed windows', () => {
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => true, webContents: { send: mockSend } }]);
    sendPatchToRenderers(makeState(), ['sources']);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('ignores invalid keys', () => {
    mockGetAllWindows.mockReturnValue([mockWindow()]);
    sendPatchToRenderers(makeState(), ['nonExistentKey']);
    const patch = mockSend.mock.calls[0][1];
    expect(Object.keys(patch)).toHaveLength(0);
  });
});

describe('sendProgressToRenderers', () => {
  it('sends progress data to all windows', () => {
    mockGetAllWindows.mockReturnValue([mockWindow()]);
    sendProgressToRenderers('loading', 50, 'Loading data...', false, { id: 'ws-1', name: 'Test', type: 'personal' });

    expect(mockSend).toHaveBeenCalledWith('workspace:switch-progress', {
      step: 'loading',
      progress: 50,
      label: 'Loading data...',
      isGitOperation: false,
      targetWorkspace: { id: 'ws-1', name: 'Test', type: 'personal' },
    });
  });
});
