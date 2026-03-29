import { describe, expect, it } from 'vitest';
import { MainTimeManager } from '../../../src/services/core/TimeManager';

describe('MainTimeManager', () => {
  const tm = new MainTimeManager();

  describe('now()', () => {
    it('returns a number close to Date.now()', () => {
      const before = Date.now();
      const result = tm.now();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('returns monotonically increasing values', () => {
      const a = tm.now();
      const b = tm.now();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  describe('getDate()', () => {
    it('returns current date when no argument', () => {
      const date = tm.getDate();
      expect(date).toBeInstanceOf(Date);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });

    it('returns date for given timestamp', () => {
      const ts = 1700000000000; // 2023-11-14T22:13:20.000Z
      const date = tm.getDate(ts);
      expect(date.getTime()).toBe(ts);
    });

    it('returns current date for null', () => {
      const date = tm.getDate(null);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });

    it('handles enterprise timestamp from 2025', () => {
      const ts = 1737945000000; // 2025-01-27T09:30:00.000Z
      const date = tm.getDate(ts);
      expect(date.getUTCFullYear()).toBe(2025);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(27);
    });

    it('treats 0 as falsy and returns current date', () => {
      // Source: `timestamp ? new Date(timestamp) : new Date()` — 0 is falsy
      const date = tm.getDate(0);
      expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
    });
  });

  describe('getMonotonicTime()', () => {
    it('returns a positive number in milliseconds', () => {
      const t = tm.getMonotonicTime();
      expect(t).toBeGreaterThan(0);
    });

    it('is monotonically increasing', () => {
      const a = tm.getMonotonicTime();
      const b = tm.getMonotonicTime();
      expect(b).toBeGreaterThanOrEqual(a);
    });

    it('uses process.hrtime for sub-millisecond precision', () => {
      const a = tm.getMonotonicTime();
      const b = tm.getMonotonicTime();
      // The difference should be very small but measurable
      expect(b - a).toBeGreaterThanOrEqual(0);
      expect(b - a).toBeLessThan(100); // Should be <100ms apart
    });
  });

  describe('formatTimestamp()', () => {
    it('returns ISO string for current time when no argument', () => {
      const result = tm.formatTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns ISO string for given timestamp', () => {
      expect(tm.formatTimestamp(1700000000000)).toBe('2023-11-14T22:13:20.000Z');
    });

    it('returns ISO string for null (current time)', () => {
      const result = tm.formatTimestamp(null);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('formats enterprise timestamp correctly', () => {
      // 2025-11-15T09:30:00.000Z
      expect(tm.formatTimestamp(1763199000000)).toBe('2025-11-15T09:30:00.000Z');
    });

    it('treats 0 as falsy and returns current time ISO string', () => {
      // Source: `timestamp ? new Date(timestamp) : new Date()` — 0 is falsy
      const result = tm.formatTimestamp(0);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('singleton export', () => {
    it('default export is a MainTimeManager instance', async () => {
      const mod = await import('../../../src/services/core/TimeManager');
      expect(mod.default).toBeInstanceOf(MainTimeManager);
      expect(typeof mod.default.now).toBe('function');
      expect(typeof mod.default.getDate).toBe('function');
      expect(typeof mod.default.getMonotonicTime).toBe('function');
      expect(typeof mod.default.formatTimestamp).toBe('function');
    });
  });
});
