import { beforeEach, describe, expect, it } from 'vitest';
import { createLogger, getLogDirectory, MainLogger, setGlobalLogLevel } from '@/utils/mainLogger';

describe('mainLogger', () => {
  describe('createLogger()', () => {
    it('returns a MainLogger instance', () => {
      const logger = createLogger('TestComponent');
      expect(logger).toBeInstanceOf(MainLogger);
    });

    it('stores the component name', () => {
      const logger = createLogger('WorkspaceSyncScheduler');
      expect(logger.component).toBe('WorkspaceSyncScheduler');
    });
  });

  describe('log level methods', () => {
    let logger: MainLogger;

    beforeEach(() => {
      logger = createLogger('OpenHeaders-Test');
    });

    it('has all four log level methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('debug accepts message and optional data', () => {
      logger.debug('Checking DNS for *.openheaders.io');
      logger.debug('DNS result', { host: 'auth.openheaders.io', ips: ['34.120.55.100'] });
    });

    it('info accepts message and optional data', () => {
      logger.info('Workspace sync started for Production — Staging Environment');
      logger.info('Sync complete', { sourceCount: 50, ruleCount: 30 });
    });

    it('warn accepts message and optional data', () => {
      logger.warn('VPN state changed — network check may be unreliable');
      logger.warn('Rate limit approaching', { remaining: 10, resetAt: '2026-01-20T14:45:12.345Z' });
    });

    it('error accepts message and optional data', () => {
      logger.error('Failed to sync workspace a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      logger.error('Git clone failed', { url: 'https://gitlab.openheaders.io/platform/shared-headers.git', code: 128 });
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
      expect(() => setGlobalLogLevel('verbose')).not.toThrow();
      expect(() => setGlobalLogLevel('')).not.toThrow();
    });

    it('can be called multiple times without error', () => {
      expect(() => setGlobalLogLevel('debug')).not.toThrow();
      expect(() => setGlobalLogLevel('info')).not.toThrow();
    });
  });

  describe('getLogDirectory()', () => {
    it('returns a non-empty string', () => {
      const dir = getLogDirectory();
      expect(typeof dir).toBe('string');
      expect(dir.length).toBeGreaterThan(0);
    });
  });

  describe('module exports', () => {
    it('exports all expected functions', () => {
      expect(typeof createLogger).toBe('function');
      expect(typeof setGlobalLogLevel).toBe('function');
      expect(typeof getLogDirectory).toBe('function');
    });

    it('default export has same shape as named exports', async () => {
      const mod = await import('../../../src/utils/mainLogger');
      expect(typeof mod.default.createLogger).toBe('function');
      expect(typeof mod.default.setGlobalLogLevel).toBe('function');
      expect(typeof mod.default.getLogDirectory).toBe('function');
    });

    it('exports MainLogger class', () => {
      expect(MainLogger).toBeDefined();
      const instance = new MainLogger('TestExport');
      expect(instance.component).toBe('TestExport');
    });
  });
});
