import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the logger before importing the module
vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const timeManagerModule = await import('../../../../src/renderer/services/TimeManager');
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
      timeManager.listeners.add(cb);
      timeManager.handleSystemWake();

      expect(cb).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: timeManager.EventType.SYSTEM_WAKE,
            source: 'os_event',
          }),
        ]),
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
  // startMonitoring / stopMonitoring
  // ------------------------------------------------------------------
  describe('monitoring', () => {
    it('stopMonitoring clears interval', () => {
      timeManager.startMonitoring();
      expect(timeManager.checkInterval).not.toBeNull();
      timeManager.stopMonitoring();
      expect(timeManager.checkInterval).toBeNull();
    });

    it('startMonitoring restarts after stop', () => {
      timeManager.startMonitoring();
      expect(timeManager.checkInterval).not.toBeNull();
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
      timeManager.listeners.add(vi.fn());
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
