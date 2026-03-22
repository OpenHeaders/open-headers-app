import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type TimeManagerDefault from '../../../../src/renderer/services/TimeManager';
import type { Source } from '../../../../src/types/source';

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
vi.mock('../../../../src/renderer/services/TimeManager', () => {
  let _now = 1700000000000;
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
  class ConcurrentSet {
    private set = new Set();
    async add(val: string) { this.set.add(val); }
    async delete(val: string) { this.set.delete(val); }
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
        backoff: { timeUntilNextAttempt: 0, timeUntilNextAttemptMs: 0, consecutiveOpenings: 0, currentTimeout: 0 },
      }),
      isOpen: () => false,
      canManualBypass: () => false,
      getTimeUntilNextAttempt: () => 0,
      execute: async (fn: () => Promise<unknown>) => fn(),
    }),
    breakers: new Map(),
  },
}));

// Mock retryConfig
vi.mock('../../../../src/renderer/constants/retryConfig', () => ({
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

type ScheduleEntry = {
  sourceId: string; intervalMs: number; lastRefresh: number | null; nextRefresh: number | null;
  retryCount: number; maxRetries: number; backoffFactor: number; failureCount: number;
  maxConsecutiveFailures: number; alignToMinute: boolean; alignToHour: boolean; alignToDay: boolean;
  isTemporary?: boolean;
};

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

function makeRefreshSource(overrides: Partial<Source> & { sourceType: Source['sourceType'] }): Source {
  return {
    sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceName: 'Production OAuth Token',
    sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    refreshOptions: { enabled: true, interval: 5 },
    ...overrides,
  };
}

const NetworkAwareScheduler = (await import('../../../../src/renderer/services/NetworkAwareScheduler')).default;
const timeManager = (await import('../../../../src/renderer/services/TimeManager')).default as typeof TimeManagerDefault & { _setNow: (v: number) => void };

describe('NetworkAwareScheduler', () => {
  let scheduler: InstanceType<typeof NetworkAwareScheduler>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    scheduler = new NetworkAwareScheduler();
    timeManager._setNow(1700000000000);
  });

  afterEach(async () => {
    scheduler.isDestroyed = true;
    scheduler.stopOverdueCheck();
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
      expect(scheduler.parseInterval(5)).toBe(300000);
      expect(scheduler.parseInterval(1)).toBe(60000);
      expect(scheduler.parseInterval(60)).toBe(3600000);
    });

    it('returns null for non-positive number', () => {
      expect(scheduler.parseInterval(0)).toBeNull();
      expect(scheduler.parseInterval(-1)).toBeNull();
    });

    it('returns null for number > 1440 (24 hours)', () => {
      expect(scheduler.parseInterval(1441)).toBeNull();
    });

    it('accepts boundary value 1440 (24 hours)', () => {
      expect(scheduler.parseInterval(1440)).toBe(86400000);
    });

    it('returns null for Infinity and NaN', () => {
      expect(scheduler.parseInterval(Infinity)).toBeNull();
      expect(scheduler.parseInterval(NaN)).toBeNull();
    });

    it('parses string intervals with units', () => {
      expect(scheduler.parseInterval('30 seconds')).toBe(30000);
      expect(scheduler.parseInterval('1 minute')).toBe(60000);
      expect(scheduler.parseInterval('5 minutes')).toBe(300000);
      expect(scheduler.parseInterval('2 hours')).toBe(7200000);
      expect(scheduler.parseInterval('1 day')).toBe(86400000);
    });

    it('returns null for invalid string formats', () => {
      expect(scheduler.parseInterval('abc')).toBeNull();
      expect(scheduler.parseInterval('5 weeks')).toBeNull();
      expect(scheduler.parseInterval('')).toBeNull();
      expect(scheduler.parseInterval('5m')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // scheduleSource / unscheduleSource
  // -----------------------------------------------------------------------
  describe('scheduleSource', () => {
    it('ignores null source', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(null as unknown as Source);
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('ignores non-http source', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({
        sourceId: 'file-src-1',
        sourceType: 'file',
      }));
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('ignores source without sourceId', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({ sourceType: 'http', sourceId: '' }));
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });

    it('schedules http source with correct interval', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 5 },
      }));
      const schedule = await scheduler.schedules.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(schedule).toBeDefined();
      expect(schedule!.intervalMs).toBe(300000);
      expect(schedule!.sourceId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(schedule!.retryCount).toBe(0);
      expect(schedule!.failureCount).toBe(0);
    });

    it('unschedules source with "never" interval', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 5 },
      }));
      expect(await scheduler.schedules.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeDefined();

      await scheduler.scheduleSource(makeRefreshSource({
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 'never' as unknown as number },
      }) as Parameters<typeof scheduler.scheduleSource>[0]);
      expect(await scheduler.schedules.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeUndefined();
    });

    it('preserves lastRefresh from existing schedule', async () => {
      await scheduler.initialize(vi.fn());
      const existingSchedule = makeScheduleEntry({ lastRefresh: 1700000000000 });
      await scheduler.schedules.set('a1b2c3d4-e5f6-7890-abcd-ef1234567890', existingSchedule);

      await scheduler.scheduleSource(makeRefreshSource({
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 10 },
      }));
      const schedule = await scheduler.schedules.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(schedule!.lastRefresh).toBe(1700000000000);
      expect(schedule!.intervalMs).toBe(600000);
    });
  });

  describe('unscheduleSource', () => {
    it('removes an existing schedule and timer', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 5 },
      }));
      await scheduler.unscheduleSource('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(await scheduler.schedules.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeUndefined();
    });

    it('handles unscheduling non-existent source gracefully', async () => {
      await scheduler.initialize(vi.fn());
      await expect(scheduler.unscheduleSource('nonexistent-uuid')).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // calculateAlignedTime
  // -----------------------------------------------------------------------
  describe('calculateAlignedTime', () => {
    it('returns targetTime when no alignment flags set', () => {
      const schedule = makeScheduleEntry();
      expect(scheduler.calculateAlignedTime(1700000300000, schedule)).toBe(1700000300000);
    });

    it('calls timeManager.getNextAlignedTime when alignment flag is set', () => {
      const schedule = makeScheduleEntry({ alignToMinute: true, intervalMs: 60000 });
      const result = scheduler.calculateAlignedTime(1700000060000, schedule);
      expect(typeof result).toBe('number');
    });

    it('passes through for alignToHour', () => {
      const schedule = makeScheduleEntry({ alignToHour: true, intervalMs: 3600000 });
      const result = scheduler.calculateAlignedTime(1700003600000, schedule);
      expect(typeof result).toBe('number');
    });

    it('passes through for alignToDay', () => {
      const schedule = makeScheduleEntry({ alignToDay: true, intervalMs: 86400000 });
      const result = scheduler.calculateAlignedTime(1700086400000, schedule);
      expect(typeof result).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // scheduleSourceTimer
  // -----------------------------------------------------------------------
  describe('scheduleSourceTimer', () => {
    it('clears existing timer before scheduling new one', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('src-1', 10000);
      const firstTimerId = scheduler.timers.get('src-1');
      expect(firstTimerId).toBeDefined();

      scheduler.scheduleSourceTimer('src-1', 20000);
      const secondTimerId = scheduler.timers.get('src-1');
      expect(secondTimerId).toBeDefined();
      expect(secondTimerId).not.toBe(firstTimerId);
    });

    it('does nothing when destroyed', () => {
      scheduler.isDestroyed = true;
      scheduler.scheduleSourceTimer('src-1', 5000);
      expect(scheduler.timers.has('src-1')).toBe(false);
    });

    it('does nothing when paused', () => {
      scheduler.isPaused = true;
      scheduler.scheduleSourceTimer('src-1', 5000);
      expect(scheduler.timers.has('src-1')).toBe(false);
    });

    it('uses minimum delay for non-positive delay', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('src-1', -100);
      expect(scheduler.timers.has('src-1')).toBe(true);
    });

    it('uses minimum delay for zero delay', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('src-1', 0);
      expect(scheduler.timers.has('src-1')).toBe(true);
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
      await scheduler.triggerRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(callback).not.toHaveBeenCalled();
    });

    it('skips if already refreshing', async () => {
      const callback = vi.fn().mockResolvedValue({ success: true });
      await scheduler.initialize(callback);
      await scheduler.activeRefreshes.add('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      await scheduler.schedules.set('a1b2c3d4-e5f6-7890-abcd-ef1234567890', makeScheduleEntry());
      await scheduler.triggerRefresh('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(callback).not.toHaveBeenCalled();
    });

    it('skips if no schedule exists', async () => {
      const callback = vi.fn().mockResolvedValue({ success: true });
      await scheduler.initialize(callback);
      await scheduler.triggerRefresh('nonexistent-source');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateScheduleOnSuccess / updateScheduleOnFailure
  // -----------------------------------------------------------------------
  describe('updateScheduleOnSuccess', () => {
    it('resets failure and retry counts, updates lastRefresh', async () => {
      await scheduler.schedules.set('src-1', makeScheduleEntry({
        sourceId: 'src-1',
        retryCount: 2,
        failureCount: 5,
        lastRefresh: 1699999000000,
      }));
      await scheduler.updateScheduleOnSuccess('src-1');
      const schedule = (await scheduler.schedules.get('src-1'))!;
      expect(schedule.retryCount).toBe(0);
      expect(schedule.failureCount).toBe(0);
      expect(schedule.lastRefresh).toBe(1700000000000);
    });

    it('does nothing for missing schedule', async () => {
      await expect(scheduler.updateScheduleOnSuccess('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('updateScheduleOnFailure', () => {
    it('increments failure and retry counts', async () => {
      await scheduler.schedules.set('src-1', makeScheduleEntry({
        sourceId: 'src-1',
        retryCount: 0,
        failureCount: 0,
        maxRetries: 3,
      }));
      await scheduler.updateScheduleOnFailure('src-1');
      const schedule = (await scheduler.schedules.get('src-1'))!;
      expect(schedule.failureCount).toBe(1);
      expect(schedule.retryCount).toBe(1);
    });

    it('caps retryCount at maxRetries', async () => {
      await scheduler.schedules.set('src-1', makeScheduleEntry({
        sourceId: 'src-1',
        retryCount: 3,
        failureCount: 5,
        maxRetries: 3,
      }));
      await scheduler.updateScheduleOnFailure('src-1');
      const schedule = (await scheduler.schedules.get('src-1'))!;
      expect(schedule.retryCount).toBe(3);
      expect(schedule.failureCount).toBe(6);
    });

    it('does nothing for missing schedule', async () => {
      await expect(scheduler.updateScheduleOnFailure('nonexistent')).resolves.not.toThrow();
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

    it('reschedules all sources when going from offline to online', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.lastNetworkState = { isOnline: false };
      await scheduler.schedules.set('src-1', makeScheduleEntry({ sourceId: 'src-1' }));

      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh').mockResolvedValue(undefined);
      await scheduler.handleNetworkChange({ isOnline: true });
      expect(spy).toHaveBeenCalledWith('src-1');
    });

    it('does nothing when destroyed', async () => {
      scheduler.isDestroyed = true;
      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh');
      scheduler.lastNetworkState = { isOnline: false };
      await scheduler.handleNetworkChange({ isOnline: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not reschedule when going from online to offline', async () => {
      await scheduler.initialize(vi.fn());
      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh');
      scheduler.lastNetworkState = { isOnline: true };
      await scheduler.handleNetworkChange({ isOnline: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it('updates lastNetworkState', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.handleNetworkChange({ isOnline: false, networkQuality: 'poor' });
      expect(scheduler.lastNetworkState.isOnline).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // handleTimeEvents
  // -----------------------------------------------------------------------
  describe('handleTimeEvents', () => {
    it('does nothing when destroyed', () => {
      scheduler.isDestroyed = true;
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources');
      scheduler.handleTimeEvents([{ type: 'time_jump_forward', delta: 60000 }]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when paused', () => {
      scheduler.isPaused = true;
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources');
      scheduler.handleTimeEvents([{ type: 'system_wake', sleepDuration: 3600000 }]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls rescheduleAllSources on any time event', () => {
      const spy = vi.spyOn(scheduler, 'rescheduleAllSources').mockResolvedValue(undefined);
      scheduler.handleTimeEvents([{ type: 'clock_drift', drift: 500 }]);
      expect(spy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // pauseAllTimers / resumeAfterSleep
  // -----------------------------------------------------------------------
  describe('pauseAllTimers / resumeAfterSleep', () => {
    it('pauses and clears all timers', async () => {
      await scheduler.initialize(vi.fn());
      scheduler.scheduleSourceTimer('src-1', 10000);
      scheduler.scheduleSourceTimer('src-2', 20000);
      expect(scheduler.timers.size).toBe(2);

      await scheduler.pauseAllTimers();
      expect(scheduler.isPaused).toBe(true);
      expect(scheduler.timers.size).toBe(0);
    });

    it('stops overdue check on pause', async () => {
      await scheduler.initialize(vi.fn());
      expect(scheduler.overdueCheckTimer).not.toBeNull();
      await scheduler.pauseAllTimers();
      expect(scheduler.overdueCheckTimer).toBeNull();
    });

    it('resumes after sleep and restarts overdue check', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.pauseAllTimers();
      expect(scheduler.isPaused).toBe(true);
      expect(scheduler.overdueCheckTimer).toBeNull();

      await scheduler.resumeAfterSleep();
      expect(scheduler.isPaused).toBe(false);
      expect(scheduler.overdueCheckTimer).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // updateLastRefresh
  // -----------------------------------------------------------------------
  describe('updateLastRefresh', () => {
    it('updates schedule lastRefresh and recalculates', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.schedules.set('src-1', makeScheduleEntry({ sourceId: 'src-1' }));
      const spy = vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh').mockResolvedValue(undefined);

      await scheduler.updateLastRefresh('src-1', 1700000100000);
      const schedule = await scheduler.schedules.get('src-1');
      expect(schedule!.lastRefresh).toBe(1700000100000);
      expect(spy).toHaveBeenCalledWith('src-1');
    });

    it('uses current time when no timestamp provided', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.schedules.set('src-1', makeScheduleEntry({ sourceId: 'src-1' }));
      vi.spyOn(scheduler, 'calculateAndScheduleNextRefresh').mockResolvedValue(undefined);

      await scheduler.updateLastRefresh('src-1');
      const schedule = await scheduler.schedules.get('src-1');
      expect(schedule!.lastRefresh).toBe(1700000000000);
    });

    it('does nothing for missing schedule', async () => {
      await scheduler.initialize(vi.fn());
      await expect(scheduler.updateLastRefresh('nonexistent')).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // destroy
  // -----------------------------------------------------------------------
  describe('destroy', () => {
    it('cleans up all resources', async () => {
      await scheduler.initialize(vi.fn());
      await scheduler.scheduleSource(makeRefreshSource({
        sourceType: 'http',
        refreshOptions: { enabled: true, interval: 5 },
      }));

      await scheduler.destroy();
      expect(scheduler.isDestroyed).toBe(true);
      expect(scheduler.timers.size).toBe(0);
      expect(scheduler.overdueCheckTimer).toBeNull();
      const entries = await scheduler.schedules.entries();
      expect(entries).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // OVERDUE_CHECK_INTERVAL
  // -----------------------------------------------------------------------
  describe('configuration', () => {
    it('has 30-second overdue check interval', () => {
      expect(scheduler.OVERDUE_CHECK_INTERVAL).toBe(30000);
    });

    it('defaults to online network state', () => {
      expect(scheduler.lastNetworkState).toEqual({ isOnline: true });
    });

    it('starts not destroyed and not paused', () => {
      expect(scheduler.isDestroyed).toBe(false);
      expect(scheduler.isPaused).toBe(false);
    });
  });
});
