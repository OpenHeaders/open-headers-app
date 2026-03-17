import { describe, it, expect } from 'vitest';
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
    });

    describe('getDate()', () => {
        it('returns current date when no argument', () => {
            const date = tm.getDate();
            expect(date).toBeInstanceOf(Date);
            expect(Math.abs(date.getTime() - Date.now())).toBeLessThan(100);
        });

        it('returns date for given timestamp', () => {
            const ts = 1700000000000;
            const date = tm.getDate(ts);
            expect(date.getTime()).toBe(ts);
        });

        it('returns current date for null', () => {
            const date = tm.getDate(null);
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
    });

    describe('formatTimestamp()', () => {
        it('returns ISO string for current time', () => {
            const result = tm.formatTimestamp();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('returns ISO string for given timestamp', () => {
            const result = tm.formatTimestamp(1700000000000);
            expect(result).toBe('2023-11-14T22:13:20.000Z');
        });
    });
});
