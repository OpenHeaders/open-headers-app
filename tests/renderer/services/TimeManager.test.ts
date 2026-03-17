import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before importing the module
vi.mock('../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// The renderer TimeManager is a singleton that uses `performance.now()`.
// We import it fresh for each suite.
const timeManagerModule = await import(
  '../../../src/renderer/services/TimeManager'
);
// It exports the singleton via module.exports = new TimeManager()
const timeManager = timeManagerModule.default || timeManagerModule;

describe('Renderer TimeManager', () => {
  afterEach(() => {
    timeManager.stopMonitoring();
    timeManager.listeners.clear();
    // Reset destroyed flag for test isolation
    timeManager.isDestroyed = false;
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

    it('returns date for given timestamp', () => {
      const ts = 1700000000000;
      const date = timeManager.getDate(ts);
      expect(date.getTime()).toBe(ts);
    });

    it('returns current date for null', () => {
      const date = timeManager.getDate(null);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });
  });

  // ------------------------------------------------------------------
  // getMonotonicTime()
  // ------------------------------------------------------------------
  describe('getMonotonicTime()', () => {
    it('returns a positive number', () => {
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
  });

  // ------------------------------------------------------------------
  // isDST()
  // ------------------------------------------------------------------
  describe('isDST()', () => {
    it('returns a boolean', () => {
      expect(typeof timeManager.isDST()).toBe('boolean');
    });

    it('accepts a timestamp argument', () => {
      expect(typeof timeManager.isDST(Date.now())).toBe('boolean');
    });
  });

  // ------------------------------------------------------------------
  // addListener / notifyListeners
  // ------------------------------------------------------------------
  describe('listeners', () => {
    it('addListener registers callback and returns unsubscribe', () => {
      const cb = vi.fn();
      const unsub = timeManager.addListener(cb);
      expect(timeManager.listeners.size).toBeGreaterThanOrEqual(1);
      unsub();
      expect(timeManager.listeners.has(cb)).toBe(false);
    });

    it('notifyListeners calls all registered listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      timeManager.addListener(cb1);
      timeManager.addListener(cb2);

      const events = [{ type: 'test_event' }];
      timeManager.notifyListeners(events);

      expect(cb1).toHaveBeenCalledWith(events);
      expect(cb2).toHaveBeenCalledWith(events);
    });

    it('notifyListeners handles listener errors gracefully', () => {
      const badCb = vi.fn().mockImplementation(() => {
        throw new Error('listener error');
      });
      const goodCb = vi.fn();
      timeManager.addListener(badCb);
      timeManager.addListener(goodCb);

      expect(() =>
        timeManager.notifyListeners([{ type: 'test' }])
      ).not.toThrow();
      expect(goodCb).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // handleSystemWake
  // ------------------------------------------------------------------
  describe('handleSystemWake()', () => {
    it('sets recentOSWakeEvent flag', () => {
      timeManager.handleSystemWake();
      expect(timeManager.recentOSWakeEvent).toBe(true);

      // Clean up timer
      if (timeManager.osWakeEventTimeout) {
        clearTimeout(timeManager.osWakeEventTimeout);
        timeManager.osWakeEventTimeout = null;
      }
      timeManager.recentOSWakeEvent = false;
    });

    it('notifies listeners with SYSTEM_WAKE event', () => {
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

      // Clean up
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
      const result = timeManager.getNextAlignedTime(5000);
      expect(result).toBeGreaterThanOrEqual(now + 5000 - 10);
    });

    it('uses lastRun when provided and no alignment', () => {
      const lastRun = Date.now() - 1000;
      const result = timeManager.getNextAlignedTime(5000, lastRun);
      expect(result).toBe(lastRun + 5000);
    });

    it('aligns to minute boundary', () => {
      const result = timeManager.getNextAlignedTime(60000, null, {
        alignToMinute: true,
      });
      const date = new Date(result);
      expect(date.getSeconds()).toBe(0);
      expect(date.getMilliseconds()).toBe(0);
    });

    it('aligns to hour boundary', () => {
      const result = timeManager.getNextAlignedTime(3600000, null, {
        alignToHour: true,
      });
      const date = new Date(result);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });

    it('aligns to day boundary', () => {
      const result = timeManager.getNextAlignedTime(86400000, null, {
        alignToDay: true,
      });
      const date = new Date(result);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });

    it('ensures result is in the future', () => {
      const now = timeManager.now();
      const result = timeManager.getNextAlignedTime(1000, null, {
        alignToMinute: true,
      });
      expect(result).toBeGreaterThan(now);
    });
  });

  // ------------------------------------------------------------------
  // getStatistics
  // ------------------------------------------------------------------
  describe('getStatistics()', () => {
    it('returns stats object', () => {
      const stats = timeManager.getStatistics();
      expect(stats).toHaveProperty('timeJumps');
      expect(stats).toHaveProperty('timezoneChanges');
      expect(stats).toHaveProperty('dstChanges');
      expect(stats).toHaveProperty('systemWakes');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('currentTimezone');
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ------------------------------------------------------------------
  // startMonitoring / stopMonitoring
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
  });

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------
  describe('destroy()', () => {
    it('sets isDestroyed flag and stops monitoring', () => {
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
    it('defines expected event types', () => {
      expect(timeManager.EventType.TIME_JUMP_FORWARD).toBe(
        'time_jump_forward'
      );
      expect(timeManager.EventType.TIME_JUMP_BACKWARD).toBe(
        'time_jump_backward'
      );
      expect(timeManager.EventType.TIMEZONE_CHANGE).toBe('timezone_change');
      expect(timeManager.EventType.DST_CHANGE).toBe('dst_change');
      expect(timeManager.EventType.SYSTEM_WAKE).toBe('system_wake');
      expect(timeManager.EventType.CLOCK_DRIFT).toBe('clock_drift');
    });
  });
});
