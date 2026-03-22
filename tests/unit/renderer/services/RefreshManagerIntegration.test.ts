import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Source } from '../../../../src/types/source';

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceType: 'http',
    sourceName: 'Production API Gateway Token',
    sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    sourceMethod: 'POST',
    sourceTag: 'oauth',
    sourceContent: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
    requestOptions: {
      contentType: 'application/x-www-form-urlencoded',
      body: 'grant_type=client_credentials',
      headers: [{ key: 'Accept', value: 'application/json' }],
    },
    jsonFilter: { enabled: true, path: 'access_token' },
    refreshOptions: {
      enabled: true,
      type: 'custom',
      interval: 5,
      lastRefresh: 1700000000000,
    },
    activationState: 'active',
    missingDependencies: [],
    createdAt: '2025-11-15T09:30:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockRefreshManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  addSource: vi.fn().mockResolvedValue(undefined),
  updateSource: vi.fn().mockResolvedValue(undefined),
  removeSource: vi.fn().mockResolvedValue(undefined),
  manualRefresh: vi.fn().mockResolvedValue(true),
  refreshSource: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  isInitialized: true,
  getTimeUntilRefresh: vi.fn().mockReturnValue(5000),
  getRefreshStatus: vi.fn().mockReturnValue({
    isRefreshing: false,
    isOverdue: false,
    isPaused: false,
    consecutiveErrors: 0,
  }),
};

vi.mock('../../../../src/renderer/services/RefreshManager', () => ({
  default: mockRefreshManager,
  __esModule: true,
}));

const mockWorkspaceServiceState = {
  sources: [] as Source[],
};

const mockWorkspaceService = {
  getState: vi.fn(() => ({ ...mockWorkspaceServiceState })),
  subscribe: vi.fn().mockReturnValue(vi.fn()),
};

vi.mock('../../../../src/renderer/services/CentralizedWorkspaceService', () => ({
  getCentralizedWorkspaceService: () => mockWorkspaceService,
}));

const mockEnvService = {
  resolveTemplate: vi.fn((s: string) => s),
  subscribe: vi.fn().mockReturnValue(vi.fn()),
};

vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => mockEnvService,
}));

// Stub window
type EventHandler = (...args: unknown[]) => void;
const windowListeners: Record<string, EventHandler[]> = {};
vi.stubGlobal('window', {
  electronAPI: { send: vi.fn() },
  addEventListener: vi.fn((event: string, handler: EventHandler) => {
    if (!windowListeners[event]) windowListeners[event] = [];
    windowListeners[event].push(handler);
  }),
  removeEventListener: vi.fn((event: string, handler: EventHandler) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter((h: EventHandler) => h !== handler);
    }
  }),
  dispatchEvent: vi.fn(),
});

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
const { default: refreshManagerIntegration } = await import(
  '../../../../src/renderer/services/RefreshManagerIntegration'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RefreshManagerIntegration', () => {
  const mockHttpService = { request: vi.fn() } as unknown as Parameters<typeof refreshManagerIntegration.initialize>[0];
  const mockUpdateCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    refreshManagerIntegration.initialized = false;
    refreshManagerIntegration.initializing = false;
    refreshManagerIntegration.httpService = null;
    refreshManagerIntegration.updateCallback = null;
    refreshManagerIntegration.lastSeenSources.clear();
    refreshManagerIntegration.sourceSubscriptionCleanup = null;
    refreshManagerIntegration.envSubscriptionCleanup = null;
    refreshManagerIntegration.envChangeDebounceTimer = null;
    refreshManagerIntegration.sourceChangeDebounceTimers = new Map();
    refreshManagerIntegration.sourceActivationCleanup = null;
    mockRefreshManager.isInitialized = true;
    Object.keys(windowListeners).forEach(k => delete windowListeners[k]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========================================================================
  // isReady
  // ========================================================================
  describe('isReady()', () => {
    it('returns false when not initialized', () => {
      refreshManagerIntegration.initialized = false;
      expect(refreshManagerIntegration.isReady()).toBe(false);
    });

    it('returns false when refreshManager is not initialized', () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.isInitialized = false;
      expect(refreshManagerIntegration.isReady()).toBe(false);
    });

    it('returns true when both initialized', () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.isInitialized = true;
      expect(refreshManagerIntegration.isReady()).toBe(true);
    });
  });

  // ========================================================================
  // initialize
  // ========================================================================
  describe('initialize()', () => {
    it('initializes refreshManager with httpService and callback', async () => {
      mockWorkspaceServiceState.sources = [];
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockRefreshManager.initialize).toHaveBeenCalledWith(mockHttpService, mockUpdateCallback);
      expect(refreshManagerIntegration.initialized).toBe(true);
      expect(refreshManagerIntegration.initializing).toBe(false);
    });

    it('does not re-initialize if already initialized', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockRefreshManager.initialize).not.toHaveBeenCalled();
    });

    it('does not re-initialize if already initializing', async () => {
      refreshManagerIntegration.initializing = true;
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockRefreshManager.initialize).not.toHaveBeenCalled();
    });

    it('subscribes to workspace source changes', async () => {
      mockWorkspaceServiceState.sources = [];
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockWorkspaceService.subscribe).toHaveBeenCalled();
    });

    it('subscribes to environment changes', async () => {
      mockWorkspaceServiceState.sources = [];
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockEnvService.subscribe).toHaveBeenCalled();
    });

    it('adds existing HTTP sources on initialization, skips non-HTTP', async () => {
      mockWorkspaceServiceState.sources = [
        makeSource({ sourceId: 'src-oauth-1' }),
        { sourceId: 'src-file-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json' },
      ];
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockRefreshManager.addSource).toHaveBeenCalledTimes(1);
      expect(mockRefreshManager.addSource).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 'src-oauth-1', sourceType: 'http' })
      );
    });

    it('resets initializing flag on error', async () => {
      mockRefreshManager.initialize.mockRejectedValueOnce(new Error('Failed to bind to port 8443'));
      await expect(
        refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback)
      ).rejects.toThrow('Failed to bind to port 8443');
      expect(refreshManagerIntegration.initializing).toBe(false);
    });
  });

  // ========================================================================
  // trackSourceData
  // ========================================================================
  describe('trackSourceData()', () => {
    it('stores source data with resolved values in lastSeenSources', () => {
      const source = makeSource({
        sourceId: 'src-oauth-prod',
        sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
      });
      refreshManagerIntegration.trackSourceData(source);
      expect(refreshManagerIntegration.lastSeenSources.has('src-oauth-prod')).toBe(true);
      const tracked = refreshManagerIntegration.lastSeenSources.get('src-oauth-prod');
      expect(tracked).toBeDefined();
      expect(tracked!.sourcePath).toBe('https://auth.openheaders.internal:8443/oauth2/token');
      expect(tracked!.sourceMethod).toBe('POST');
      expect(tracked!.resolvedData).toBeDefined();
      expect(tracked!.resolvedData!.sourcePath).toBe('https://auth.openheaders.internal:8443/oauth2/token');
    });
  });

  // ========================================================================
  // resolveSourceData
  // ========================================================================
  describe('resolveSourceData()', () => {
    it('resolves source URL via environment service', () => {
      mockEnvService.resolveTemplate.mockReturnValue('https://auth.openheaders.io/oauth2/token');
      const source = makeSource({ sourcePath: 'https://{{AUTH_HOST}}/oauth2/token' });
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.sourcePath).toBe('https://auth.openheaders.io/oauth2/token');
    });

    it('resolves request headers with enterprise JWT values', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{BEARER_TOKEN}}'
          ? 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlLWFjY291bnRAb3BlbmhlYWRlcnMuaW8ifQ.sig'
          : s
      );
      const source = makeSource({
        requestOptions: {
          headers: [
            { key: 'Authorization', value: '{{BEARER_TOKEN}}' },
            { key: 'X-Request-ID', value: 'req-abc-123' },
          ],
        },
      });
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.headers?.[0].value).toContain('Bearer eyJhbGciOiJSUzI1NiI');
      expect(result.requestOptions.headers?.[1].value).toBe('req-abc-123');
    });

    it('resolves request body with client credentials', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{CLIENT_CREDS_BODY}}'
          ? 'grant_type=client_credentials&client_id=prod-service&client_secret=ohk_live_4eC39HqLyjWDarjtT1zdp7dc'
          : s
      );
      const source = makeSource({
        requestOptions: { body: '{{CLIENT_CREDS_BODY}}' },
      });
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.body).toContain('grant_type=client_credentials');
      expect(result.requestOptions.body).toContain('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
    });

    it('handles null requestOptions by returning empty object', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) => s);
      const source = makeSource({ requestOptions: undefined });
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions).toEqual({});
    });

    it('resolves query params', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{SCOPE}}' ? 'openid profile email' : s
      );
      const source = makeSource({
        requestOptions: {
          queryParams: [{ key: 'scope', value: '{{SCOPE}}' }],
        },
      });
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.queryParams?.[0].value).toBe('openid profile email');
    });
  });

  // ========================================================================
  // addSource / updateSource / removeSource
  // ========================================================================
  describe('addSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.addSource(makeSource());
      expect(mockRefreshManager.addSource).not.toHaveBeenCalled();
    });

    it('adds HTTP source to refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      const source = makeSource();
      await refreshManagerIntegration.addSource(source);
      expect(mockRefreshManager.addSource).toHaveBeenCalledWith(source);
    });

    it('ignores file sources', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.addSource(makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
      }));
      expect(mockRefreshManager.addSource).not.toHaveBeenCalled();
    });
  });

  describe('updateSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.updateSource(makeSource());
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('updates HTTP source', async () => {
      refreshManagerIntegration.initialized = true;
      const source = makeSource();
      await refreshManagerIntegration.updateSource(source);
      expect(mockRefreshManager.updateSource).toHaveBeenCalledWith(source);
    });

    it('ignores non-HTTP sources', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.updateSource(makeSource({ sourceType: 'manual' }));
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });
  });

  describe('removeSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.removeSource('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockRefreshManager.removeSource).not.toHaveBeenCalled();
    });

    it('removes source from refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.removeSource('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  // ========================================================================
  // manualRefresh
  // ========================================================================
  describe('manualRefresh()', () => {
    it('returns false when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      const result = await refreshManagerIntegration.manualRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toBe(false);
    });

    it('delegates to refreshManager.manualRefresh', async () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.manualRefresh.mockResolvedValue(true);
      const result = await refreshManagerIntegration.manualRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toBe(true);
      expect(mockRefreshManager.manualRefresh).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  // ========================================================================
  // getTimeUntilRefresh
  // ========================================================================
  describe('getTimeUntilRefresh()', () => {
    it('returns 0 when not initialized', () => {
      refreshManagerIntegration.initialized = false;
      expect(refreshManagerIntegration.getTimeUntilRefresh('src-1')).toBe(0);
    });

    it('delegates to refreshManager with sourceData', () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.getTimeUntilRefresh.mockReturnValue(180000);
      const sourceData = makeSource({ refreshOptions: { enabled: true, interval: 5 } });
      const result = refreshManagerIntegration.getTimeUntilRefresh('src-1', sourceData);
      expect(result).toBe(180000);
      expect(mockRefreshManager.getTimeUntilRefresh).toHaveBeenCalledWith('src-1', sourceData);
    });
  });

  // ========================================================================
  // getRefreshStatus
  // ========================================================================
  describe('getRefreshStatus()', () => {
    it('returns full default status shape when not initialized', () => {
      refreshManagerIntegration.initialized = false;
      const status = refreshManagerIntegration.getRefreshStatus('src-1');
      expect(status).toEqual({
        isRefreshing: false,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 0,
        isRetry: false,
        attemptNumber: 0,
        failureCount: 0,
        circuitBreaker: {
          state: 'closed',
          isOpen: false,
          canManualBypass: false,
          timeUntilNextAttempt: null,
          timeUntilNextAttemptMs: 0,
          consecutiveOpenings: 0,
          currentTimeout: 0,
          failureCount: 0,
        },
      });
    });

    it('delegates to refreshManager when initialized', () => {
      refreshManagerIntegration.initialized = true;
      const expectedStatus = {
        isRefreshing: true,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 2,
        isRetry: true,
        attemptNumber: 1,
        failureCount: 2,
      };
      mockRefreshManager.getRefreshStatus.mockReturnValue(expectedStatus);
      expect(refreshManagerIntegration.getRefreshStatus('src-1')).toEqual(expectedStatus);
    });
  });

  // ========================================================================
  // cleanupAllSources
  // ========================================================================
  describe('cleanupAllSources()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.cleanupAllSources();
      expect(mockRefreshManager.removeSource).not.toHaveBeenCalled();
    });

    it('removes all tracked sources and clears lastSeenSources', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('src-oauth-1', makeSource({ sourceId: 'src-oauth-1' }));
      refreshManagerIntegration.lastSeenSources.set('src-oauth-2', makeSource({ sourceId: 'src-oauth-2' }));

      await refreshManagerIntegration.cleanupAllSources();
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('src-oauth-1');
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('src-oauth-2');
      expect(refreshManagerIntegration.lastSeenSources.size).toBe(0);
    });
  });

  // ========================================================================
  // syncSourceChanges / _performSourceSync
  // ========================================================================
  describe('syncSourceChanges()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.syncSourceChanges([]);
      vi.advanceTimersByTime(200);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('does nothing when refreshManager is not initialized', async () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.isInitialized = false;
      await refreshManagerIntegration.syncSourceChanges([]);
      vi.advanceTimersByTime(200);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });
  });

  describe('_performSourceSync()', () => {
    it('adds new HTTP sources to refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      const sources: Source[] = [
        makeSource({ sourceId: 'src-new-oauth', sourcePath: 'https://auth.openheaders.io/oauth2/token' }),
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 'src-new-oauth' })
      );
    });

    it('removes sources that no longer exist', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('removed-source', makeSource({ sourceId: 'removed-source' }));
      await refreshManagerIntegration._performSourceSync([]);
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('removed-source');
      expect(refreshManagerIntegration.lastSeenSources.has('removed-source')).toBe(false);
    });

    it('skips non-HTTP sources', async () => {
      refreshManagerIntegration.initialized = true;
      const sources: Source[] = [
        { sourceId: 'file-src-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/config.json' },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('detects source path changes', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('src-1', makeSource({
        sourceId: 'src-1',
        sourcePath: 'https://old-auth.openheaders.io/token',
        sourceMethod: 'POST',
        requestOptions: undefined,
        jsonFilter: undefined,
        refreshOptions: undefined,
        activationState: 'active',
      }));

      const sources: Source[] = [
        makeSource({
          sourceId: 'src-1',
          sourcePath: 'https://new-auth.openheaders.io/v2/token',
          sourceMethod: 'POST',
        }),
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });

    it('detects refresh interval changes', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('src-1', makeSource({
        sourceId: 'src-1',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'POST',
        requestOptions: undefined,
        jsonFilter: undefined,
        refreshOptions: { enabled: true, interval: 5 },
        activationState: 'active',
      }));

      const sources: Source[] = [
        makeSource({
          sourceId: 'src-1',
          sourcePath: 'https://auth.openheaders.io/token',
          sourceMethod: 'POST',
          requestOptions: undefined,
          jsonFilter: undefined,
          refreshOptions: { enabled: true, interval: 15 },
          activationState: 'active',
        }),
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });

    it('does not update when nothing changed', async () => {
      refreshManagerIntegration.initialized = true;
      const sharedOpts = {
        sourceId: 'src-1',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'POST' as const,
        requestOptions: { contentType: 'application/json' },
        jsonFilter: { enabled: false },
        refreshOptions: { enabled: true, interval: 5 },
        activationState: 'active' as const,
      };
      const sourceData = makeSource(sharedOpts);
      (sourceData as Source & { resolvedData?: unknown }).resolvedData = {
        sourcePath: 'https://auth.openheaders.io/token',
        requestOptions: { contentType: 'application/json' },
      };
      refreshManagerIntegration.lastSeenSources.set('src-1', sourceData);

      const sources: Source[] = [makeSource(sharedOpts)];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('detects resolved value changes for template sources', async () => {
      refreshManagerIntegration.initialized = true;
      const sourceData = makeSource({
        sourceId: 'src-1',
        sourcePath: 'https://{{AUTH_HOST}}/oauth2/token',
        sourceMethod: 'POST',
        requestOptions: undefined,
        jsonFilter: undefined,
        refreshOptions: { enabled: true, interval: 5 },
        activationState: 'active',
      });
      (sourceData as Source & { resolvedData?: unknown }).resolvedData = {
        sourcePath: 'https://old-auth.openheaders.io/oauth2/token',
        requestOptions: {},
      };
      refreshManagerIntegration.lastSeenSources.set('src-1', sourceData);

      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === 'https://{{AUTH_HOST}}/oauth2/token' ? 'https://new-auth.openheaders.io/oauth2/token' : s
      );

      const sources: Source[] = [
        makeSource({
          sourceId: 'src-1',
          sourcePath: 'https://{{AUTH_HOST}}/oauth2/token',
          sourceMethod: 'POST',
          requestOptions: undefined,
          jsonFilter: undefined,
          refreshOptions: { enabled: true, interval: 5 },
          activationState: 'active',
        }),
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });

    it('detects activation state changes', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('src-1', makeSource({
        sourceId: 'src-1',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'POST',
        requestOptions: undefined,
        jsonFilter: undefined,
        refreshOptions: undefined,
        activationState: 'waiting_for_deps',
      }));

      const sources: Source[] = [
        makeSource({
          sourceId: 'src-1',
          sourcePath: 'https://auth.openheaders.io/token',
          sourceMethod: 'POST',
          activationState: 'active',
        }),
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // destroy
  // ========================================================================
  describe('destroy()', () => {
    it('clears all debounce timers', async () => {
      refreshManagerIntegration.envChangeDebounceTimer = setTimeout(() => {}, 1000);
      refreshManagerIntegration.sourceChangeDebounceTimers.set('global', setTimeout(() => {}, 1000));

      await refreshManagerIntegration.destroy();
      expect(refreshManagerIntegration.envChangeDebounceTimer).toBeNull();
      expect(refreshManagerIntegration.sourceChangeDebounceTimers.size).toBe(0);
    });

    it('calls all subscription cleanups', async () => {
      const sourceCleanup = vi.fn();
      const envCleanup = vi.fn();
      const activationCleanup = vi.fn();
      refreshManagerIntegration.sourceSubscriptionCleanup = sourceCleanup;
      refreshManagerIntegration.envSubscriptionCleanup = envCleanup;
      refreshManagerIntegration.sourceActivationCleanup = activationCleanup;

      await refreshManagerIntegration.destroy();
      expect(sourceCleanup).toHaveBeenCalledTimes(1);
      expect(envCleanup).toHaveBeenCalledTimes(1);
      expect(activationCleanup).toHaveBeenCalledTimes(1);
    });

    it('destroys refreshManager', async () => {
      await refreshManagerIntegration.destroy();
      expect(mockRefreshManager.destroy).toHaveBeenCalledTimes(1);
    });

    it('resets all instance state', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.httpService = mockHttpService;
      refreshManagerIntegration.lastSeenSources.set('src-1', makeSource());

      await refreshManagerIntegration.destroy();
      expect(refreshManagerIntegration.initialized).toBe(false);
      expect(refreshManagerIntegration.httpService).toBeNull();
      expect(refreshManagerIntegration.updateCallback).toBeNull();
      expect(refreshManagerIntegration.lastSeenSources.size).toBe(0);
    });
  });

  // ========================================================================
  // syncAllSources
  // ========================================================================
  describe('syncAllSources()', () => {
    it('adds all HTTP sources from workspace service and tracks them', async () => {
      mockWorkspaceServiceState.sources = [
        makeSource({ sourceId: 'src-oauth-prod', sourcePath: 'https://auth.openheaders.io/oauth2/token' }),
        makeSource({ sourceId: 'src-oauth-staging', sourcePath: 'https://auth-staging.openheaders.io/oauth2/token' }),
        { sourceId: 'src-file-1', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/config.json' },
      ];
      await refreshManagerIntegration.syncAllSources();
      expect(mockRefreshManager.addSource).toHaveBeenCalledTimes(2);
      expect(refreshManagerIntegration.lastSeenSources.size).toBe(2);
      expect(refreshManagerIntegration.lastSeenSources.has('src-oauth-prod')).toBe(true);
      expect(refreshManagerIntegration.lastSeenSources.has('src-oauth-staging')).toBe(true);
    });
  });
});
