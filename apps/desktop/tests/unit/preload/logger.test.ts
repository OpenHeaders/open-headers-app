import { describe, it, expect, vi, afterEach } from 'vitest';
import logger from '../../../src/preload/modules/logger';
import timeUtils from '../../../src/preload/modules/timeUtils';

describe('logger', () => {
    describe('log prefix format', () => {
        it('includes ISO timestamp, level, and module in prefix', () => {
            const fixedDate = new Date('2026-01-20T14:45:12.345Z');
            const spy = vi.spyOn(timeUtils, 'newDate').mockReturnValue(fixedDate);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            logger.info('test message');

            const prefix = logSpy.mock.calls[0][0] as string;
            expect(prefix).toContain('2026-01-20T14:45:12.345Z');
            expect(prefix).toContain('INFO ');
            expect(prefix).toContain('[Preload]');
            spy.mockRestore();
            logSpy.mockRestore();
        });

        it('pads level labels to 5 chars for alignment', () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            logger.info('test');
            logger.warn('test');
            logger.error('test');

            expect((logSpy.mock.calls[0][0] as string)).toContain('INFO ');
            expect((warnSpy.mock.calls[0][0] as string)).toContain('WARN ');
            expect((errorSpy.mock.calls[0][0] as string)).toContain('ERROR');
            logSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        });

        it('handles midnight correctly', () => {
            const midnight = new Date('2026-03-15T00:00:00.000Z');
            const spy = vi.spyOn(timeUtils, 'newDate').mockReturnValue(midnight);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            logger.info('test');

            const prefix = logSpy.mock.calls[0][0] as string;
            expect(prefix).toContain('2026-03-15T00:00:00.000Z');
            spy.mockRestore();
            logSpy.mockRestore();
        });

        it('handles end-of-day correctly', () => {
            const endOfDay = new Date('2026-12-31T23:59:59.999Z');
            const spy = vi.spyOn(timeUtils, 'newDate').mockReturnValue(endOfDay);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            logger.info('test');

            const prefix = logSpy.mock.calls[0][0] as string;
            expect(prefix).toContain('2026-12-31T23:59:59.999Z');
            spy.mockRestore();
            logSpy.mockRestore();
        });
    });

    describe('info()', () => {
        it('logs prefix and message as separate args', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            logger.info('Source refresh completed for a1b2c3d4-e5f6-7890-abcd-ef1234567890');

            expect(spy).toHaveBeenCalledOnce();
            const prefix = spy.mock.calls[0][0] as string;
            const message = spy.mock.calls[0][1] as string;
            expect(prefix).toContain('INFO ');
            expect(prefix).toContain('[Preload]');
            expect(message).toBe('Source refresh completed for a1b2c3d4-e5f6-7890-abcd-ef1234567890');
            spy.mockRestore();
        });

        it('logs message with data object when provided', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const data = {
                sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                refreshInterval: 30000,
                status: 'success'
            };
            logger.info('Source refreshed', data);

            expect(spy).toHaveBeenCalledOnce();
            const dataArg = spy.mock.calls[0][2] as string;
            expect(dataArg).toContain('"sourceId"');
            expect(dataArg).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
            spy.mockRestore();
        });

        it('does not pass data arg when data is undefined', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
            logger.info('Proxy started');
            expect(spy.mock.calls[0].length).toBe(2); // prefix + message
            spy.mockRestore();
        });
    });

    describe('error()', () => {
        it('logs prefix and message with ERROR and [Preload] tags', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            logger.error('OAuth2 token refresh failed for https://auth.openheaders.io:8443/oauth2/token');

            expect(spy).toHaveBeenCalledOnce();
            const prefix = spy.mock.calls[0][0] as string;
            const message = spy.mock.calls[0][1] as string;
            expect(prefix).toContain('ERROR');
            expect(prefix).toContain('[Preload]');
            expect(message).toContain('OAuth2 token refresh failed');
            spy.mockRestore();
        });

        it('logs message with Error object when provided', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const err = new Error('ECONNREFUSED: connect ECONNREFUSED 10.0.1.50:8443');
            logger.error('HTTP request failed', err);

            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][2]).toBe('Error: ECONNREFUSED: connect ECONNREFUSED 10.0.1.50:8443');
            spy.mockRestore();
        });

        it('does not pass data arg when data is undefined', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            logger.error('Connection lost');
            expect(spy.mock.calls[0].length).toBe(2); // prefix + message
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

        it('does not log when NODE_ENV is production and DEBUG_MODE is unset', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.DEBUG_MODE;
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            logger.debug('IPC message received: workspace-sync');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('logs when NODE_ENV is development', () => {
            process.env.NODE_ENV = 'development';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            logger.debug('WebSocket message dispatched to handler');
            expect(spy).toHaveBeenCalledOnce();
            const prefix = spy.mock.calls[0][0] as string;
            const message = spy.mock.calls[0][1] as string;
            expect(prefix).toContain('DEBUG');
            expect(prefix).toContain('[Preload]');
            expect(message).toContain('WebSocket message dispatched');
            spy.mockRestore();
        });

        it('logs when DEBUG_MODE is true (even in production)', () => {
            process.env.NODE_ENV = 'production';
            process.env.DEBUG_MODE = 'true';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            logger.debug('Cache miss for domain pattern *.openheaders.io');
            expect(spy).toHaveBeenCalledOnce();
            spy.mockRestore();
        });

        it('does not log when DEBUG_MODE is false', () => {
            process.env.NODE_ENV = 'production';
            process.env.DEBUG_MODE = 'false';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            logger.debug('hidden');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('logs with data when provided in debug mode', () => {
            process.env.NODE_ENV = 'development';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            const data = {
                ruleId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
                domain: '*.openheaders.io',
                matchResult: true
            };

            logger.debug('Domain match result', data);
            expect(spy).toHaveBeenCalledOnce();
            const dataArg = spy.mock.calls[0][2] as string;
            expect(dataArg).toContain('"ruleId"');
            expect(dataArg).toContain('b2c3d4e5-f6a7-8901-bcde-f23456789012');
            spy.mockRestore();
        });

        it('does not pass data arg when data is undefined in debug mode', () => {
            process.env.NODE_ENV = 'development';
            const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
            logger.debug('simple debug message');
            expect(spy.mock.calls[0].length).toBe(2); // prefix + message
            spy.mockRestore();
        });
    });
});
