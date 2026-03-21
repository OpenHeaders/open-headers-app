import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  },
  __esModule: true,
}));

// Mock ConcurrencyControl
vi.mock('../../../../src/renderer/utils/error-handling/ConcurrencyControl', () => {
  class ConcurrentMap {
    private map = new Map();
    async get(key: string) { return this.map.get(key); }
    async set(key: string, value: unknown) { this.map.set(key, value); }
    async delete(key: string) { this.map.delete(key); }
    async has(key: string) { return this.map.has(key); }
    async entries() { return Array.from(this.map.entries()); }
    async size() { return this.map.size; }
    async clear() { this.map.clear(); }
  }
  class Mutex {
    async withLock<T>(fn: () => Promise<T>) { return fn(); }
  }
  return { ConcurrentMap, Mutex };
});

const RefreshCoordinator = (await import('../../../../src/renderer/services/RefreshCoordinator')).default;

describe('RefreshCoordinator', () => {
  let coordinator: InstanceType<typeof RefreshCoordinator>;

  beforeEach(() => {
    coordinator = new RefreshCoordinator();
    _now = 1000000;
  });

  afterEach(async () => {
    // Intentionally not calling destroy to avoid 5-second wait; just clear state.
    await coordinator.activeRefreshes.clear();
    await coordinator.refreshQueue.clear();
    coordinator.resetMetrics();
  });

  // -----------------------------------------------------------------------
  // normalizeSourceId
  // -----------------------------------------------------------------------
  describe('normalizeSourceId', () => {
    it('converts number to string', () => {
      expect(RefreshCoordinator.normalizeSourceId(42)).toBe('42');
    });

    it('returns string as-is', () => {
      expect(RefreshCoordinator.normalizeSourceId('abc')).toBe('abc');
    });

    it('throws for null', () => {
      expect(() => RefreshCoordinator.normalizeSourceId(null)).toThrow('null or undefined');
    });

    it('throws for undefined', () => {
      expect(() => RefreshCoordinator.normalizeSourceId(undefined)).toThrow('null or undefined');
    });
  });

  // -----------------------------------------------------------------------
  // executeRefresh - success
  // -----------------------------------------------------------------------
  describe('executeRefresh', () => {
    it('executes refresh successfully', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ data: 'ok' });
      const result = await coordinator.executeRefresh('s1', refreshFn);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ data: 'ok' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(coordinator.metrics.successfulRefreshes).toBe(1);
      expect(coordinator.metrics.totalRefreshes).toBe(1);
    });

    it('skips if already active', async () => {
      await coordinator.activeRefreshes.set('s1', { startTime: _now, reason: 'manual', priority: 'normal' });
      const refreshFn = vi.fn();
      const result = await coordinator.executeRefresh('s1', refreshFn);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('already_active');
      expect(refreshFn).not.toHaveBeenCalled();
      expect(coordinator.metrics.skippedRefreshes).toBe(1);
    });

    it('queues when skipIfActive is false and source is active', async () => {
      // Start a long-running refresh for s1
      let resolveFirst!: (value: unknown) => void;
      const firstPromise = new Promise(resolve => { resolveFirst = resolve; });
      const firstFn = vi.fn().mockReturnValue(firstPromise);
      const secondFn = vi.fn().mockResolvedValue({ data: 'second' });

      const firstExec = coordinator.executeRefresh('s1', firstFn);

      // Now try to execute with skipIfActive=false
      const secondExec = coordinator.executeRefresh('s1', secondFn, { skipIfActive: false });

      // Complete the first refresh
      resolveFirst({ data: 'first' });

      const firstResult = await firstExec;
      expect(firstResult.success).toBe(true);

      // The queued second should execute after first completes
      const secondResult = await secondExec;
      expect(secondResult.success).toBe(true);
    });

    it('handles refresh function failure gracefully', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await coordinator.executeRefresh('s1', refreshFn);

      // createRefreshOperation catches errors and returns success: false
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      // The catch in createRefreshOperation means executeRefresh won't throw
      // but it still counts as failed
    });

    it('clears activeRefreshes after completion', async () => {
      const refreshFn = vi.fn().mockResolvedValue({});
      await coordinator.executeRefresh('s1', refreshFn);
      expect(await coordinator.activeRefreshes.has('s1')).toBe(false);
    });

    it('clears activeRefreshes after failure', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('fail'));
      await coordinator.executeRefresh('s1', refreshFn);
      expect(await coordinator.activeRefreshes.has('s1')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // updateMetrics
  // -----------------------------------------------------------------------
  describe('updateMetrics', () => {
    it('accumulates totalRefreshTime', () => {
      coordinator.updateMetrics(100);
      coordinator.updateMetrics(200);
      expect(coordinator.metrics.totalRefreshTime).toBe(300);
    });

    it('calculates averageRefreshTime', () => {
      coordinator.metrics.successfulRefreshes = 2;
      coordinator.updateMetrics(100);
      coordinator.updateMetrics(200);
      // average = 300 / 2 = 150
      expect(coordinator.metrics.averageRefreshTime).toBe(150);
    });
  });

  // -----------------------------------------------------------------------
  // resetMetrics
  // -----------------------------------------------------------------------
  describe('resetMetrics', () => {
    it('resets all metrics to zero', () => {
      coordinator.metrics.totalRefreshes = 10;
      coordinator.metrics.successfulRefreshes = 8;
      coordinator.metrics.failedRefreshes = 2;
      coordinator.metrics.droppedFromQueue = 1;
      coordinator.resetMetrics();

      expect(coordinator.metrics.totalRefreshes).toBe(0);
      expect(coordinator.metrics.successfulRefreshes).toBe(0);
      expect(coordinator.metrics.failedRefreshes).toBe(0);
      expect(coordinator.metrics.droppedFromQueue).toBe(0);
      expect(coordinator.metrics.averageRefreshTime).toBe(0);
      expect(coordinator.metrics.totalRefreshTime).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // isRefreshing
  // -----------------------------------------------------------------------
  describe('isRefreshing', () => {
    it('returns false when not refreshing', async () => {
      expect(await coordinator.isRefreshing('s1')).toBe(false);
    });

    it('returns true when actively refreshing', async () => {
      await coordinator.activeRefreshes.set('s1', { startTime: _now });
      expect(await coordinator.isRefreshing('s1')).toBe(true);
    });

    it('normalizes sourceId', async () => {
      await coordinator.activeRefreshes.set('42', { startTime: _now });
      expect(await coordinator.isRefreshing(42)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // cancelRefresh
  // -----------------------------------------------------------------------
  describe('cancelRefresh', () => {
    it('returns false when source is actively refreshing', async () => {
      await coordinator.activeRefreshes.set('s1', { startTime: _now });
      const result = await coordinator.cancelRefresh('s1');
      expect(result).toBe(false);
    });

    it('returns false when nothing to cancel', async () => {
      const result = await coordinator.cancelRefresh('s1');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // cancelAll
  // -----------------------------------------------------------------------
  describe('cancelAll', () => {
    it('clears all queues', async () => {
      await coordinator.refreshQueue.set('s1', [
        { resolve: vi.fn(), reject: vi.fn(), refreshFn: vi.fn(), options: {} },
      ]);
      await coordinator.cancelAll();
      const entries = await coordinator.refreshQueue.entries();
      expect(entries).toHaveLength(0);
    });
  });
});
