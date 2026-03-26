import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger', () => ({
    default: {
        createLogger: () => ({
            info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
        }),
    }
}));

import { TotpCooldownTracker } from '../../../../src/services/http/TotpCooldownTracker';

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
            tracker.recordUsage('src-1', 'JBSWY3DPEHPK3PXP', '123456');
            const cooldown = tracker.checkCooldown('src-1');
            expect(cooldown.inCooldown).toBe(true);
            expect(cooldown.remainingSeconds).toBeGreaterThan(0);
            expect(cooldown.remainingSeconds).toBeLessThanOrEqual(30);
            expect(cooldown.lastUsedTime).toBeGreaterThan(0);
        });

        it('ignores empty sourceId', () => {
            tracker.recordUsage('', 'secret', '123456');
            expect(tracker.getAllActiveCooldowns()).toHaveLength(0);
        });

        it('ignores empty code', () => {
            tracker.recordUsage('src-1', 'secret', '');
            expect(tracker.checkCooldown('src-1').inCooldown).toBe(false);
        });
    });

    describe('checkCooldown', () => {
        it('returns no cooldown for unknown source', () => {
            const cooldown = tracker.checkCooldown('unknown');
            expect(cooldown.inCooldown).toBe(false);
            expect(cooldown.remainingSeconds).toBe(0);
            expect(cooldown.lastUsedTime).toBeNull();
        });

        it('returns no cooldown for empty sourceId', () => {
            const cooldown = tracker.checkCooldown('');
            expect(cooldown.inCooldown).toBe(false);
            expect(cooldown.remainingSeconds).toBe(0);
        });

        it('returns active cooldown after recording', () => {
            tracker.recordUsage('src-1', 'secret', '123456');
            const cooldown = tracker.checkCooldown('src-1');
            expect(cooldown.inCooldown).toBe(true);
            expect(cooldown.remainingSeconds).toBe(30);
        });

        it('returns expired cooldown after period passes', () => {
            // Record usage, then advance time past cooldown
            vi.useFakeTimers();
            tracker.recordUsage('src-1', 'secret', '123456');

            vi.advanceTimersByTime(31000);
            const cooldown = tracker.checkCooldown('src-1');
            expect(cooldown.inCooldown).toBe(false);
            expect(cooldown.remainingSeconds).toBe(0);
            expect(cooldown.lastUsedTime).toBeGreaterThan(0);

            vi.useRealTimers();
        });
    });

    describe('getCooldownSeconds', () => {
        it('returns 0 for unknown source', () => {
            expect(tracker.getCooldownSeconds('unknown')).toBe(0);
        });

        it('returns remaining seconds after recording', () => {
            tracker.recordUsage('src-1', 'secret', '123456');
            expect(tracker.getCooldownSeconds('src-1')).toBe(30);
        });
    });

    describe('getAllActiveCooldowns', () => {
        it('returns empty array when no cooldowns', () => {
            expect(tracker.getAllActiveCooldowns()).toEqual([]);
        });

        it('returns active source IDs', () => {
            tracker.recordUsage('src-1', 'secret1', '111111');
            tracker.recordUsage('src-2', 'secret2', '222222');
            const active = tracker.getAllActiveCooldowns();
            expect(active).toContain('src-1');
            expect(active).toContain('src-2');
            expect(active).toHaveLength(2);
        });

        it('excludes expired cooldowns', () => {
            vi.useFakeTimers();
            tracker.recordUsage('src-1', 'secret1', '111111');

            vi.advanceTimersByTime(31000);
            tracker.recordUsage('src-2', 'secret2', '222222');

            const active = tracker.getAllActiveCooldowns();
            expect(active).toEqual(['src-2']);

            vi.useRealTimers();
        });
    });

    describe('destroy', () => {
        it('clears all state', () => {
            tracker.recordUsage('src-1', 'secret', '123456');
            tracker.destroy();
            expect(tracker.checkCooldown('src-1').inCooldown).toBe(false);
            expect(tracker.getAllActiveCooldowns()).toEqual([]);
        });
    });

    describe('separate sources have independent cooldowns', () => {
        it('tracks cooldowns per source', () => {
            tracker.recordUsage('auth-openheaders-io', 'secret1', '111111');
            tracker.recordUsage('api-openheaders-io', 'secret2', '222222');

            expect(tracker.checkCooldown('auth-openheaders-io').inCooldown).toBe(true);
            expect(tracker.checkCooldown('api-openheaders-io').inCooldown).toBe(true);
            expect(tracker.checkCooldown('other-source').inCooldown).toBe(false);
        });
    });
});
