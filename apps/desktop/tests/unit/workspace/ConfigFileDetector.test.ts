import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/test' } },
  app: { getPath: () => '/tmp/test' },
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { ConfigFileDetector } from '../../../src/services/workspace/ConfigFileDetector';

type ConfigData = Parameters<ConfigFileDetector['detectFileType']>[0];

function makeConfigData(overrides: Record<string, unknown>): ConfigData {
  return overrides as ConfigData;
}

describe('ConfigFileDetector', () => {
  let detector: ConfigFileDetector;

  beforeEach(() => {
    detector = new ConfigFileDetector();
  });

  describe('matchPattern()', () => {
    it('matches wildcard * pattern', () => {
      expect(detector.matchPattern('anything', '*')).toBe(true);
    });

    it('matches partial wildcard prefix', () => {
      expect(detector.matchPattern('test-config', 'test-*')).toBe(true);
      expect(detector.matchPattern('other-config', 'test-*')).toBe(false);
    });

    it('matches partial wildcard suffix', () => {
      expect(detector.matchPattern('my-config', '*-config')).toBe(true);
      expect(detector.matchPattern('my-settings', '*-config')).toBe(false);
    });

    it('matches ? as single character wildcard', () => {
      expect(detector.matchPattern('a', '?')).toBe(true);
      expect(detector.matchPattern('ab', '?')).toBe(false);
    });

    it('matches exact name (no wildcards)', () => {
      expect(detector.matchPattern('config', 'config')).toBe(true);
      expect(detector.matchPattern('other', 'config')).toBe(false);
    });
  });

  describe('detectFileType()', () => {
    it('detects workspace-metadata type', () => {
      const data = {
        workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        workspaceName: 'OpenHeaders Staging Environment',
      };
      expect(detector.detectFileType(data, 'metadata.json')).toBe('workspace-metadata');
    });

    it('detects headers type', () => {
      const data = { headers: [{ name: 'Authorization', value: 'Bearer eyJhbGciOiJSUzI1NiJ9' }] };
      expect(detector.detectFileType(data, 'config.json')).toBe('headers');
    });

    it('detects environments type', () => {
      expect(detector.detectFileType(makeConfigData({ environments: [{ name: 'Production' }] }), 'envs.json')).toBe(
        'environments',
      );
    });

    it('detects proxy type when path contains "proxy"', () => {
      expect(
        detector.detectFileType(makeConfigData({ rules: [{ pattern: '*.openheaders.io' }] }), 'proxy/rules.json'),
      ).toBe('proxy');
    });

    it('detects rules type for rules array without "proxy" in path', () => {
      expect(
        detector.detectFileType(makeConfigData({ rules: [{ pattern: '*.openheaders.io' }] }), 'config/rules.json'),
      ).toBe('rules');
    });

    it('detects combined type', () => {
      expect(
        detector.detectFileType(
          makeConfigData({ sources: [{ url: 'https://auth.openheaders.io/oauth2/token' }] }),
          'config.json',
        ),
      ).toBe('combined');
    });

    it('detects combined type with proxy field', () => {
      const data = { proxy: { rules: [] } };
      expect(detector.detectFileType(data, 'config.json')).toBe('combined');
    });

    it('returns unknown for unrecognized data', () => {
      expect(detector.detectFileType(makeConfigData({ foo: 'bar' }), 'config.json')).toBe('unknown');
    });

    it('prioritizes workspace-metadata over other types', () => {
      const data = { workspaceId: 'ws-staging', workspaceName: 'OpenHeaders Staging', headers: [] };
      expect(detector.detectFileType(data, 'config.json')).toBe('workspace-metadata');
    });
  });

  describe('validateDetectedFiles()', () => {
    it('returns valid for workspace-metadata file', () => {
      const files = [{ path: '/a', relativePath: 'a', type: 'workspace-metadata', valid: true }];
      const result = detector.validateDetectedFiles(files);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for combined file', () => {
      const files = [{ path: '/a', relativePath: 'a', type: 'combined', valid: true }];
      const result = detector.validateDetectedFiles(files);
      expect(result.valid).toBe(true);
    });

    it('warns when no metadata or combined config', () => {
      const files = [{ path: '/a', relativePath: 'a', type: 'headers', valid: true }];
      const result = detector.validateDetectedFiles(files);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('No workspace metadata'))).toBe(true);
    });

    it('returns invalid when files have errors', () => {
      const files = [{ path: '/a', relativePath: 'a.json', type: 'unknown', valid: false, error: 'parse error' }];
      const result = detector.validateDetectedFiles(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('a.json') && e.includes('parse error'))).toBe(true);
    });

    it('handles empty file list', () => {
      const result = detector.validateDetectedFiles([]);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
