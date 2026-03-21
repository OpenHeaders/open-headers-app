import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { RefreshManager as RefreshManagerType } from '../../../../src/renderer/services/RefreshManager';
import type { Source } from '../../../../src/types/source';

type ScheduleEntry = Parameters<RefreshManagerType['_cachedSchedules']['set']>[1];

function makeScheduleEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
    return {
        sourceId: 's1', intervalMs: 60000, lastRefresh: null, nextRefresh: null,
        retryCount: 0, maxRetries: 3, backoffFactor: 2, failureCount: 0,
        maxConsecutiveFailures: 5, alignToMinute: false, alignToHour: false, alignToDay: false,
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
let _now = 1000000;
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
    getCurrentTimeInfo: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
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
    async withPermit(fn: () => Promise<any>) { return fn(); }
  }
  class Mutex {
    async withLock(fn: () => Promise<any>) { return fn(); }
  }
  class RequestDeduplicator {
    async execute(_key: string, fn: () => Promise<any>) { return fn(); }
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
      getTimeUntilNextAttempt: () => 0,
      execute: async (fn: () => Promise<any>) => fn(),
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
    _now = 1000000;
    // Reset the singleton state
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
      expect(RefreshManager.normalizeSourceId('s1')).toBe('s1');
    });

    it('throws for null', () => {
      expect(() => RefreshManager.normalizeSourceId(null)).toThrow();
    });

    it('throws for undefined', () => {
      expect(() => RefreshManager.normalizeSourceId(undefined)).toThrow();
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

    it('caps timeout at 60000ms', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'poor' });
      const timeout = await refreshManager.getNetworkTimeout(50000);
      expect(timeout).toBe(60000);
    });

    it('uses default base timeout of 15000', async () => {
      mockGetNetworkState.mockResolvedValue({ networkQuality: 'good' });
      const timeout = await refreshManager.getNetworkTimeout();
      expect(timeout).toBe(15000);
    });
  });

  // -----------------------------------------------------------------------
  // getTimeUntilRefresh
  // -----------------------------------------------------------------------
  describe('getTimeUntilRefresh', () => {
    it('returns 0 when no schedule exists', () => {
      const result = refreshManager.getTimeUntilRefresh('s1');
      expect(result).toBe(0);
    });

    it('returns positive time from cached schedule', () => {
      refreshManager._cachedSchedules.set('s1', makeScheduleEntry({
        nextRefresh: _now + 30000,
      }));
      const result = refreshManager.getTimeUntilRefresh('s1');
      expect(result).toBeGreaterThan(29000);
      expect(result).toBeLessThanOrEqual(30000);
    });

    it('returns 0 when source data has refresh disabled', () => {
      const sourceData = { refreshOptions: { enabled: false } } as unknown as Source;
      const result = refreshManager.getTimeUntilRefresh('s1', sourceData);
      expect(result).toBe(0);
    });

    it('returns time from sourceData.refreshOptions.nextRefresh when no cached schedule', () => {
      const sourceData = {
        refreshOptions: {
          enabled: true,
          nextRefresh: _now + 20000,
        },
      } as unknown as Source;
      const result = refreshManager.getTimeUntilRefresh('s1', sourceData);
      expect(result).toBeGreaterThan(19000);
      expect(result).toBeLessThanOrEqual(20000);
    });

    it('returns 0 when nextRefresh is in the past (from sourceData)', () => {
      const sourceData = {
        refreshOptions: {
          enabled: true,
          nextRefresh: _now - 100,
        },
      } as unknown as Source;
      const result = refreshManager.getTimeUntilRefresh('s1', sourceData);
      expect(result).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getRefreshStatus
  // -----------------------------------------------------------------------
  describe('getRefreshStatus', () => {
    it('returns default status for unknown source', () => {
      const status = refreshManager.getRefreshStatus('unknown');
      expect(status.isRefreshing).toBe(false);
      expect(status.isOverdue).toBe(false);
      expect(status.isPaused).toBe(false);
      expect(status.circuitBreaker).toBeDefined();
      expect(status.circuitBreaker.state).toBe('CLOSED');
    });

    it('reflects cached status', () => {
      refreshManager._statusCache.set('s1', {
        isRefreshing: true,
        isOverdue: false,
        isPaused: false,
        consecutiveErrors: 2,
        isRetry: true,
        attemptNumber: 1,
        failureCount: 2,
      });
      const status = refreshManager.getRefreshStatus('s1');
      expect(status.isRefreshing).toBe(true);
      expect(status.isRetry).toBe(true);
      expect(status.attemptNumber).toBe(1);
      expect(status.failureCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // notifyUI
  // -----------------------------------------------------------------------
  describe('notifyUI', () => {
    it('calls onUpdateCallback when set', () => {
      const callback = vi.fn();
      refreshManager.onUpdateCallback = callback;
      refreshManager.notifyUI('s1', 'content', { originalResponse: 'resp' });
      expect(callback).toHaveBeenCalledWith('s1', 'content', { originalResponse: 'resp' });
    });

    it('does nothing when no callback', () => {
      refreshManager.onUpdateCallback = null;
      expect(() => refreshManager.notifyUI('s1', 'content')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // handleNetworkStateSync
  // -----------------------------------------------------------------------
  describe('handleNetworkStateSync', () => {
    it('ignores invalid events', async () => {
      // Intentionally invalid events to test runtime guard
      type NetworkEvent = Parameters<typeof refreshManager.handleNetworkStateSync>[0];
      await refreshManager.handleNetworkStateSync(null as unknown as NetworkEvent);
      await refreshManager.handleNetworkStateSync({} as unknown as NetworkEvent);
      await refreshManager.handleNetworkStateSync({ state: {} } as unknown as NetworkEvent);
    });
  });

  // -----------------------------------------------------------------------
  // addSource
  // -----------------------------------------------------------------------
  describe('addSource', () => {
    it('ignores non-http sources', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource({ sourceId: 's1', sourceType: 'file' });
      expect(await refreshManager.sources.has('s1')).toBe(false);
    });

    it('ignores when not initialized', async () => {
      refreshManager.isInitialized = false;
      await refreshManager.addSource({ sourceId: 's1', sourceType: 'http' });
      expect(await refreshManager.sources.has('s1')).toBe(false);
    });

    it('ignores sources waiting for deps', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource({
        sourceId: 's1',
        sourceType: 'http',
        activationState: 'waiting_for_deps',
      });
      expect(await refreshManager.sources.has('s1')).toBe(false);
    });

    it('adds http source and stores it', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.addSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { enabled: false },
      });
      expect(await refreshManager.sources.has('s1')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // removeSource
  // -----------------------------------------------------------------------
  describe('removeSource', () => {
    it('removes an existing source', async () => {
      refreshManager.isInitialized = true;
      await refreshManager.sources.set('s1', { sourceId: 's1', sourceType: 'http' });
      refreshManager._cachedSchedules.set('s1', makeScheduleEntry());
      refreshManager._statusCache.set('s1', {});

      await refreshManager.removeSource('s1');
      expect(await refreshManager.sources.has('s1')).toBe(false);
      expect(refreshManager._cachedSchedules.has('s1')).toBe(false);
      expect(refreshManager._statusCache.has('s1')).toBe(false);
    });

    it('does nothing for non-existent source', async () => {
      await expect(refreshManager.removeSource('nonexistent')).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // startCacheUpdateInterval
  // -----------------------------------------------------------------------
  describe('startCacheUpdateInterval', () => {
    it('clears existing interval before starting new one', () => {
      refreshManager.startCacheUpdateInterval();
      const interval = refreshManager.cacheUpdateInterval;
      expect(interval).toBeDefined();
      if (interval) clearInterval(interval);
      refreshManager.cacheUpdateInterval = null;
    });
  });
});
