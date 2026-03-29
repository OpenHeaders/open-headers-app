import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the logger before importing the module
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const timeManagerModule = await import(
  '../../../../src/renderer/services/TimeManager'
);
const timeManager = timeManagerModule.default || timeManagerModule;

describe('Renderer TimeManager', () => {
  afterEach(() => {
    timeManager.stopMonitoring();
    timeManager.listeners.clear();
    timeManager.isDestroyed = false;
    if (timeManager.osWakeEventTimeout) {
      clearTimeout(timeManager.osWakeEventTimeout);
      timeManager.osWakeEventTimeout = null;
    }
    timeManager.recentOSWakeEvent = false;
  });

  // ------------------------------------------------------------------
  // now()
  // ------------------------------------------------------------------
  describe('now()', () => {
    it('returns a number close to Date.now()', () => {
      const before = Date.now();
      const result = timeManager.now();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('returns consistent results on rapid calls', () => {
      const a = timeManager.now();
      const b = timeManager.now();
      expect(b).toBeGreaterThanOrEqual(a);
      expect(b - a).toBeLessThan(100);
    });
  });

  // ------------------------------------------------------------------
  // getDate()
  // ------------------------------------------------------------------
  describe('getDate()', () => {
    it('returns current date with no argument', () => {
      const date = timeManager.getDate();
      expect(date).toBeInstanceOf(Date);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });

    it('returns date for given ISO timestamp', () => {
      const ts = 1700000000000; // 2023-11-14T22:13:20.000Z
      const date = timeManager.getDate(ts);
      expect(date.getTime()).toBe(ts);
      expect(date.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    });

    it('returns current date for null', () => {
      const date = timeManager.getDate(null);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });

    it('returns current date for zero (falsy)', () => {
      const date = timeManager.getDate(0);
      // 0 is falsy so getDate returns new Date()
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });
  });

  // ------------------------------------------------------------------
  // getMonotonicTime()
  // ------------------------------------------------------------------
  describe('getMonotonicTime()', () => {
    it('returns a positive number from performance.now()', () => {
      expect(timeManager.getMonotonicTime()).toBeGreaterThan(0);
    });

    it('is monotonically increasing', () => {
      const a = timeManager.getMonotonicTime();
      const b = timeManager.getMonotonicTime();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  // ------------------------------------------------------------------
  // getElapsedTime()
  // ------------------------------------------------------------------
  describe('getElapsedTime()', () => {
    it('returns elapsed time since start', () => {
      const start = performance.now();
      const elapsed = timeManager.getElapsedTime(start);
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(100);
    });

    it('returns positive value for past start time', () => {
      const start = performance.now() - 1000;
      const elapsed = timeManager.getElapsedTime(start);
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  // ------------------------------------------------------------------
  // isDST()
  // ------------------------------------------------------------------
  describe('isDST()', () => {
    it('returns a boolean for current time', () => {
      expect(typeof timeManager.isDST()).toBe('boolean');
    });

    it('accepts a timestamp argument', () => {
      const result = timeManager.isDST(1700000000000);
      expect(typeof result).toBe('boolean');
    });

    it('returns a boolean for null argument', () => {
      expect(typeof timeManager.isDST(null)).toBe('boolean');
    });
  });

  // ------------------------------------------------------------------
  // addListener / notifyListeners
  // ------------------------------------------------------------------
  describe('listeners', () => {
    it('addListener registers callback and returns unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = timeManager.addListener(cb);
      expect(timeManager.listeners.size).toBeGreaterThanOrEqual(1);
      expect(timeManager.listeners.has(cb)).toBe(true);
      unsub();
      expect(timeManager.listeners.has(cb)).toBe(false);
    });

    it('notifyListeners calls all registered listeners with events', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      timeManager.addListener(cb1);
      timeManager.addListener(cb2);

      const events = [{ type: 'time_jump_forward', delta: 60000 }];
      timeManager.notifyListeners(events);

      expect(cb1).toHaveBeenCalledWith(events);
      expect(cb2).toHaveBeenCalledWith(events);
    });

    it('notifyListeners handles listener errors gracefully without stopping others', () => {
      const badCb = vi.fn().mockImplementation(() => {
        throw new Error('listener error in timezone change handler');
      });
      const goodCb = vi.fn();
      timeManager.addListener(badCb);
      timeManager.addListener(goodCb);

      expect(() =>
        timeManager.notifyListeners([{ type: 'timezone_change' }])
      ).not.toThrow();
      expect(goodCb).toHaveBeenCalled();
    });

    it('supports multiple unsubscribe calls without error', () => {
      const cb = vi.fn();
      const unsub = timeManager.addListener(cb);
      unsub();
      unsub();
      expect(timeManager.listeners.has(cb)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // handleSystemWake
  // ------------------------------------------------------------------
  describe('handleSystemWake()', () => {
    it('sets recentOSWakeEvent flag', () => {
      timeManager.handleSystemWake();
      expect(timeManager.recentOSWakeEvent).toBe(true);

      if (timeManager.osWakeEventTimeout) {
        clearTimeout(timeManager.osWakeEventTimeout);
        timeManager.osWakeEventTimeout = null;
      }
      timeManager.recentOSWakeEvent = false;
    });

    it('notifies listeners with SYSTEM_WAKE event and os_event source', () => {
      const cb = vi.fn();
      timeManager.addListener(cb);
      timeManager.handleSystemWake();

      expect(cb).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: timeManager.EventType.SYSTEM_WAKE,
            source: 'os_event',
          }),
        ])
      );

      if (timeManager.osWakeEventTimeout) {
        clearTimeout(timeManager.osWakeEventTimeout);
        timeManager.osWakeEventTimeout = null;
      }
      timeManager.recentOSWakeEvent = false;
    });

    it('resets time tracking to prevent false drift detection', () => {
      const beforeWall = timeManager.lastWallTime;
      timeManager.handleSystemWake();
      expect(timeManager.lastWallTime).toBeGreaterThanOrEqual(beforeWall);

      if (timeManager.osWakeEventTimeout) {
        clearTimeout(timeManager.osWakeEventTimeout);
        timeManager.osWakeEventTimeout = null;
      }
      timeManager.recentOSWakeEvent = false;
    });
  });

  // ------------------------------------------------------------------
  // getNextAlignedTime
  // ------------------------------------------------------------------
  describe('getNextAlignedTime()', () => {
    it('returns simple interval when no alignment', () => {
      const now = timeManager.now();
      const result = timeManager.getNextAlignedTime(300000);
      expect(result).toBeGreaterThanOrEqual(now + 300000 - 10);
    });

    it('uses lastRun when provided and no alignment', () => {
      const lastRun = Date.now() - 60000;
      const result = timeManager.getNextAlignedTime(300000, lastRun);
      expect(result).toBe(lastRun + 300000);
    });

    it('aligns to minute boundary with seconds and ms zeroed', () => {
      const result = timeManager.getNextAlignedTime(60000, null, {
        alignToMinute: true,
      });
      const date = new Date(result);
      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });

    it('aligns to hour boundary with minutes, seconds, ms zeroed', () => {
      const result = timeManager.getNextAlignedTime(3600000, null, {
        alignToHour: true,
      });
      const date = new Date(result);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });

    it('aligns to day boundary with minutes and seconds zeroed', () => {
      const result = timeManager.getNextAlignedTime(86400000, null, {
        alignToDay: true,
      });
      const date = new Date(result);
      // Hours may be 0 or 1 depending on DST transitions (spring-forward
      // shifts local-midnight + 24h to 1am). Minutes and seconds are
      // always zeroed because the base is set via setHours(0,0,0,0).
      expect(date.getHours()).toBeLessThanOrEqual(1);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });

    it('ensures result is always in the future', () => {
      const now = timeManager.now();
      const result = timeManager.getNextAlignedTime(1000, null, {
        alignToMinute: true,
      });
      expect(result).toBeGreaterThan(now);
    });

    it('handles very short interval with alignment', () => {
      const now = timeManager.now();
      const result = timeManager.getNextAlignedTime(100, null, { alignToMinute: true });
      expect(result).toBeGreaterThan(now);
    });
  });

  // ------------------------------------------------------------------
  // getStatistics
  // ------------------------------------------------------------------
  describe('getStatistics()', () => {
    it('returns full stats object shape', () => {
      const stats = timeManager.getStatistics();
      expect(stats).toEqual(expect.objectContaining({
        timeJumps: expect.any(Number),
        timezoneChanges: expect.any(Number),
        dstChanges: expect.any(Number),
        systemWakes: expect.any(Number),
        startTime: expect.any(Number),
        uptime: expect.any(Number),
        currentTimezone: expect.any(String),
        currentOffset: expect.any(Number),
      }));
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
      expect(stats.currentTimezone.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // startMonitoring / stopMonitoring / pause / resume
  // ------------------------------------------------------------------
  describe('monitoring', () => {
    it('stopMonitoring clears interval', () => {
      timeManager.startMonitoring();
      expect(timeManager.checkInterval).not.toBeNull();
      timeManager.stopMonitoring();
      expect(timeManager.checkInterval).toBeNull();
    });

    it('pauseMonitoring stops monitoring', () => {
      timeManager.startMonitoring();
      timeManager.pauseMonitoring();
      expect(timeManager.checkInterval).toBeNull();
    });

    it('resumeMonitoring restarts monitoring', () => {
      timeManager.resumeMonitoring();
      expect(timeManager.checkInterval).not.toBeNull();
      timeManager.stopMonitoring();
    });

    it('resumeMonitoring does not start if destroyed', () => {
      timeManager.isDestroyed = true;
      timeManager.resumeMonitoring();
      expect(timeManager.checkInterval).toBeNull();
    });

    it('resumeMonitoring updates time tracking values', () => {
      const beforeWall = timeManager.lastWallTime;
      timeManager.resumeMonitoring();
      expect(timeManager.lastWallTime).toBeGreaterThanOrEqual(beforeWall);
      timeManager.stopMonitoring();
    });

    it('startMonitoring is idempotent', () => {
      timeManager.startMonitoring();
      const first = timeManager.checkInterval;
      timeManager.startMonitoring();
      const second = timeManager.checkInterval;
      // Both should be non-null
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      timeManager.stopMonitoring();
    });
  });

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------
  describe('destroy()', () => {
    it('sets isDestroyed flag, stops monitoring, clears listeners', () => {
      const cb = vi.fn();
      timeManager.addListener(cb);
      timeManager.startMonitoring();

      timeManager.destroy();
      expect(timeManager.isDestroyed).toBe(true);
      expect(timeManager.checkInterval).toBeNull();
      expect(timeManager.listeners.size).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // EventType constants
  // ------------------------------------------------------------------
  describe('EventType', () => {
    it('defines all expected event type constants', () => {
      expect(timeManager.EventType).toEqual({
        TIME_JUMP_FORWARD: 'time_jump_forward',
        TIME_JUMP_BACKWARD: 'time_jump_backward',
        TIMEZONE_CHANGE: 'timezone_change',
        DST_CHANGE: 'dst_change',
        SYSTEM_WAKE: 'system_wake',
        CLOCK_DRIFT: 'clock_drift',
      });
    });
  });

  // ------------------------------------------------------------------
  // Configuration thresholds
  // ------------------------------------------------------------------
  describe('configuration', () => {
    it('has 5-second time jump threshold', () => {
      expect(timeManager.TIME_JUMP_THRESHOLD).toBe(5000);
    });

    it('has 1-second check interval', () => {
      expect(timeManager.CHECK_INTERVAL).toBe(1000);
    });

    it('has 2-second monotonic drift threshold', () => {
      expect(timeManager.MONOTONIC_DRIFT_THRESHOLD).toBe(2000);
    });
  });
});
