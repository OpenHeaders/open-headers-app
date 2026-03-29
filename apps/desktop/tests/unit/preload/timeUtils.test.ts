import { describe, expect, it } from 'vitest';
import timeUtils from '../../../src/preload/modules/timeUtils';

describe('timeUtils', () => {
  describe('now()', () => {
    it('returns a number close to Date.now()', () => {
      const before = Date.now();
      const result = timeUtils.now();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('returns a positive integer', () => {
      const result = timeUtils.now();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('returns monotonically non-decreasing values', () => {
      const t1 = timeUtils.now();
      const t2 = timeUtils.now();
      expect(t2).toBeGreaterThanOrEqual(t1);
    });
  });

  describe('newDate()', () => {
    it('returns current date when no argument', () => {
      const before = Date.now();
      const date = timeUtils.newDate();
      const after = Date.now();
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBeGreaterThanOrEqual(before);
      expect(date.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns date for given timestamp (enterprise ISO date)', () => {
      // 2026-01-20T14:45:12.345Z
      const ts = 1768924712345;
      const date = timeUtils.newDate(ts);
      expect(date.getTime()).toBe(ts);
      expect(date.toISOString()).toContain('2026');
    });

    it('returns current date for falsy timestamp (0)', () => {
      // 0 is falsy, so newDate(0) returns new Date() (current time)
      const before = Date.now();
      const date = timeUtils.newDate(0);
      const after = Date.now();
      expect(date.getTime()).toBeGreaterThanOrEqual(before);
      expect(date.getTime()).toBeLessThanOrEqual(after);
    });

    it('returns a new Date instance each call (not shared reference)', () => {
      const ts = 1700000000000;
      const d1 = timeUtils.newDate(ts);
      const d2 = timeUtils.newDate(ts);
      expect(d1).not.toBe(d2);
      expect(d1.getTime()).toBe(d2.getTime());
    });

    it('handles epoch timestamp', () => {
      // Timestamp 1 (truthy, not 0)
      const date = timeUtils.newDate(1);
      expect(date.getTime()).toBe(1);
    });
  });
});
