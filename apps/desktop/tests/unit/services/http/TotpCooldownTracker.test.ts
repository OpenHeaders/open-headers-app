import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { TotpCooldownTracker } from '@/services/http/TotpCooldownTracker';

describe('TotpCooldownTracker', () => {
  let tracker: TotpCooldownTracker;

  beforeEach(() => {
    tracker = new TotpCooldownTracker();
  });

  afterEach(() => {
    tracker.destroy();
  });

  describe('recordUsage', () => {
    it('records TOTP usage for a source', () => {
      tracker.recordUsage('ws-1', 'src-1', 'JBSWY3DPEHPK3PXP', '123456');
      const cooldown = tracker.checkCooldown('ws-1', 'src-1');
      expect(cooldown.inCooldown).toBe(true);
      expect(cooldown.remainingSeconds).toBeGreaterThan(0);
      expect(cooldown.remainingSeconds).toBeLessThanOrEqual(30);
      expect(cooldown.lastUsedTime).toBeGreaterThan(0);
    });

    it('ignores empty sourceId', () => {
      tracker.recordUsage('ws-1', '', 'secret', '123456');
      expect(tracker.getAllActiveCooldowns()).toHaveLength(0);
    });

    it('ignores empty code', () => {
      tracker.recordUsage('ws-1', 'src-1', 'secret', '');
      expect(tracker.checkCooldown('ws-1', 'src-1').inCooldown).toBe(false);
    });
  });

  describe('checkCooldown', () => {
    it('returns no cooldown for unknown source', () => {
      const cooldown = tracker.checkCooldown('ws-1', 'unknown');
      expect(cooldown.inCooldown).toBe(false);
      expect(cooldown.remainingSeconds).toBe(0);
      expect(cooldown.lastUsedTime).toBeNull();
    });

    it('returns no cooldown for empty sourceId', () => {
      const cooldown = tracker.checkCooldown('ws-1', '');
      expect(cooldown.inCooldown).toBe(false);
      expect(cooldown.remainingSeconds).toBe(0);
    });

    it('returns active cooldown after recording', () => {
      tracker.recordUsage('ws-1', 'src-1', 'secret', '123456');
      const cooldown = tracker.checkCooldown('ws-1', 'src-1');
      expect(cooldown.inCooldown).toBe(true);
      expect(cooldown.remainingSeconds).toBe(30);
    });

    it('returns expired cooldown after period passes', () => {
      // Record usage, then advance time past cooldown
      vi.useFakeTimers();
      tracker.recordUsage('ws-1', 'src-1', 'secret', '123456');

      vi.advanceTimersByTime(31000);
      const cooldown = tracker.checkCooldown('ws-1', 'src-1');
      expect(cooldown.inCooldown).toBe(false);
      expect(cooldown.remainingSeconds).toBe(0);
      expect(cooldown.lastUsedTime).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('getCooldownSeconds', () => {
    it('returns 0 for unknown source', () => {
      expect(tracker.getCooldownSeconds('ws-1', 'unknown')).toBe(0);
    });

    it('returns remaining seconds after recording', () => {
      tracker.recordUsage('ws-1', 'src-1', 'secret', '123456');
      expect(tracker.getCooldownSeconds('ws-1', 'src-1')).toBe(30);
    });
  });

  describe('getAllActiveCooldowns', () => {
    it('returns empty array when no cooldowns', () => {
      expect(tracker.getAllActiveCooldowns()).toEqual([]);
    });

    it('returns active composite keys (workspaceId:sourceId)', () => {
      tracker.recordUsage('ws-1', 'src-1', 'secret1', '111111');
      tracker.recordUsage('ws-1', 'src-2', 'secret2', '222222');
      const active = tracker.getAllActiveCooldowns();
      expect(active).toContain('ws-1:src-1');
      expect(active).toContain('ws-1:src-2');
      expect(active).toHaveLength(2);
    });

    it('excludes expired cooldowns', () => {
      vi.useFakeTimers();
      tracker.recordUsage('ws-1', 'src-1', 'secret1', '111111');

      vi.advanceTimersByTime(31000);
      tracker.recordUsage('ws-1', 'src-2', 'secret2', '222222');

      const active = tracker.getAllActiveCooldowns();
      expect(active).toEqual(['ws-1:src-2']);

      vi.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('clears all state', () => {
      tracker.recordUsage('ws-1', 'src-1', 'secret', '123456');
      tracker.destroy();
      expect(tracker.checkCooldown('ws-1', 'src-1').inCooldown).toBe(false);
      expect(tracker.getAllActiveCooldowns()).toEqual([]);
    });
  });

  describe('workspace isolation', () => {
    it('same sourceId in different workspaces have independent cooldowns', () => {
      tracker.recordUsage('ws-team-1', 'src-1', 'secret-a', '111111');

      // Same source ID in different workspace should NOT be in cooldown
      expect(tracker.checkCooldown('ws-team-2', 'src-1').inCooldown).toBe(false);
      // Original workspace IS in cooldown
      expect(tracker.checkCooldown('ws-team-1', 'src-1').inCooldown).toBe(true);
    });

    it('recording in one workspace does not affect another', () => {
      tracker.recordUsage('ws-team-1', 'src-1', 'secret-a', '111111');
      tracker.recordUsage('ws-team-2', 'src-1', 'secret-b', '222222');

      // Both in cooldown independently
      expect(tracker.checkCooldown('ws-team-1', 'src-1').inCooldown).toBe(true);
      expect(tracker.checkCooldown('ws-team-2', 'src-1').inCooldown).toBe(true);
      expect(tracker.getAllActiveCooldowns()).toHaveLength(2);
    });
  });

  describe('separate sources have independent cooldowns', () => {
    it('tracks cooldowns per source', () => {
      tracker.recordUsage('ws-1', 'auth-openheaders-io', 'secret1', '111111');
      tracker.recordUsage('ws-1', 'api-openheaders-io', 'secret2', '222222');

      expect(tracker.checkCooldown('ws-1', 'auth-openheaders-io').inCooldown).toBe(true);
      expect(tracker.checkCooldown('ws-1', 'api-openheaders-io').inCooldown).toBe(true);
      expect(tracker.checkCooldown('ws-1', 'other-source').inCooldown).toBe(false);
    });
  });
});
