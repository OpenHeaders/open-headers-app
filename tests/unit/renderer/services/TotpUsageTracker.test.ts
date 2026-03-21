import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import the singleton tracker
const trackerModule = await import(
  '../../../../src/renderer/services/TotpUsageTracker'
);
const tracker = trackerModule.default || trackerModule;

describe('TotpUsageTracker', () => {
  beforeEach(() => {
    tracker.destroy();
  });

  afterEach(() => {
    tracker.destroy();
  });

  // ------------------------------------------------------------------
  // recordUsage
  // ------------------------------------------------------------------
  describe('recordUsage', () => {
    it('records usage with correct fields', () => {
      tracker.recordUsage('src1', 'secret', '123456');
      const usage = tracker.usageMap.get('src1')!;
      expect(usage).toBeTruthy();
      expect(usage.lastCode).toBe('123456');
      expect(usage.secret).toBe('secret');
      expect(usage.lastUsedTime).toBeGreaterThan(0);
      // cooldownUntil should be ~30 seconds after lastUsedTime
      expect(usage.cooldownUntil - usage.lastUsedTime).toBe(30000);
    });

    it('does nothing for null sourceId', () => {
      // Intentionally null to test runtime guard
      tracker.recordUsage(null as unknown as string, 'secret', '123');
      expect(tracker.usageMap.size).toBe(0);
    });

    it('does nothing for null code', () => {
      // Intentionally null to test runtime guard
      tracker.recordUsage('src1', 'secret', null as unknown as string);
      expect(tracker.usageMap.size).toBe(0);
    });

    it('overwrites previous usage for same sourceId', () => {
      tracker.recordUsage('src1', 'secret', '111111');
      tracker.recordUsage('src1', 'secret', '222222');
      expect(tracker.usageMap.get('src1')!.lastCode).toBe('222222');
    });

    it('starts cleanup interval on first recording', () => {
      expect(tracker.cleanupInterval).toBeNull();
      tracker.recordUsage('src1', 'secret', '123456');
      expect(tracker.cleanupInterval).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // checkCooldown
  // ------------------------------------------------------------------
  describe('checkCooldown', () => {
    it('returns not in cooldown for unknown sourceId', () => {
      const result = tracker.checkCooldown('unknown');
      expect(result.inCooldown).toBe(false);
      expect(result.remainingSeconds).toBe(0);
      expect(result.lastUsedTime).toBeNull();
    });

    it('returns not in cooldown for null sourceId', () => {
      // Intentionally null to test runtime guard
      const result = tracker.checkCooldown(null as unknown as string);
      expect(result.inCooldown).toBe(false);
    });

    it('returns in cooldown for recently recorded usage', () => {
      tracker.recordUsage('src1', 'secret', '123456');
      // Immediately after recording, should be in cooldown
      const result = tracker.checkCooldown('src1');
      expect(result.inCooldown).toBe(true);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(30);
      expect(result.lastUsedTime).toBeGreaterThan(0);
    });

    it('returns not in cooldown when cooldownUntil is in the past', () => {
      tracker.recordUsage('src1', 'secret', '123456');
      // Manually set cooldownUntil to the past
      const usage = tracker.usageMap.get('src1')!;
      usage.cooldownUntil = Date.now() - 1000;

      const result = tracker.checkCooldown('src1');
      expect(result.inCooldown).toBe(false);
      expect(result.remainingSeconds).toBe(0);
      expect(result.lastUsedTime).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // cleanup
  // ------------------------------------------------------------------
  describe('cleanup', () => {
    it('removes expired entries', () => {
      tracker.recordUsage('src1', 'secret', '111111');
      tracker.recordUsage('src2', 'secret', '222222');

      // Force both to be expired
      for (const [, usage] of tracker.usageMap) {
        usage.cooldownUntil = Date.now() - 1000;
      }
      tracker.cleanup();

      expect(tracker.usageMap.size).toBe(0);
    });

    it('keeps active entries', () => {
      tracker.recordUsage('src1', 'secret', '111111');
      tracker.recordUsage('src2', 'secret', '222222');

      // Expire only src1
      tracker.usageMap.get('src1')!.cooldownUntil = Date.now() - 1000;

      tracker.cleanup();

      expect(tracker.usageMap.size).toBe(1);
      expect(tracker.usageMap.has('src2')).toBe(true);
    });

    it('does nothing on empty map', () => {
      expect(() => tracker.cleanup()).not.toThrow();
    });

    it('stops cleanup interval when map becomes empty', () => {
      tracker.recordUsage('src1', 'secret', '111111');
      expect(tracker.cleanupInterval).not.toBeNull();

      // Expire the entry
      tracker.usageMap.get('src1')!.cooldownUntil = Date.now() - 1000;
      tracker.cleanup();

      expect(tracker.cleanupInterval).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // getAllActiveCooldowns
  // ------------------------------------------------------------------
  describe('getAllActiveCooldowns', () => {
    it('returns empty array when no entries', () => {
      expect(tracker.getAllActiveCooldowns()).toEqual([]);
    });

    it('returns active source IDs', () => {
      tracker.recordUsage('src1', 'secret', '111');
      tracker.recordUsage('src2', 'secret', '222');

      const active = tracker.getAllActiveCooldowns();
      expect(active).toContain('src1');
      expect(active).toContain('src2');
    });

    it('excludes expired source IDs', () => {
      tracker.recordUsage('src1', 'secret', '111');
      tracker.recordUsage('src2', 'secret', '222');

      // Expire src1
      tracker.usageMap.get('src1')!.cooldownUntil = Date.now() - 1000;

      const active = tracker.getAllActiveCooldowns();
      expect(active).not.toContain('src1');
      expect(active).toContain('src2');
    });
  });

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------
  describe('destroy', () => {
    it('clears the map and interval', () => {
      tracker.recordUsage('src1', 'secret', '111');
      tracker.destroy();

      expect(tracker.usageMap.size).toBe(0);
      expect(tracker.cleanupInterval).toBeNull();
    });
  });
});
