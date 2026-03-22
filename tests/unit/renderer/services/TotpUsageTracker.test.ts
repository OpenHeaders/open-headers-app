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
    it('records usage with correct fields for enterprise source', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = '847291';
      tracker.recordUsage(sourceId, secret, code);

      const usage = tracker.usageMap.get(sourceId)!;
      expect(usage).toBeTruthy();
      expect(usage.lastCode).toBe('847291');
      expect(usage.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(usage.lastUsedTime).toBeGreaterThan(0);
      expect(usage.cooldownUntil - usage.lastUsedTime).toBe(30000);
    });

    it('does nothing for empty sourceId', () => {
      tracker.recordUsage('', 'JBSWY3DPEHPK3PXP', '123456');
      expect(tracker.usageMap.size).toBe(0);
    });

    it('does nothing for empty code', () => {
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', '');
      expect(tracker.usageMap.size).toBe(0);
    });

    it('does nothing for null sourceId', () => {
      tracker.recordUsage(null as unknown as string, 'JBSWY3DPEHPK3PXP', '123456');
      expect(tracker.usageMap.size).toBe(0);
    });

    it('does nothing for null code', () => {
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', null as unknown as string);
      expect(tracker.usageMap.size).toBe(0);
    });

    it('overwrites previous usage for same sourceId', () => {
      const sourceId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      tracker.recordUsage(sourceId, 'JBSWY3DPEHPK3PXP', '111111');
      tracker.recordUsage(sourceId, 'JBSWY3DPEHPK3PXP', '222222');
      expect(tracker.usageMap.get(sourceId)!.lastCode).toBe('222222');
      expect(tracker.usageMap.size).toBe(1);
    });

    it('starts cleanup interval on first recording', () => {
      expect(tracker.cleanupInterval).toBeNull();
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', '123456');
      expect(tracker.cleanupInterval).not.toBeNull();
    });

    it('tracks multiple sources independently', () => {
      tracker.recordUsage('src-oauth-1', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-2', 'SECRET2', '222222');
      tracker.recordUsage('src-oauth-3', 'SECRET3', '333333');
      expect(tracker.usageMap.size).toBe(3);
      expect(tracker.usageMap.get('src-oauth-1')!.lastCode).toBe('111111');
      expect(tracker.usageMap.get('src-oauth-2')!.lastCode).toBe('222222');
      expect(tracker.usageMap.get('src-oauth-3')!.lastCode).toBe('333333');
    });

    it('has TOTP_PERIOD of 30 seconds', () => {
      expect(tracker.TOTP_PERIOD).toBe(30000);
    });

    it('has CLEANUP_INTERVAL of 60 seconds', () => {
      expect(tracker.CLEANUP_INTERVAL).toBe(60000);
    });
  });

  // ------------------------------------------------------------------
  // checkCooldown
  // ------------------------------------------------------------------
  describe('checkCooldown', () => {
    it('returns full not-in-cooldown shape for unknown sourceId', () => {
      const result = tracker.checkCooldown('unknown-source-uuid');
      expect(result).toEqual({
        inCooldown: false,
        remainingSeconds: 0,
        lastUsedTime: null,
      });
    });

    it('returns not-in-cooldown for empty sourceId', () => {
      const result = tracker.checkCooldown('');
      expect(result).toEqual({
        inCooldown: false,
        remainingSeconds: 0,
        lastUsedTime: null,
      });
    });

    it('returns not-in-cooldown for null sourceId', () => {
      const result = tracker.checkCooldown(null as unknown as string);
      expect(result).toEqual({
        inCooldown: false,
        remainingSeconds: 0,
        lastUsedTime: null,
      });
    });

    it('returns in-cooldown with full shape for recently recorded usage', () => {
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', '847291');
      const result = tracker.checkCooldown('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.inCooldown).toBe(true);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(30);
      expect(result.lastUsedTime).toBeGreaterThan(0);
    });

    it('returns not-in-cooldown when cooldown has expired', () => {
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', '847291');
      const usage = tracker.usageMap.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')!;
      usage.cooldownUntil = Date.now() - 1000;

      const result = tracker.checkCooldown('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
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
      tracker.recordUsage('src-oauth-1', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-2', 'SECRET2', '222222');

      for (const [, usage] of tracker.usageMap) {
        usage.cooldownUntil = Date.now() - 1000;
      }
      tracker.cleanup();

      expect(tracker.usageMap.size).toBe(0);
    });

    it('keeps active entries', () => {
      tracker.recordUsage('src-oauth-1', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-2', 'SECRET2', '222222');

      tracker.usageMap.get('src-oauth-1')!.cooldownUntil = Date.now() - 1000;
      tracker.cleanup();

      expect(tracker.usageMap.size).toBe(1);
      expect(tracker.usageMap.has('src-oauth-2')).toBe(true);
    });

    it('does nothing on empty map', () => {
      expect(() => tracker.cleanup()).not.toThrow();
    });

    it('stops cleanup interval when map becomes empty', () => {
      tracker.recordUsage('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'JBSWY3DPEHPK3PXP', '847291');
      expect(tracker.cleanupInterval).not.toBeNull();

      tracker.usageMap.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890')!.cooldownUntil = Date.now() - 1000;
      tracker.cleanup();

      expect(tracker.cleanupInterval).toBeNull();
      expect(tracker.usageMap.size).toBe(0);
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
      tracker.recordUsage('src-oauth-prod', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-staging', 'SECRET2', '222222');

      const active = tracker.getAllActiveCooldowns();
      expect(active).toContain('src-oauth-prod');
      expect(active).toContain('src-oauth-staging');
      expect(active).toHaveLength(2);
    });

    it('excludes expired source IDs', () => {
      tracker.recordUsage('src-oauth-prod', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-staging', 'SECRET2', '222222');

      tracker.usageMap.get('src-oauth-prod')!.cooldownUntil = Date.now() - 1000;

      const active = tracker.getAllActiveCooldowns();
      expect(active).not.toContain('src-oauth-prod');
      expect(active).toContain('src-oauth-staging');
      expect(active).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // destroy
  // ------------------------------------------------------------------
  describe('destroy', () => {
    it('clears the map and interval completely', () => {
      tracker.recordUsage('src-oauth-1', 'SECRET1', '111111');
      tracker.recordUsage('src-oauth-2', 'SECRET2', '222222');
      expect(tracker.usageMap.size).toBe(2);
      expect(tracker.cleanupInterval).not.toBeNull();

      tracker.destroy();

      expect(tracker.usageMap.size).toBe(0);
      expect(tracker.cleanupInterval).toBeNull();
    });

    it('is safe to call multiple times', () => {
      tracker.destroy();
      tracker.destroy();
      expect(tracker.usageMap.size).toBe(0);
      expect(tracker.cleanupInterval).toBeNull();
    });
  });
});
