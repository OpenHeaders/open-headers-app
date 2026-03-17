import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

        it('returns a number', () => {
            expect(typeof timeUtils.now()).toBe('number');
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

        it('returns date for given timestamp', () => {
            const ts = 1700000000000;
            const date = timeUtils.newDate(ts);
            expect(date.getTime()).toBe(ts);
        });

        it('returns current date for falsy timestamp (0)', () => {
            // 0 is falsy, so newDate(0) returns new Date() (current time)
            const before = Date.now();
            const date = timeUtils.newDate(0);
            const after = Date.now();
            expect(date.getTime()).toBeGreaterThanOrEqual(before);
            expect(date.getTime()).toBeLessThanOrEqual(after);
        });

        it('returns a new Date instance each call', () => {
            const d1 = timeUtils.newDate(1000);
            const d2 = timeUtils.newDate(1000);
            expect(d1).not.toBe(d2);
            expect(d1.getTime()).toBe(d2.getTime());
        });
    });
});
