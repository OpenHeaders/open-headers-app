import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger, setGlobalLogLevel, getLogDirectory, MainLogger } from '../../../src/utils/mainLogger';

describe('mainLogger', () => {
    describe('createLogger()', () => {
        it('returns a MainLogger instance', () => {
            const logger = createLogger('TestComponent');
            expect(logger).toBeInstanceOf(MainLogger);
        });

        it('stores the component name', () => {
            const logger = createLogger('MyService');
            expect(logger.component).toBe('MyService');
        });
    });

    describe('MainLogger.formatMessage()', () => {
        it('wraps message with component name in brackets', () => {
            const logger = createLogger('ProxyService');
            expect(logger.formatMessage('starting up')).toBe('[ProxyService] starting up');
        });

        it('handles empty message', () => {
            const logger = createLogger('App');
            expect(logger.formatMessage('')).toBe('[App] ');
        });

        it('handles message with special characters', () => {
            const logger = createLogger('Net');
            expect(logger.formatMessage('url=https://example.com?a=1&b=2')).toBe('[Net] url=https://example.com?a=1&b=2');
        });
    });

    describe('log level methods', () => {
        let logger: MainLogger;

        beforeEach(() => {
            logger = createLogger('Test');
        });

        it('has debug method', () => {
            expect(typeof logger.debug).toBe('function');
        });

        it('has info method', () => {
            expect(typeof logger.info).toBe('function');
        });

        it('has warn method', () => {
            expect(typeof logger.warn).toBe('function');
        });

        it('has error method', () => {
            expect(typeof logger.error).toBe('function');
        });

        it('debug accepts message and optional data', () => {
            // Should not throw
            logger.debug('test message');
            logger.debug('test message', { key: 'value' });
        });

        it('info accepts message and optional data', () => {
            logger.info('test message');
            logger.info('test message', { key: 'value' });
        });

        it('warn accepts message and optional data', () => {
            logger.warn('test message');
            logger.warn('test message', { key: 'value' });
        });

        it('error accepts message and optional data', () => {
            logger.error('test message');
            logger.error('test message', { key: 'value' });
        });
    });

    describe('setDebugMode()', () => {
        it('exists on logger instances', () => {
            const logger = createLogger('Test');
            expect(typeof logger.setDebugMode).toBe('function');
        });

        it('can be called without errors', () => {
            const logger = createLogger('Test');
            expect(() => logger.setDebugMode(true)).not.toThrow();
            expect(() => logger.setDebugMode(false)).not.toThrow();
        });
    });

    describe('setGlobalLogLevel()', () => {
        it('accepts valid log levels without error', () => {
            expect(() => setGlobalLogLevel('error')).not.toThrow();
            expect(() => setGlobalLogLevel('warn')).not.toThrow();
            expect(() => setGlobalLogLevel('info')).not.toThrow();
            expect(() => setGlobalLogLevel('debug')).not.toThrow();
        });

        it('ignores invalid log levels', () => {
            expect(() => setGlobalLogLevel('invalid_level')).not.toThrow();
        });

        it('accepts skipRotation parameter', () => {
            expect(() => setGlobalLogLevel('info', true)).not.toThrow();
            expect(() => setGlobalLogLevel('debug', false)).not.toThrow();
        });
    });

    describe('getLogDirectory()', () => {
        it('returns a string', () => {
            const dir = getLogDirectory();
            expect(typeof dir).toBe('string');
        });
    });

    describe('module exports', () => {
        it('exports createLogger function', () => {
            expect(typeof createLogger).toBe('function');
        });

        it('exports setGlobalLogLevel function', () => {
            expect(typeof setGlobalLogLevel).toBe('function');
        });

        it('exports getLogDirectory function', () => {
            expect(typeof getLogDirectory).toBe('function');
        });

        it('default export has same shape as named exports', async () => {
            const mod = await import('../../../src/utils/mainLogger');
            expect(typeof mod.default.createLogger).toBe('function');
            expect(typeof mod.default.setGlobalLogLevel).toBe('function');
            expect(typeof mod.default.getLogDirectory).toBe('function');
        });
    });
});
