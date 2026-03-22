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
let _now = 1700000000000;
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

const RefreshCoordinatorModule = await import('../../../../src/renderer/services/RefreshCoordinator');
const RefreshCoordinator = RefreshCoordinatorModule.default;
type RefreshResult = import('../../../../src/renderer/services/RefreshCoordinator').RefreshResult;

describe('RefreshCoordinator', () => {
  let coordinator: InstanceType<typeof RefreshCoordinator>;

  beforeEach(() => {
    coordinator = new RefreshCoordinator();
    _now = 1700000000000;
  });

  afterEach(async () => {
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

    it('returns UUID string as-is', () => {
      expect(RefreshCoordinator.normalizeSourceId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('throws for null with descriptive message', () => {
      expect(() => RefreshCoordinator.normalizeSourceId(null)).toThrow('Invalid sourceId: null or undefined');
    });

    it('throws for undefined with descriptive message', () => {
      expect(() => RefreshCoordinator.normalizeSourceId(undefined)).toThrow('Invalid sourceId: null or undefined');
    });
  });

  // -----------------------------------------------------------------------
  // executeRefresh - success
  // -----------------------------------------------------------------------
  describe('executeRefresh', () => {
    it('executes refresh successfully and returns full result shape', async () => {
      const mockTokenResponse = {
        access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvcGVuaGVhZGVycyIsImlhdCI6MTcwMDAwMDAwMH0.sig',
        expires_in: 3600,
        token_type: 'Bearer',
      };
      const refreshFn = vi.fn().mockResolvedValue(mockTokenResponse);
      const result = await coordinator.executeRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890', refreshFn);

      expect(result.success).toBe(true);
      const typedResult = result as RefreshResult;
      expect(typedResult.result).toEqual(mockTokenResponse);
      expect(typedResult.duration).toBeGreaterThanOrEqual(0);
      expect(typedResult.timestamp).toBe(_now);
      expect(coordinator.metrics.successfulRefreshes).toBe(1);
      expect(coordinator.metrics.totalRefreshes).toBe(1);
    });

    it('skips if already active and returns full skipped shape', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await coordinator.activeRefreshes.set(sourceId, {
        startTime: _now,
        reason: 'manual',
        priority: 'high',
      });
      const refreshFn = vi.fn();
      const result = await coordinator.executeRefresh(sourceId, refreshFn);

      expect(result.success).toBe(false);
      expect('skipped' in result && result.skipped).toBe(true);
      expect('reason' in result && result.reason).toBe('already_active');
      expect(refreshFn).not.toHaveBeenCalled();
      expect(coordinator.metrics.skippedRefreshes).toBe(1);
    });

    it('queues when skipIfActive is false and source is active', async () => {
      let resolveFirst!: (value: unknown) => void;
      const firstPromise = new Promise(resolve => { resolveFirst = resolve; });
      const firstFn = vi.fn().mockReturnValue(firstPromise);
      const secondFn = vi.fn().mockResolvedValue({ token: 'second-token' });

      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const firstExec = coordinator.executeRefresh(sourceId, firstFn);
      const secondExec = coordinator.executeRefresh(sourceId, secondFn, { skipIfActive: false });

      resolveFirst({ token: 'first-token' });

      const firstResult = await firstExec;
      expect(firstResult.success).toBe(true);

      const secondResult = await secondExec;
      expect(secondResult.success).toBe(true);
    });

    it('handles refresh function failure gracefully with error details', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('Connection refused to auth.openheaders.internal:8443'));
      const result = await coordinator.executeRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890', refreshFn);

      expect(result.success).toBe(false);
      expect((result as RefreshResult).error).toBe('Connection refused to auth.openheaders.internal:8443');
      expect((result as RefreshResult).duration).toBeGreaterThanOrEqual(0);
      expect((result as RefreshResult).timestamp).toBe(_now);
    });

    it('clears activeRefreshes after successful completion', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const refreshFn = vi.fn().mockResolvedValue({ token: 'ok' });
      await coordinator.executeRefresh(sourceId, refreshFn);
      expect(await coordinator.activeRefreshes.has(sourceId)).toBe(false);
    });

    it('clears activeRefreshes after failure', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const refreshFn = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
      await coordinator.executeRefresh(sourceId, refreshFn);
      expect(await coordinator.activeRefreshes.has(sourceId)).toBe(false);
    });

    it('passes sourceId to refreshFn', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const refreshFn = vi.fn().mockResolvedValue({ token: 'ok' });
      await coordinator.executeRefresh(sourceId, refreshFn, { reason: 'scheduled' });
      expect(refreshFn).toHaveBeenCalledWith(sourceId);
    });
  });

  // -----------------------------------------------------------------------
  // updateMetrics
  // -----------------------------------------------------------------------
  describe('updateMetrics', () => {
    it('accumulates totalRefreshTime correctly', () => {
      coordinator.updateMetrics(150);
      coordinator.updateMetrics(350);
      expect(coordinator.metrics.totalRefreshTime).toBe(500);
    });

    it('calculates averageRefreshTime based on successful count', () => {
      coordinator.metrics.successfulRefreshes = 4;
      coordinator.updateMetrics(200);
      coordinator.updateMetrics(400);
      // average = 600 / 4 = 150
      expect(coordinator.metrics.averageRefreshTime).toBe(150);
    });

    it('handles zero successful refreshes without division error', () => {
      coordinator.metrics.successfulRefreshes = 0;
      coordinator.updateMetrics(100);
      // Uses (successfulRefreshes || 1) = 1
      expect(coordinator.metrics.averageRefreshTime).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // resetMetrics
  // -----------------------------------------------------------------------
  describe('resetMetrics', () => {
    it('resets all metrics fields to zero', () => {
      coordinator.metrics = {
        totalRefreshes: 42,
        successfulRefreshes: 35,
        failedRefreshes: 7,
        skippedRefreshes: 3,
        droppedFromQueue: 1,
        averageRefreshTime: 250,
        totalRefreshTime: 8750,
      };
      coordinator.resetMetrics();

      expect(coordinator.metrics).toEqual({
        totalRefreshes: 0,
        successfulRefreshes: 0,
        failedRefreshes: 0,
        skippedRefreshes: 0,
        droppedFromQueue: 0,
        averageRefreshTime: 0,
        totalRefreshTime: 0,
      });
    });
  });

  // -----------------------------------------------------------------------
  // isRefreshing
  // -----------------------------------------------------------------------
  describe('isRefreshing', () => {
    it('returns false when not refreshing', async () => {
      expect(await coordinator.isRefreshing('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });

    it('returns true when actively refreshing', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await coordinator.activeRefreshes.set(sourceId, {
        startTime: _now,
        reason: 'manual',
        priority: 'high',
      });
      expect(await coordinator.isRefreshing(sourceId)).toBe(true);
    });

    it('normalizes numeric sourceId', async () => {
      await coordinator.activeRefreshes.set('42', {
        startTime: _now,
        reason: 'scheduled',
        priority: 'normal',
      });
      expect(await coordinator.isRefreshing(42)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // cancelRefresh
  // -----------------------------------------------------------------------
  describe('cancelRefresh', () => {
    it('returns false when source is actively refreshing (cannot cancel)', async () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await coordinator.activeRefreshes.set(sourceId, {
        startTime: _now,
        reason: 'manual',
        priority: 'high',
      });
      const result = await coordinator.cancelRefresh(sourceId);
      expect(result).toBe(false);
    });

    it('returns false when nothing to cancel', async () => {
      const result = await coordinator.cancelRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // cancelAll
  // -----------------------------------------------------------------------
  describe('cancelAll', () => {
    it('clears all queues and rejects pending', async () => {
      const reject = vi.fn();
      await coordinator.refreshQueue.set('src-1', [
        { resolve: vi.fn(), reject, refreshFn: vi.fn(), options: {}, timestamp: _now },
      ]);
      await coordinator.refreshQueue.set('src-2', [
        { resolve: vi.fn(), reject: vi.fn(), refreshFn: vi.fn(), options: {}, timestamp: _now },
      ]);
      await coordinator.cancelAll();
      const entries = await coordinator.refreshQueue.entries();
      expect(entries).toHaveLength(0);
      expect(reject).toHaveBeenCalledWith(expect.objectContaining({
        message: 'All refreshes cancelled',
      }));
    });

    it('handles empty queues gracefully', async () => {
      await expect(coordinator.cancelAll()).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // MAX_QUEUE_SIZE
  // -----------------------------------------------------------------------
  describe('queue limits', () => {
    it('has a default MAX_QUEUE_SIZE of 100', () => {
      expect(coordinator.MAX_QUEUE_SIZE).toBe(100);
    });
  });
});
