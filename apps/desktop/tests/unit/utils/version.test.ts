import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  DATA_FORMAT_VERSION,
  isVersionCompatible,
  SUPPORTED_DATA_VERSIONS,
} from '../../../src/config/version';

describe('version config', () => {
  describe('APP_VERSION', () => {
    it('is a string', () => {
      expect(typeof APP_VERSION).toBe('string');
    });

    it('follows semver format', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('DATA_FORMAT_VERSION', () => {
    it('is a string', () => {
      expect(typeof DATA_FORMAT_VERSION).toBe('string');
    });

    it('follows semver format', () => {
      expect(DATA_FORMAT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('SUPPORTED_DATA_VERSIONS', () => {
    it('is an array', () => {
      expect(Array.isArray(SUPPORTED_DATA_VERSIONS)).toBe(true);
    });

    it('contains the current DATA_FORMAT_VERSION', () => {
      expect(SUPPORTED_DATA_VERSIONS).toContain(DATA_FORMAT_VERSION);
    });

    it('all entries follow semver format', () => {
      for (const v of SUPPORTED_DATA_VERSIONS) {
        expect(v).toMatch(/^\d+\.\d+\.\d+$/);
      }
    });

    it('has at least one version', () => {
      expect(SUPPORTED_DATA_VERSIONS.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isVersionCompatible()', () => {
    it('returns true for same major version', () => {
      const major = DATA_FORMAT_VERSION.split('.')[0];
      expect(isVersionCompatible(`${major}.0.0`)).toBe(true);
      expect(isVersionCompatible(`${major}.1.0`)).toBe(true);
      expect(isVersionCompatible(`${major}.99.99`)).toBe(true);
    });

    it('returns false for different major version', () => {
      const major = parseInt(DATA_FORMAT_VERSION.split('.')[0], 10);
      const differentMajor = major + 10;
      expect(isVersionCompatible(`${differentMajor}.0.0`)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isVersionCompatible('')).toBe(false);
    });

    it('returns true for exact current version', () => {
      expect(isVersionCompatible(DATA_FORMAT_VERSION)).toBe(true);
    });
  });

  describe('default export', () => {
    it('has all named exports', async () => {
      const mod = await import('../../../src/config/version');
      expect(typeof mod.default.APP_VERSION).toBe('string');
      expect(typeof mod.default.DATA_FORMAT_VERSION).toBe('string');
      expect(Array.isArray(mod.default.SUPPORTED_DATA_VERSIONS)).toBe(true);
      expect(typeof mod.default.isVersionCompatible).toBe('function');
    });
  });
});

describe('version.esm', () => {
  it('exports matching APP_VERSION', async () => {
    const esm = await import('../../../src/config/version.esm');
    expect(esm.APP_VERSION).toBe(APP_VERSION);
  });

  it('exports matching DATA_FORMAT_VERSION', async () => {
    const esm = await import('../../../src/config/version.esm');
    expect(esm.DATA_FORMAT_VERSION).toBe(DATA_FORMAT_VERSION);
  });

  it('exports matching SUPPORTED_DATA_VERSIONS', async () => {
    const esm = await import('../../../src/config/version.esm');
    expect(esm.SUPPORTED_DATA_VERSIONS).toEqual(SUPPORTED_DATA_VERSIONS);
  });
});
