import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import logger from '../../src/preload/modules/logger';
import timeUtils from '../../src/preload/modules/timeUtils';

describe('logger', () => {
    describe('formatTimestamp()', () => {
        it('returns a string matching the expected format', () => {
            const ts = logger.formatTimestamp();
            // Format: "YYYY-MM-DD HH:MM:SS.mmmZ"
            expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });

        it('uses newDate from timeUtils', () => {
            const fixedDate = new Date('2025-06-15T12:30:45.678Z');
            const spy = vi.spyOn(timeUtils, 'newDate').mockReturnValue(fixedDate);

            const ts = logger.formatTimestamp();
            expect(ts).toBe('2025-06-15 12:30:45.678Z');

            spy.mockRestore();
        });

        it('replaces T with space in ISO string', () => {
            const fixedDate = new Date('2023-01-01T00:00:00.000Z');
            const spy = vi.spyOn(timeUtils, 'newDate').mockReturnValue(fixedDate);

            const ts = logger.formatTimestamp();
            expect(ts).not.toContain('T');
            expect(ts).toBe('2023-01-01 00:00:00.000Z');

            spy.mockRestore();
        });
    });

    describe('info()', () => {
        it('logs message with INFO tag', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            logger.info('test message');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][0]).toContain('[INFO]');
            expect(spy.mock.calls[0][0]).toContain('[Preload]');
            expect(spy.mock.calls[0][0]).toContain('test message');
            spy.mockRestore();
        });

        it('logs message with data when provided', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const data = { key: 'value' };
            logger.info('test message', data);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][1]).toEqual(data);
            spy.mockRestore();
        });

        it('does not pass second arg when data is undefined', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            logger.info('test message');
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('test message'));
            expect(spy.mock.calls[0].length).toBe(1);
            spy.mockRestore();
        });
    });

    describe('error()', () => {
        it('logs message with ERROR tag', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            logger.error('error message');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][0]).toContain('[ERROR]');
            expect(spy.mock.calls[0][0]).toContain('[Preload]');
            expect(spy.mock.calls[0][0]).toContain('error message');
            spy.mockRestore();
        });

        it('logs message with data when provided', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const err = new Error('oops');
            logger.error('error message', err);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][1]).toBe(err);
            spy.mockRestore();
        });
    });

    describe('debug()', () => {
        const originalEnv = process.env.NODE_ENV;
        const originalDebug = process.env.DEBUG_MODE;

        afterEach(() => {
            process.env.NODE_ENV = originalEnv;
            if (originalDebug === undefined) {
                delete process.env.DEBUG_MODE;
            } else {
                process.env.DEBUG_MODE = originalDebug;
            }
        });

        it('does not log when not in debug mode', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.DEBUG_MODE;
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            logger.debug('hidden message');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('logs when NODE_ENV is development', () => {
            process.env.NODE_ENV = 'development';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            logger.debug('dev message');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][0]).toContain('[DEBUG]');
            expect(spy.mock.calls[0][0]).toContain('dev message');
            spy.mockRestore();
        });

        it('logs when DEBUG_MODE is true', () => {
            process.env.NODE_ENV = 'production';
            process.env.DEBUG_MODE = 'true';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            logger.debug('debug message');
            expect(spy).toHaveBeenCalledOnce();
            spy.mockRestore();
        });

        it('logs with data when provided in debug mode', () => {
            process.env.NODE_ENV = 'development';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            logger.debug('debug message', { detail: 123 });
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][1]).toEqual({ detail: 123 });
            spy.mockRestore();
        });
    });
});
