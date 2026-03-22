import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { RefreshManager as RefreshManagerType } from '../../../../src/renderer/services/RefreshManager';
import type { Source } from '../../../../src/types/source';

type ScheduleEntry = Parameters<RefreshManagerType['_cachedSchedules']['set']>[1];

function makeScheduleEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
    return {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        intervalMs: 300000,
        lastRefresh: null,
        nextRefresh: null,
        retryCount: 0,
        maxRetries: 3,
        backoffFactor: 2,
        failureCount: 0,
        maxConsecutiveFailures: 10,
        alignToMinute: false,
        alignToHour: false,
        alignToDay: false,
        ...overrides,
    };
}

function makeHttpSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceType: 'http',
        sourceName: 'Production API Gateway Token',
        sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
        sourceMethod: 'POST',
        sourceTag: 'oauth',
        sourceContent: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIiwiaWF0IjoxNzE2MDAwMDAwfQ.signature',
        requestOptions: {
            contentType: 'application/x-www-form-urlencoded',
            body: 'grant_type=client_credentials&client_id={{CLIENT_ID}}&client_secret={{CLIENT_SECRET}}',
            headers: [
                { key: 'Accept', value: 'application/json' },
                { key: 'X-Request-ID', value: '{{REQUEST_ID}}' },
            ],
            queryParams: [{ key: 'scope', value: 'openid profile' }],
        },
        jsonFilter: { enabled: true, path: 'access_token' },
        refreshOptions: {
            enabled: true,
            type: 'custom',
            interval: 5,
            lastRefresh: 1700000000000,
            nextRefresh: 1700000300000,
            preserveTiming: false,
            alignToMinute: false,
            alignToHour: false,
            alignToDay: false,
        },
        activationState: 'active',
        missingDependencies: [],
        createdAt: '2025-11-15T09:30:00.000Z',
        updatedAt: '2026-01-20T14:45:12.345Z',
        ...overrides,
    };
}

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock TimeManager
let _now = 1700000000000;
vi.mock('../../../../src/renderer/services/TimeManager', () => ({
  default: {
    now: () => _now,
    _setNow: (v: number) => { _now = v; },
    initialize: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(() => vi.fn()),
    getDate: (ts?: number) => new Date(ts ?? _now),
    getNextAlignedTime: (_interval: number, target: number) => target,
    resumeMonitoring: vi.fn(),
    pauseMonitoring: vi.fn(),
    getCurrentTimeInfo: vi.fn().mockResolvedValue({ timezone: 'America/New_York' }),
  },
  __esModule: true,
}));

// Mock ConcurrencyControl
vi.mock('../../../../src/renderer/utils/error-handling/ConcurrencyControl', () => {
  class ConcurrentMap {
    private map = new Map();
    async get(key: string) { return this.map.get(key); }
    async set(key: string, value: unknown) { this.map.set(key, value); }
    async delete(key: string) { return this.map.delete(key); }
    async has(key: string) { return this.map.has(key); }
    async entries() { return Array.from(this.map.entries()); }
    async keys() { return Array.from(this.map.keys()); }
    async size() { return this.map.size; }
    async clear() { this.map.clear(); }
  }
  class ConcurrentSet {
    private set = new Set();
    async add(val: string) { this.set.add(val); }
    async delete(val: string) { return this.set.delete(val); }
    async has(val: string) { return this.set.has(val); }
    async size() { return this.set.size; }
    async clear() { this.set.clear(); }
  }
  class Semaphore {
    async withPermit(fn: () => Promise<unknown>) { return fn(); }
  }
  class Mutex {
    async withLock(fn: () => Promise<unknown>) { return fn(); }
  }
  class RequestDeduplicator {
    async execute(_key: string, fn: () => Promise<unknown>) { return fn(); }
  }
  return { ConcurrentMap, ConcurrentSet, Semaphore, Mutex, RequestDeduplicator };
});

// Mock AdaptiveCircuitBreaker
vi.mock('../../../../src/renderer/utils/error-handling/AdaptiveCircuitBreaker', () => ({
  adaptiveCircuitBreakerManager: {
    getBreaker: () => ({
      getStatus: () => ({
        state: 'CLOSED',
        failureCount: 0,
        totalFailuresInCycle: 0,
        backoff: { timeUntilNextAttempt: 0, timeUntilNextAttemptMs: 0, consecutiveOpenings: 0, currentTimeout: 0 },
      }),
      isOpen: () => false,
      canManualBypass: () => false,
      getTimeUntilNextAttempt: () => null,
      execute: async (fn: () => Promise<unknown>) => fn(),
    }),
    breakers: new Map(),
  },
}));

// Mock retryConfig
vi.mock('../../../../src/renderer/constants/retryConfig', () => ({
  CIRCUIT_BREAKER_CONFIG: { failureThreshold: 3, baseTimeout: 30000 },
  INITIAL_RETRY_CONFIG: { failuresBeforeCircuitOpen: 3, baseDelay: 5000, maxJitter: 5000 },
  OVERDUE_RETRY_CONFIG: { minDelay: 5000, maxJitter: 5000, overdueBuffer: 5000, circuitBreakerRetryDelay: { base: 1000, maxJitter: 2000 } },
  formatCircuitBreakerKey: (type: string, id: string) => `${type}-${id}`,
  calculateDelayWithJitter: (base: number) => base,
}));

// Stub window.electronAPI
const mockGetNetworkState = vi.fn().mockResolvedValue({
  isOnline: true,
  networkQuality: 'good',
  confidence: 0.9,
});
vi.stubGlobal('window', {
  electronAPI: {
    getNetworkState: mockGetNetworkState,
    onNetworkStateSync: vi.fn(() => vi.fn()),
    onSystemSuspend: vi.fn(() => vi.fn()),
    onSystemResume: vi.fn(() => vi.fn()),
  },
});

let refreshManager: RefreshManagerType;
let RefreshManager: typeof RefreshManagerType;

beforeAll(async () => {
  const mod = await import('../../../../src/renderer/services/RefreshManager');
  refreshManager = mod.default;
  RefreshManager = mod.RefreshManager;
});

describe('RefreshManager', () => {
  beforeEach(async () => {
    _now = 1700000000000;
    refreshManager.isInitialized = false;
    refreshManager.httpService = null;
    refreshManager.onUpdateCallback = null;
    refreshManager._cachedSchedules.clear();
    refreshManager._statusCache.clear();
    if (refreshManager._overdueChecks) {
      refreshManager._overdueChecks.clear();
    }
    await refreshManager.sources.clear();
    refreshManager.eventCleanup = [];
    if (refreshManager.cacheUpdateInterval) {
      clearInterval(refreshManager.cacheUpdateInterval);
      refreshManager.cacheUpdateInterval = null;
    }
  });

  afterEach(() => {
    if (refreshManager.cacheUpdateInterval) {
      clearInterval(refreshManager.cacheUpdateInterval);
      refreshManager.cacheUpdateInterval = null;
    }
  });

  // -----------------------------------------------------------------------
  // normalizeSourceId
  // -----------------------------------------------------------------------
  describe('normalizeSourceId', () => {
    it('converts number to string', () => {
      expect(RefreshManager.normalizeSourceId(42)).toBe('42');
    });

    it('returns string as-is', () => {
      expect(RefreshManager.normalizeSourceId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('throws for null with descriptive message', () => {
      expect(() => RefreshManager.normalizeSourceId(null)).toThrow('Invalid sourceId: null or undefined');
    });

    it('throws for undefined with descriptive message', () => {
      expect(() => RefreshManager.normalizeSourceId(undefined)).toThrow('Invalid sourceId: null or undefined');
    });

    it('handles numeric string IDs', () => {
      expect(RefreshManager.normalizeSourceId('12345')).toBe('12345');
    });
  });

  // -----------------------------------------------------------------------
  // getNetworkTimeout
  // -----------------------------------------------------------------------
  describe('getNetworkTimeout', () => {
    it('returns base timeout for good network', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'good' });
      const timeout = await refreshManager.getNetworkTimeout(15000);
      expect(timeout).toBe(15000);
    });

    it('returns reduced timeout for excellent network', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'excellent' });
      const timeout = await refreshManager.getNetworkTimeout(15000);
      expect(timeout).toBe(12000);
    });

    it('returns increased timeout for moderate network', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'moderate' });
      const timeout = await refreshManager.getNetworkTimeout(15000);
      expect(timeout).toBe(22500);
    });

    it('returns doubled timeout for poor network', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'poor' });
      const timeout = await refreshManager.getNetworkTimeout(15000);
      expect(timeout).toBe(30000);
    });

    it('caps timeout at 60000ms regardless of quality', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'poor' });
      const timeout = await refreshManager.getNetworkTimeout(50000);
      expect(timeout).toBe(60000);
    });

    it('uses default base timeout of 15000 when none provided', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'good' });
      const timeout = await refreshManager.getNetworkTimeout();
      expect(timeout).toBe(15000);
    });

    it('returns base timeout for unknown network quality', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'unknown' });
      const timeout = await refreshManager.getNetworkTimeout(15000);
      expect(timeout).toBe(15000);
    });
  });

  // -----------------------------------------------------------------------
  // getTimeUntilRefresh
  // -----------------------------------------------------------------------
  describe('getTimeUntilRefresh', () => {
    it('returns 0 when no schedule exists and no source data', () => {
      const result = refreshManager.getTimeUntilRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toBe(0);
    });

    it('returns positive time from cached schedule', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      refreshManager._cachedSchedules.set(sourceId, makeScheduleEntry({
        sourceId,
        nextRefresh: _now + 30000,
      }));
      const result = refreshManager.getTimeUntilRefresh(sourceId);
      expect(result).toBeGreaterThan(29000);
      expect(result).toBeLessThanOrEqual(30000);
    });

    it('returns 0 when source data has refresh disabled', () => {
      const sourceData = makeHttpSource({ refreshOptions: { enabled: false } });
      const result = refreshManager.getTimeUntilRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceData);
      expect(result).toBe(0);
    });

    it('returns time from sourceData.refreshOptions.nextRefresh when no cached schedule', () => {
      const sourceData = makeHttpSource({
        refreshOptions: {
          enabled: true,
          interval: 5,
          nextRefresh: _now + 20000,
        },
      });
      const result = refreshManager.getTimeUntilRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceData);
      expect(result).toBeGreaterThan(19000);
      expect(result).toBeLessThanOrEqual(20000);
    });

    it('returns 0 when nextRefresh is in the past (from sourceData)', () => {
      const sourceData = makeHttpSource({
        refreshOptions: {
          enabled: true,
          interval: 5,
          nextRefresh: _now - 100,
        },
      });
      const result = refreshManager.getTimeUntilRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceData);
      expect(result).toBe(0);
    });

    it('returns 0 when cached schedule nextRefresh is in the past', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      refreshManager._cachedSchedules.set(sourceId, makeScheduleEntry({
        sourceId,
        nextRefresh: _now - 500,
      }));
      const result = refreshManager.getTimeUntilRefresh(sourceId);
      expect(result).toBe(0);
    });

    it('returns 0 when cached schedule has null nextRefresh', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      refreshManager._cachedSchedules.set(sourceId, makeScheduleEntry({
        sourceId,
        nextRefresh: null,
      }));
      const result = refreshManager.getTimeUntilRefresh(sourceId);
      expect(result).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getRefreshStatus
  // -----------------------------------------------------------------------
  describe('getRefreshStatus', () => {
    it('returns full default status shape for unknown source', () => {
      const status = refreshManager.getRefreshStatus('unknown-source-id');
      expect(status).toEqual({
        isRefreshing: false,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 0,
        isRetry: false,
        attemptNumber: 0,
        failureCount: 0,
        circuitBreaker: {
          state: 'CLOSED',
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

    it('reflects cached status with full shape validation', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      refreshManager._statusCache.set(sourceId, {
        isRefreshing: true,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 2,
        isRetry: true,
        attemptNumber: 1,
        failureCount: 2,
      });
      const status = refreshManager.getRefreshStatus(sourceId);
      expect(status.isRefreshing).toBe(true);
      expect(status.isRetry).toBe(true);
      expect(status.attemptNumber).toBe(1);
      expect(status.failureCount).toBe(2);
      expect(status.consecutiveErrors).toBe(2);
      expect(status.isOverdue).toBe(false);
      expect(status.isPaused).toBe(false);
      expect(status.circuitBreaker).toBeDefined();
      expect(status.circuitBreaker.state).toBe('CLOSED');
    });

    it('returns default values for partially populated cache', () => {
      const sourceId = 'partial-cache-source';
      refreshManager._statusCache.set(sourceId, {
        isRefreshing: true,
      });
      const status = refreshManager.getRefreshStatus(sourceId);
      expect(status.isRefreshing).toBe(true);
      expect(status.isOverdue).toBe(false);
      expect(status.isPaused).toBe(false);
      expect(status.consecutiveErrors).toBe(0);
      expect(status.isRetry).toBe(false);
      expect(status.attemptNumber).toBe(0);
      expect(status.failureCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // notifyUI
  // -----------------------------------------------------------------------
  describe('notifyUI', () => {
    it('calls onUpdateCallback with all arguments', () => {
      const callback = vi.fn();
      refreshManager.onUpdateCallback = callback;
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const content = 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig';
      const additionalData = {
        originalResponse: '{"access_token":"Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig","expires_in":3600}',
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-abc-123' },
      };
      refreshManager.notifyUI(sourceId, content, additionalData);
      expect(callback).toHaveBeenCalledWith(sourceId, content, additionalData);
    });

    it('does nothing when no callback is set', () => {
      refreshManager.onUpdateCallback = null;
      expect(() => refreshManager.notifyUI('source-id', 'content')).not.toThrow();
    });

    it('passes null content for failed refreshes', () => {
      const callback = vi.fn();
      refreshManager.onUpdateCallback = callback;
      refreshManager.notifyUI('source-id', null, {
        refreshStatus: {
          isRefreshing: false,
          success: false,
          error: 'Connection refused to auth.openheaders.internal:8443',
          failureCount: 3,
        },
      });
      expect(callback).toHaveBeenCalledWith('source-id', null, expect.objectContaining({
        refreshStatus: expect.objectContaining({
          success: false,
          error: 'Connection refused to auth.openheaders.internal:8443',
        }),
      }));
    });

    it('passes undefined content for status-only updates', () => {
      const callback = vi.fn();
      refreshManager.onUpdateCallback = callback;
      refreshManager.notifyUI('source-id', undefined, {
        refreshOptions: { lastRefresh: 1700000000000, nextRefresh: 1700000300000, interval: 5 },
      });
      expect(callback).toHaveBeenCalledWith('source-id', undefined, expect.objectContaining({
        refreshOptions: expect.objectContaining({
          lastRefresh: 1700000000000,
          nextRefresh: 1700000300000,
          interval: 5,
        }),
      }));
    });
  });

  // -----------------------------------------------------------------------
  // handleNetworkStateSync
  // -----------------------------------------------------------------------
  describe('handleNetworkStateSync', () => {
    it('ignores null event', async () => {
      type NetworkEvent = Parameters<typeof refreshManager.handleNetworkStateSync>[0];
      await refreshManager.handleNetworkStateSync(null as unknown as NetworkEvent);
    });

    it('ignores event with empty object', async () => {
      type NetworkEvent = Parameters<typeof refreshManager.handleNetworkStateSync>[0];
      await refreshManager.handleNetworkStateSync({} as unknown as NetworkEvent);
    });

    it('ignores event with state missing isOnline', async () => {
      type NetworkEvent = Parameters<typeof refreshManager.handleNetworkStateSync>[0];
      await refreshManager.handleNetworkStateSync({ state: {} } as unknown as NetworkEvent);
    });

    it('ignores event with non-boolean isOnline', async () => {
      type NetworkEvent = Parameters<typeof refreshManager.handleNetworkStateSync>[0];
      await refreshManager.handleNetworkStateSync({ state: { isOnline: 'yes' } } as unknown as NetworkEvent);
    });
  });

  // -----------------------------------------------------------------------
  // addSource
  // -----------------------------------------------------------------------
  describe('addSource', () => {
    it('ignores non-http sources', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource({
        sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
      });
      expect(await refreshManager.sources.has('b2c3d4e5-f6a7-8901-bcde-f12345678901')).toBe(false);
    });

    it('ignores when not initialized', async () => {
      refreshManager.isInitialized = false;
      await refreshManager.addSource(makeHttpSource());
      expect(await refreshManager.sources.has('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });

    it('ignores sources waiting for deps', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource(makeHttpSource({
        activationState: 'waiting_for_deps',
        missingDependencies: ['CLIENT_ID', 'CLIENT_SECRET'],
      }));
      expect(await refreshManager.sources.has('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });

    it('adds http source and stores it with normalized ID', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource(makeHttpSource({
        refreshOptions: { enabled: false },
      }));
      expect(await refreshManager.sources.has('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
      const stored = await refreshManager.sources.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(stored).toBeDefined();
      expect(stored!.sourceType).toBe('http');
      expect(stored!.sourcePath).toBe('https://auth.openheaders.internal:8443/oauth2/token');
    });

    it('adds http source with auto-refresh enabled', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource(makeHttpSource({
        refreshOptions: {
          enabled: true,
          interval: 5,
          lastRefresh: _now - 60000,
        },
      }));
      expect(await refreshManager.sources.has('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('handles manual source type', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource({
        sourceId: 'manual-src-001',
        sourceType: 'manual',
        sourceContent: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
      });
      expect(await refreshManager.sources.has('manual-src-001')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // removeSource
  // -----------------------------------------------------------------------
  describe('removeSource', () => {
    it('removes an existing source and cleans up all caches', async () => {
      refreshManager.isInitialized = true;
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await refreshManager.sources.set(sourceId, makeHttpSource());
      refreshManager._cachedSchedules.set(sourceId, makeScheduleEntry({ sourceId }));
      refreshManager._statusCache.set(sourceId, {
        isRefreshing: false,
        isOverdue: false,
        failureCount: 2,
      });

      await refreshManager.removeSource(sourceId);
      expect(await refreshManager.sources.has(sourceId)).toBe(false);
      expect(refreshManager._cachedSchedules.has(sourceId)).toBe(false);
      expect(refreshManager._statusCache.has(sourceId)).toBe(false);
    });

    it('does nothing for non-existent source', async () => {
      await expect(refreshManager.removeSource('nonexistent-source-uuid')).resolves.not.toThrow();
    });

    it('normalizes sourceId before removal', async () => {
      const sourceId = 'numeric-id-42';
      await refreshManager.sources.set(sourceId, makeHttpSource({ sourceId }));
      await refreshManager.removeSource(sourceId);
      expect(await refreshManager.sources.has(sourceId)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // startCacheUpdateInterval
  // -----------------------------------------------------------------------
  describe('startCacheUpdateInterval', () => {
    it('clears existing interval before starting new one', () => {
      refreshManager.startCacheUpdateInterval();
      const firstInterval = refreshManager.cacheUpdateInterval;
      expect(firstInterval).toBeDefined();

      refreshManager.startCacheUpdateInterval();
      const secondInterval = refreshManager.cacheUpdateInterval;
      expect(secondInterval).toBeDefined();
      expect(secondInterval).not.toBe(firstInterval);

      if (secondInterval) clearInterval(secondInterval);
      refreshManager.cacheUpdateInterval = null;
    });
  });

  // -----------------------------------------------------------------------
  // handleSystemSleep
  // -----------------------------------------------------------------------
  describe('handleSystemSleep', () => {
    it('clears cache update interval', async () => {
      refreshManager.startCacheUpdateInterval();
      expect(refreshManager.cacheUpdateInterval).not.toBeNull();
      await refreshManager.handleSystemSleep();
      expect(refreshManager.cacheUpdateInterval).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // setupEventListeners
  // -----------------------------------------------------------------------
  describe('setupEventListeners', () => {
    it('registers event cleanup functions', () => {
      refreshManager.eventCleanup = [];
      refreshManager.setupEventListeners();
      expect(refreshManager.eventCleanup.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------
  describe('destroy', () => {
    it('resets all state on destroy', async () => {
      refreshManager.isInitialized = true;
      refreshManager.httpService = { request: vi.fn() };
      refreshManager.onUpdateCallback = vi.fn();
      refreshManager._cachedSchedules.set('s1', makeScheduleEntry());
      refreshManager._statusCache.set('s1', { isRefreshing: true });
      await refreshManager.sources.set('s1', makeHttpSource({ sourceId: 's1' }));
      refreshManager.startCacheUpdateInterval();

      await refreshManager.destroy();

      expect(refreshManager.isInitialized).toBe(false);
      expect(refreshManager.httpService).toBeNull();
      expect(refreshManager.onUpdateCallback).toBeNull();
      expect(refreshManager._cachedSchedules.size).toBe(0);
      expect(refreshManager._statusCache.size).toBe(0);
      expect(refreshManager.cacheUpdateInterval).toBeNull();
      expect(refreshManager.eventCleanup).toHaveLength(0);
    });
  });
});
