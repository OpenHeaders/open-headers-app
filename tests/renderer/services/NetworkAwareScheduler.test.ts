import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock TimeManager
vi.mock('../../../src/renderer/services/TimeManager', () => {
  let _now = 1000000;
  return {
    default: {
      now: () => _now,
      _setNow: (v: number) => { _now = v; },
      initialize: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn(() => vi.fn()),
      getDate: (ts?: number) => new Date(ts ?? _now),
      getNextAlignedTime: (_interval: number, target: number) => target,
      resumeMonitoring: vi.fn(),
      pauseMonitoring: vi.fn(),
    },
    __esModule: true,
  };
});

// Mock ConcurrencyControl
vi.mock('../../../src/renderer/utils/error-handling/ConcurrencyControl', () => {
  class ConcurrentMap {
    private map = new Map();
    async get(key: string) { return this.map.get(key); }
    async set(key: string, value: any) { this.map.set(key, value); }
    async delete(key: string) { this.map.delete(key); }
    async has(key: string) { return this.map.has(key); }
    async entries() { return Array.from(this.map.entries()); }
    async size() { return this.map.size; }
    async clear() { this.map.clear(); }
  }
  class ConcurrentSet {
    private set = new Set();
    async add(val: string) { this.set.add(val); }
    async delete(val: string) { this.set.delete(val); }
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
vi.mock('../../../src/renderer/utils/error-handling/AdaptiveCircuitBreaker', () => ({
  adaptiveCircuitBreakerManager: {
    getBreaker: () => ({
      getStatus: () => ({
        state: 'CLOSED',
        failureCount: 0,
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
vi.mock('../../../src/renderer/constants/retryConfig', () => ({
  CIRCUIT_BREAKER_CONFIG: { failureThreshold: 3, baseTimeout: 30000, maxTimeout: 3600000, backoffMultiplier: 2, timeoutJitter: 0.1, halfOpenMaxAttempts: 3 },
  INITIAL_RETRY_CONFIG: { failuresBeforeCircuitOpen: 3, baseDelay: 5000, maxJitter: 5000 },
  OVERDUE_RETRY_CONFIG: { minDelay: 5000, maxJitter: 5000, overdueBuffer: 5000, circuitBreakerRetryDelay: { base: 1000, maxJitter: 2000 } },
  formatCircuitBreakerKey: (type: string, id: string) => `${type}-${id}`,
  calculateDelayWithJitter: (base: number, _jitter: number) => base,
}));

// Stub window.electronAPI
vi.stubGlobal('window', {
  electronAPI: {
    getNetworkState: vi.fn().mockResolvedValue({
      isOnline: true,
      networkQuality: 'good',
      confidence: 0.9,
    }),
  },
});

const NetworkAwareScheduler = (await import('../../../src/renderer/services/NetworkAwareScheduler')).default;
const timeManager = (await import('../../../src/renderer/services/TimeManager')).default;

describe('NetworkAwareScheduler', () => {
  let scheduler: InstanceType<typeof NetworkAwareScheduler>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    scheduler = new NetworkAwareScheduler();
    (timeManager as any)._setNow(1000000);
  });

  afterEach(async () => {
    // Mark destroyed to prevent timers from firing
    scheduler.isDestroyed = true;
    scheduler.stopOverdueCheck();
    // Clear all pending timers
    for (const [, timerId] of scheduler.timers) {
      clearTimeout(timerId);
    }
    scheduler.timers.clear();
    if (scheduler.timeEventUnsubscribe) {
      scheduler.timeEventUnsubscribe();
      scheduler.timeEventUnsubscribe = null;
    }
    await scheduler.schedules.clear();
    await scheduler.activeRefreshes.clear();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // parseInterval
  // -----------------------------------------------------------------------
  describe('parseInterval', () => {
    it('returns null for null/undefined/never', () => {
      expect(scheduler.parseInterval(null)).toBeNull();
      expect(scheduler.parseInterval(undefined)).toBeNull();
      expect(scheduler.parseInterval('never')).toBeNull();
    });

    it('converts number (minutes) to milliseconds', () => {
      expect(scheduler.parseInterval(5)).toBe(5 * 60 * 1000);
    });

    it('returns null for non-positive number', () => {
      expect(scheduler.parseInterval(0)).toBeNull();
      expect(scheduler.parseInterval(-1)).toBeNull();
    });

    it('returns null for number > 1440', () => {
      expect(scheduler.parseInterval(1441)).toBeNull();
    });

    it('returns null for Infinity', () => {
      expect(scheduler.parseInterval(Infinity)).toBeNull();
    });

    it('parses "30 seconds"', () => {
      expect(scheduler.parseInterval('30 seconds')).toBe(30000);
    });

    it('parses "1 minute"', () => {
      expect(scheduler.parseInterval('1 minute')).toBe(60000);
    });

    it('parses "5 minutes"', () => {
      expect(scheduler.parseInterval('5 minutes')).toBe(300000);
    });

    it('parses "2 hours"', () => {
      expect(scheduler.parseInterval('2 hours')).toBe(2 * 60 * 60 * 1000);
    });

    it('parses "1 day"', () => {
      expect(scheduler.parseInterval('1 day')).toBe(24 * 60 * 60 * 1000);
    });

    it('returns null for invalid string format', () => {
      expect(scheduler.parseInterval('abc')).toBeNull();
      expect(scheduler.parseInterval('5 weeks')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // scheduleSource / unscheduleSource
  // -----------------------------------------------------------------------
  describe('scheduleSource', () => {
    it('ignores null source', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(null);
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('ignores non-http source', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource({ sourceId: '1', sourceType: 'file' });
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('ignores source without sourceId', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource({ sourceType: 'http' });
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('schedules http source with valid interval', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { interval: 5 },
      });
      const schedule = await scheduler.schedules.get('s1');
      expect(schedule).toBeDefined();
      expect(schedule.intervalMs).toBe(300000);
    });

    it('unschedules source with no interval', async () => {
      await scheduler.initialize(vi.fn());
      // First schedule
      await scheduler.scheduleSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { interval: 5 },
      });
      expect(await scheduler.schedules.get('s1')).toBeDefined();

      // Now schedule with no interval
      await scheduler.scheduleSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { interval: 'never' },
      });
      expect(await scheduler.schedules.get('s1')).toBeUndefined();
    });
  });

  describe('unscheduleSource', () => {
    it('removes an existing schedule', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { interval: 5 },
      });
      await scheduler.unscheduleSource('s1');
      expect(await scheduler.schedules.get('s1')).toBeUndefined();
    });

    it('handles unscheduling non-existent source gracefully', async () => {
      await scheduler.initialize(vi.fn());
      await expect(scheduler.unscheduleSource('nonexistent')).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // calculateAlignedTime
  // -----------------------------------------------------------------------
  describe('calculateAlignedTime', () => {
    it('returns targetTime when no alignment flags set', () => {
      const schedule = { alignToMinute: false, alignToHour: false, alignToDay: false };
      expect(scheduler.calculateAlignedTime(5000, schedule)).toBe(5000);
    });

    it('calls timeManager.getNextAlignedTime when alignment flag is set', () => {
      const schedule = { alignToMinute: true, alignToHour: false, alignToDay: false, intervalMs: 60000 };
      // When alignment is enabled, the result should be a number (from TimeManager)
      const result = scheduler.calculateAlignedTime(5000, schedule);
      expect(typeof result).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // scheduleSourceTimer
  // -----------------------------------------------------------------------
  describe('scheduleSourceTimer', () => {
    it('clears existing timer before scheduling', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('s1', 10000);
      const firstTimerId = scheduler.timers.get('s1');
      expect(firstTimerId).toBeDefined();

      scheduler.scheduleSourceTimer('s1', 20000);
      const secondTimerId = scheduler.timers.get('s1');
      expect(secondTimerId).toBeDefined();
      expect(secondTimerId).not.toBe(firstTimerId);
    });

    it('does nothing when destroyed', async () => {
      scheduler.isDestroyed = true;
      scheduler.scheduleSourceTimer('s1', 5000);
      expect(scheduler.timers.has('s1')).toBe(false);
    });

    it('does nothing when paused', async () => {
      scheduler.isPaused = true;
      scheduler.scheduleSourceTimer('s1', 5000);
      expect(scheduler.timers.has('s1')).toBe(false);
    });

    it('uses minimum delay for non-positive delay', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('s1', -100);
      expect(scheduler.timers.has('s1')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // triggerRefresh
  // -----------------------------------------------------------------------
  describe('triggerRefresh', () => {
    it('does nothing when destroyed', async () => {
      const callback = vi.fn().mockResolvedValue({ success: true });
      await scheduler.initialize(callback);
      scheduler.isDestroyed = true;
      await scheduler.triggerRefresh('s1');
      expect(callback).not.toHaveBeenCalled();
    });

    it('skips if already refreshing', async () => {
      const callback = vi.fn().mockResolvedValue({ success: true });
      await scheduler.initialize(callback);
      await scheduler.activeRefreshes.add('s1');
      await scheduler.schedules.set('s1', { sourceId: 's1', intervalMs: 60000 });
      await scheduler.triggerRefresh('s1');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateScheduleOnSuccess / updateScheduleOnFailure
  // -----------------------------------------------------------------------
  describe('updateScheduleOnSuccess', () => {
    it('resets failure and retry counts', async () => {
      await scheduler.schedules.set('s1', {
        sourceId: 's1',
        retryCount: 2,
        failureCount: 5,
        lastRefresh: 0,
      });
      await scheduler.updateScheduleOnSuccess('s1');
      const schedule = await scheduler.schedules.get('s1');
      expect(schedule.retryCount).toBe(0);
      expect(schedule.failureCount).toBe(0);
      expect(schedule.lastRefresh).toBeGreaterThan(0);
    });

    it('does nothing for missing schedule', async () => {
      await expect(scheduler.updateScheduleOnSuccess('missing')).resolves.not.toThrow();
    });
  });

  describe('updateScheduleOnFailure', () => {
    it('increments failure and retry counts', async () => {
      await scheduler.schedules.set('s1', {
        sourceId: 's1',
        retryCount: 0,
        failureCount: 0,
        maxRetries: 3,
      });
      await scheduler.updateScheduleOnFailure('s1');
      const schedule = await scheduler.schedules.get('s1');
      expect(schedule.failureCount).toBe(1);
      expect(schedule.retryCount).toBe(1);
    });

    it('caps retryCount at maxRetries', async () => {
      await scheduler.schedules.set('s1', {
        sourceId: 's1',
        retryCount: 3,
        failureCount: 5,
        maxRetries: 3,
      });
      await scheduler.updateScheduleOnFailure('s1');
      const schedule = await scheduler.schedules.get('s1');
      expect(schedule.retryCount).toBe(3);
      expect(schedule.failureCount).toBe(6);
    });
  });

  // -----------------------------------------------------------------------
  // handleNetworkChange
  // -----------------------------------------------------------------------
  describe('handleNetworkChange', () => {
    it('does nothing when not transitioning from offline to online', async () => {
      await scheduler.initialize(vi.fn());
      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh');
      scheduler.lastNetworkState = { isOnline: true };
      await scheduler.handleNetworkChange({ isOnline: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('reschedules all when going from offline to online', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.lastNetworkState = { isOnline: false };
      await scheduler.schedules.set('s1', { sourceId: 's1', intervalMs: 60000 });

      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh').mockResolvedValue(undefined);
      await scheduler.handleNetworkChange({ isOnline: true });
      expect(spy).toHaveBeenCalledWith('s1');
    });

    it('does nothing when destroyed', async () => {
      scheduler.isDestroyed = true;
      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh');
      scheduler.lastNetworkState = { isOnline: false };
      await scheduler.handleNetworkChange({ isOnline: true });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // handleTimeEvents
  // -----------------------------------------------------------------------
  describe('handleTimeEvents', () => {
    it('does nothing when destroyed', () => {
      scheduler.isDestroyed = true;
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources');
      scheduler.handleTimeEvents([{ type: 'drift' }]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when paused', () => {
      scheduler.isPaused = true;
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources');
      scheduler.handleTimeEvents([{ type: 'drift' }]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls rescheduleAllSources on events', () => {
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources').mockResolvedValue(undefined);
      scheduler.handleTimeEvents([{ type: 'drift' }]);
      expect(spy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // pauseAllTimers / resumeAfterSleep
  // -----------------------------------------------------------------------
  describe('pauseAllTimers / resumeAfterSleep', () => {
    it('pauses and clears all timers', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('s1', 10000);
      expect(scheduler.timers.size).toBe(1);

      await scheduler.pauseAllTimers();
      expect(scheduler.isPaused).toBe(true);
      expect(scheduler.timers.size).toBe(0);
    });

    it('resumes after sleep', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.pauseAllTimers();
      expect(scheduler.isPaused).toBe(true);

      await scheduler.resumeAfterSleep();
      expect(scheduler.isPaused).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------
  describe('destroy', () => {
    it('cleans up all resources', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource({
        sourceId: 's1',
        sourceType: 'http',
        refreshOptions: { interval: 5 },
      });

      await scheduler.destroy();
      expect(scheduler.isDestroyed).toBe(true);
      expect(scheduler.timers.size).toBe(0);
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });
  });
});
