import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import under test
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
  sources: [] as any[],
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
const windowListeners: Record<string, any[]> = {};
vi.stubGlobal('window', {
  electronAPI: { send: vi.fn() },
  addEventListener: vi.fn((event: string, handler: any) => {
    if (!windowListeners[event]) windowListeners[event] = [];
    windowListeners[event].push(handler);
  }),
  removeEventListener: vi.fn((event: string, handler: any) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter((h: any) => h !== handler);
    }
  }),
  dispatchEvent: vi.fn(),
});

// ---------------------------------------------------------------------------
// Import under test — after all mocks
// ---------------------------------------------------------------------------
// We import the class-like module; since it exports a singleton, we need to
// work with the instance or re-import.
const { default: refreshManagerIntegration } = await import(
  '../../../../src/renderer/services/RefreshManagerIntegration'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RefreshManagerIntegration', () => {
  const mockHttpService = { fetch: vi.fn() };
  const mockUpdateCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset instance state
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
    // Reset listener tracking
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

    it('adds existing HTTP sources on initialization', async () => {
      mockWorkspaceServiceState.sources = [
        { sourceId: 's1', sourceType: 'http', sourcePath: 'https://a.com' },
        { sourceId: 's2', sourceType: 'file', sourcePath: '/etc/hosts' },
      ];
      await refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback);
      expect(mockRefreshManager.addSource).toHaveBeenCalledTimes(1);
      expect(mockRefreshManager.addSource).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 's1' })
      );
    });

    it('resets initializing flag on error', async () => {
      mockRefreshManager.initialize.mockRejectedValueOnce(new Error('init failed'));
      await expect(
        refreshManagerIntegration.initialize(mockHttpService, mockUpdateCallback)
      ).rejects.toThrow('init failed');
      expect(refreshManagerIntegration.initializing).toBe(false);
    });
  });

  // ========================================================================
  // trackSourceData
  // ========================================================================
  describe('trackSourceData()', () => {
    it('stores source data in lastSeenSources map', () => {
      const source = {
        sourceId: 's1',
        sourcePath: 'https://api.com',
        sourceMethod: 'GET',
        requestOptions: null,
        jsonFilter: null,
        refreshOptions: { enabled: true, interval: 5000 },
        activationState: 'active',
      };
      refreshManagerIntegration.trackSourceData(source);
      expect(refreshManagerIntegration.lastSeenSources.has('s1')).toBe(true);
      const tracked = refreshManagerIntegration.lastSeenSources.get('s1');
      expect(tracked.sourcePath).toBe('https://api.com');
      expect(tracked.sourceMethod).toBe('GET');
    });
  });

  // ========================================================================
  // resolveSourceData
  // ========================================================================
  describe('resolveSourceData()', () => {
    it('resolves source URL via environment service', () => {
      mockEnvService.resolveTemplate.mockReturnValue('https://resolved.com');
      const source = { sourcePath: 'https://{{HOST}}', requestOptions: {} };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.sourcePath).toBe('https://resolved.com');
    });

    it('resolves request headers', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{TOKEN}}' ? 'abc123' : s
      );
      const source = {
        sourcePath: 'https://api.com',
        requestOptions: {
          headers: [{ key: 'Authorization', value: '{{TOKEN}}' }],
        },
      };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.headers?.[0].value).toBe('abc123');
    });

    it('resolves request body', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{BODY}}' ? '{"data": true}' : s
      );
      const source = {
        sourcePath: 'https://api.com',
        requestOptions: { body: '{{BODY}}' },
      };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.body).toBe('{"data": true}');
    });

    it('handles null requestOptions', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) => s);
      const source = { sourcePath: 'https://api.com', requestOptions: null };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions).toEqual({});
    });

    it('resolves all header key-value pairs', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{VAL}}' ? 'resolved' : s
      );
      const source = {
        sourcePath: 'https://api.com',
        requestOptions: {
          headers: [
            { key: 'X-Custom', value: '{{VAL}}' },
            { key: 'Accept', value: 'application/json' },
          ],
        },
      };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.headers?.[0].value).toBe('resolved');
      expect(result.requestOptions.headers?.[1].value).toBe('application/json');
    });

    it('resolves query params', () => {
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === '{{A}}' ? 'x' : s
      );
      const source = {
        sourcePath: 'https://api.com',
        requestOptions: {
          queryParams: [{ key: 'filter', value: '{{A}}' }],
        },
      };
      const result = refreshManagerIntegration.resolveSourceData(source);
      expect(result.requestOptions.queryParams?.[0].value).toBe('x');
    });
  });

  // ========================================================================
  // addSource / updateSource / removeSource (delegate methods)
  // ========================================================================
  describe('addSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.addSource({ sourceId: 's1', sourceType: 'http' });
      expect(mockRefreshManager.addSource).not.toHaveBeenCalled();
    });

    it('adds HTTP source to refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      const source = { sourceId: 's1', sourceType: 'http' };
      await refreshManagerIntegration.addSource(source);
      expect(mockRefreshManager.addSource).toHaveBeenCalledWith(source);
    });

    it('ignores non-HTTP sources', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.addSource({ sourceId: 's1', sourceType: 'file' });
      expect(mockRefreshManager.addSource).not.toHaveBeenCalled();
    });
  });

  describe('updateSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.updateSource({ sourceId: 's1', sourceType: 'http' });
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('updates HTTP source', async () => {
      refreshManagerIntegration.initialized = true;
      const source = { sourceId: 's1', sourceType: 'http' };
      await refreshManagerIntegration.updateSource(source);
      expect(mockRefreshManager.updateSource).toHaveBeenCalledWith(source);
    });

    it('ignores non-HTTP sources', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.updateSource({ sourceId: 's1', sourceType: 'file' });
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });
  });

  describe('removeSource()', () => {
    it('does nothing when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      await refreshManagerIntegration.removeSource('s1');
      expect(mockRefreshManager.removeSource).not.toHaveBeenCalled();
    });

    it('removes source from refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      await refreshManagerIntegration.removeSource('s1');
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('s1');
    });
  });

  // ========================================================================
  // manualRefresh
  // ========================================================================
  describe('manualRefresh()', () => {
    it('returns false when not initialized', async () => {
      refreshManagerIntegration.initialized = false;
      const result = await refreshManagerIntegration.manualRefresh('s1');
      expect(result).toBe(false);
    });

    it('delegates to refreshManager.manualRefresh', async () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.manualRefresh.mockResolvedValue(true);
      const result = await refreshManagerIntegration.manualRefresh('s1');
      expect(result).toBe(true);
      expect(mockRefreshManager.manualRefresh).toHaveBeenCalledWith('s1');
    });
  });

  // ========================================================================
  // getTimeUntilRefresh
  // ========================================================================
  describe('getTimeUntilRefresh()', () => {
    it('returns 0 when not initialized', () => {
      refreshManagerIntegration.initialized = false;
      expect(refreshManagerIntegration.getTimeUntilRefresh('s1')).toBe(0);
    });

    it('delegates to refreshManager', () => {
      refreshManagerIntegration.initialized = true;
      mockRefreshManager.getTimeUntilRefresh.mockReturnValue(3000);
      expect(refreshManagerIntegration.getTimeUntilRefresh('s1')).toBe(3000);
    });

    it('passes sourceData parameter', () => {
      refreshManagerIntegration.initialized = true;
      const sourceData = { refreshOptions: { interval: 10000 } };
      refreshManagerIntegration.getTimeUntilRefresh('s1', sourceData);
      expect(mockRefreshManager.getTimeUntilRefresh).toHaveBeenCalledWith('s1', sourceData);
    });
  });

  // ========================================================================
  // getRefreshStatus
  // ========================================================================
  describe('getRefreshStatus()', () => {
    it('returns default status when not initialized', () => {
      refreshManagerIntegration.initialized = false;
      const status = refreshManagerIntegration.getRefreshStatus('s1');
      expect(status).toEqual({
        isRefreshing: false,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 0,
      });
    });

    it('delegates to refreshManager when initialized', () => {
      refreshManagerIntegration.initialized = true;
      const expectedStatus = { isRefreshing: true, isOverdue: false, isPaused: false, consecutiveErrors: 2 };
      mockRefreshManager.getRefreshStatus.mockReturnValue(expectedStatus);
      expect(refreshManagerIntegration.getRefreshStatus('s1')).toEqual(expectedStatus);
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

    it('removes all tracked sources', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('s1', {});
      refreshManagerIntegration.lastSeenSources.set('s2', {});

      await refreshManagerIntegration.cleanupAllSources();
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('s1');
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('s2');
      expect(refreshManagerIntegration.lastSeenSources.size).toBe(0);
    });
  });

  // ========================================================================
  // syncSourceChanges
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

  // ========================================================================
  // _performSourceSync
  // ========================================================================
  describe('_performSourceSync()', () => {
    it('adds new HTTP sources to refreshManager', async () => {
      refreshManagerIntegration.initialized = true;
      const sources = [
        { sourceId: 's1', sourceType: 'http', sourcePath: 'https://api.com' },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 's1' })
      );
    });

    it('removes sources that no longer exist', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('removed-source', { sourcePath: 'https://old.com' });
      await refreshManagerIntegration._performSourceSync([]);
      expect(mockRefreshManager.removeSource).toHaveBeenCalledWith('removed-source');
      expect(refreshManagerIntegration.lastSeenSources.has('removed-source')).toBe(false);
    });

    it('skips non-HTTP sources', async () => {
      refreshManagerIntegration.initialized = true;
      const sources = [
        { sourceId: 's1', sourceType: 'file', sourcePath: '/path/to/file' },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('detects source data changes', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('s1', {
        sourcePath: 'https://old.com',
        sourceMethod: 'GET',
        requestOptions: null,
        jsonFilter: null,
        refreshOptions: null,
        activationState: 'active',
      });

      const sources = [
        { sourceId: 's1', sourceType: 'http', sourcePath: 'https://new.com', sourceMethod: 'GET' },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });

    it('detects refresh settings changes', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('s1', {
        sourcePath: 'https://api.com',
        sourceMethod: 'GET',
        requestOptions: null,
        jsonFilter: null,
        refreshOptions: { enabled: true, interval: 5000 },
        activationState: 'active',
      });

      const sources = [
        {
          sourceId: 's1',
          sourceType: 'http',
          sourcePath: 'https://api.com',
          sourceMethod: 'GET',
          requestOptions: null,
          jsonFilter: null,
          refreshOptions: { enabled: true, interval: 10000 },
          activationState: 'active',
        },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });

    it('does not update when nothing changed', async () => {
      refreshManagerIntegration.initialized = true;
      const sourceData = {
        sourcePath: 'https://api.com',
        sourceMethod: 'GET',
        requestOptions: null,
        jsonFilter: null,
        refreshOptions: { enabled: true, interval: 5000 },
        activationState: 'active',
        resolvedData: { sourcePath: 'https://api.com', requestOptions: {} },
      };
      refreshManagerIntegration.lastSeenSources.set('s1', sourceData);

      const sources = [
        {
          sourceId: 's1',
          sourceType: 'http',
          sourcePath: 'https://api.com',
          sourceMethod: 'GET',
          requestOptions: null,
          jsonFilter: null,
          refreshOptions: { enabled: true, interval: 5000 },
          activationState: 'active',
        },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).not.toHaveBeenCalled();
    });

    it('detects resolved value changes for template sources', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.lastSeenSources.set('s1', {
        sourcePath: 'https://{{HOST}}/api',
        sourceMethod: 'GET',
        requestOptions: null,
        jsonFilter: null,
        refreshOptions: { enabled: true, interval: 5000 },
        activationState: 'active',
        resolvedData: { sourcePath: 'https://old-host.com/api', requestOptions: {} },
      });

      // Now the env var resolves to a different value
      mockEnvService.resolveTemplate.mockImplementation((s: string) =>
        s === 'https://{{HOST}}/api' ? 'https://new-host.com/api' : s
      );

      const sources = [
        {
          sourceId: 's1',
          sourceType: 'http',
          sourcePath: 'https://{{HOST}}/api',
          sourceMethod: 'GET',
          requestOptions: null,
          jsonFilter: null,
          refreshOptions: { enabled: true, interval: 5000 },
          activationState: 'active',
        },
      ];
      await refreshManagerIntegration._performSourceSync(sources);
      expect(mockRefreshManager.updateSource).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // destroy
  // ========================================================================
  describe('destroy()', () => {
    it('clears debounce timers', async () => {
      refreshManagerIntegration.envChangeDebounceTimer = setTimeout(() => {}, 1000);
      refreshManagerIntegration.sourceChangeDebounceTimers.set('global', setTimeout(() => {}, 1000));

      await refreshManagerIntegration.destroy();
      expect(refreshManagerIntegration.envChangeDebounceTimer).toBeNull();
      expect(refreshManagerIntegration.sourceChangeDebounceTimers.size).toBe(0);
    });

    it('calls subscription cleanups', async () => {
      const sourceCleanup = vi.fn();
      const envCleanup = vi.fn();
      const activationCleanup = vi.fn();
      refreshManagerIntegration.sourceSubscriptionCleanup = sourceCleanup;
      refreshManagerIntegration.envSubscriptionCleanup = envCleanup;
      refreshManagerIntegration.sourceActivationCleanup = activationCleanup;

      await refreshManagerIntegration.destroy();
      expect(sourceCleanup).toHaveBeenCalled();
      expect(envCleanup).toHaveBeenCalled();
      expect(activationCleanup).toHaveBeenCalled();
    });

    it('destroys refreshManager', async () => {
      await refreshManagerIntegration.destroy();
      expect(mockRefreshManager.destroy).toHaveBeenCalled();
    });

    it('resets instance state', async () => {
      refreshManagerIntegration.initialized = true;
      refreshManagerIntegration.httpService = mockHttpService;
      refreshManagerIntegration.lastSeenSources.set('s1', {});

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
    it('adds all HTTP sources from workspace service', async () => {
      mockWorkspaceServiceState.sources = [
        { sourceId: 's1', sourceType: 'http', sourcePath: 'https://a.com' },
        { sourceId: 's2', sourceType: 'http', sourcePath: 'https://b.com' },
        { sourceId: 's3', sourceType: 'file', sourcePath: '/etc/hosts' },
      ];
      await refreshManagerIntegration.syncAllSources();
      expect(mockRefreshManager.addSource).toHaveBeenCalledTimes(2);
      expect(refreshManagerIntegration.lastSeenSources.size).toBe(2);
    });
  });
});
