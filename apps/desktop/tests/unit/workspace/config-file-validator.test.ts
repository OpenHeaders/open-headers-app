import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron before importing the module
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

// Mock config/version
vi.mock('../../../src/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
}));

import { ConfigFileValidator } from '@/services/workspace/config-file-validator';

describe('ConfigFileValidator', () => {
  let validator: ConfigFileValidator;

  beforeEach(() => {
    validator = new ConfigFileValidator();
  });

  describe('validateAgainstSchema()', () => {
    it('passes valid headers config', () => {
      const content = { version: '3.0.0', headers: [{ name: 'X-Test', value: 'val' }] };
      const schema = {
        version: { type: 'string', required: true },
        headers: { type: 'array', required: true },
      };
      const result = validator.validateAgainstSchema(content, schema, 'headers');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when required field is missing', () => {
      const content = { headers: [] };
      const schema = {
        version: { type: 'string', required: true },
        headers: { type: 'array', required: true },
      };
      const result = validator.validateAgainstSchema(content, schema, 'headers');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: version');
    });

    it('fails when field has wrong type', () => {
      const content = { version: 123, headers: [] };
      const schema = {
        version: { type: 'string', required: true },
        headers: { type: 'array', required: true },
      };
      const result = validator.validateAgainstSchema(content, schema, 'headers');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('type string, got number'))).toBe(true);
    });
  });

  describe('validateField()', () => {
    it('validates type mismatch', () => {
      const errors = validator.validateField('version', 42, { type: 'string', required: true });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be of type string');
    });

    it('accepts correct type', () => {
      const errors = validator.validateField('version', 'v1', { type: 'string', required: true });
      expect(errors).toHaveLength(0);
    });

    it('validates array type correctly', () => {
      const errors = validator.validateField('items', [1, 2], { type: 'array', required: true });
      expect(errors).toHaveLength(0);
    });

    it('distinguishes array from object type', () => {
      const errors = validator.validateField('items', { a: 1 }, { type: 'array', required: true });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('must be of type array');
    });

    it('validates string minLength', () => {
      const errors = validator.validateField('name', 'ab', {
        type: 'string',
        required: true,
        minLength: 3,
      });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('at least 3 characters');
    });

    it('validates string pattern', () => {
      const errors = validator.validateField('version', 'abc', {
        type: 'string',
        required: true,
        pattern: '^\\d+\\.\\d+\\.\\d+$',
      });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('does not match required pattern');
    });

    it('validates array minLength', () => {
      const errors = validator.validateField('items', [], {
        type: 'array',
        required: true,
        minLength: 1,
      });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('at least 1 items');
    });

    it('validates array maxLength', () => {
      const errors = validator.validateField('items', [1, 2, 3], {
        type: 'array',
        required: true,
        maxLength: 2,
      });
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('at most 2 items');
    });
  });

  describe('validateTypeSpecific()', () => {
    it('detects missing header name', () => {
      const result = validator.validateTypeSpecific({ headers: [{ value: 'x' }] }, 'headers');
      expect(result.errors).toContain("Header at index 0 missing 'name' field");
    });

    it('detects missing header value (not empty string)', () => {
      const result = validator.validateTypeSpecific({ headers: [{ name: 'X-Test' }] }, 'headers');
      expect(result.errors).toContain("Header at index 0 missing 'value' field");
    });

    it('allows header with empty string value', () => {
      const result = validator.validateTypeSpecific({ headers: [{ name: 'X-Test', value: '' }] }, 'headers');
      expect(result.errors).toHaveLength(0);
    });

    it('detects duplicate environment names', () => {
      const result = validator.validateTypeSpecific(
        { environments: [{ name: 'prod' }, { name: 'prod' }] },
        'environments',
      );
      expect(result.errors).toContain('Duplicate environment name: prod');
    });

    it('detects missing environment name', () => {
      const result = validator.validateTypeSpecific({ environments: [{}] }, 'environments');
      expect(result.errors).toContain("Environment at index 0 missing 'name' field");
    });

    it('detects proxy rule missing pattern and url', () => {
      const result = validator.validateTypeSpecific({ rules: [{ target: 'http://target' }] }, 'proxy');
      expect(result.errors).toContain("Proxy rule at index 0 must have either 'pattern' or 'url'");
    });

    it('detects proxy rule missing target', () => {
      const result = validator.validateTypeSpecific({ rules: [{ pattern: '*.example.com' }] }, 'proxy');
      expect(result.errors).toContain("Proxy rule at index 0 missing 'target' field");
    });

    it('validates metadata workspace ID format', () => {
      const result = validator.validateTypeSpecific(
        { workspaceId: 'invalid id!', workspaceName: 'Test', version: '1.0.0', createdAt: '' },
        'metadata',
      );
      expect(result.errors).toContain('Invalid workspaceId format');
    });

    it('accepts valid metadata workspace ID', () => {
      const result = validator.validateTypeSpecific(
        { workspaceId: 'my-workspace_1', workspaceName: 'Test', version: '1.0.0', createdAt: '' },
        'metadata',
      );
      expect(result.errors).toHaveLength(0);
    });

    it('warns on non-semver version in metadata', () => {
      const result = validator.validateTypeSpecific(
        { workspaceId: 'test', workspaceName: 'Test', version: 'v1', createdAt: '' },
        'metadata',
      );
      expect(result.warnings.some((w) => w.includes('semver'))).toBe(true);
    });
  });

  describe('createDefaultConfig()', () => {
    it('creates default headers config', () => {
      const config = validator.createDefaultConfig('headers');
      expect(config.version).toBe('3.0.0');
      expect(config.headers).toEqual([]);
    });

    it('creates default environments config', () => {
      const config = validator.createDefaultConfig('environments');
      expect(config.version).toBe('3.0.0');
      expect(config.environments).toEqual([]);
    });

    it('creates default metadata config with custom workspace info', () => {
      const config = validator.createDefaultConfig('metadata', {
        workspaceId: 'ws-1',
        workspaceName: 'My Team',
      });
      expect(config.workspaceId).toBe('ws-1');
      expect(config.workspaceName).toBe('My Team');
    });

    it('falls back for unknown type', () => {
      const config = validator.createDefaultConfig('unknown');
      expect(config.version).toBe('3.0.0');
    });
  });

  describe('mergeConfigs()', () => {
    it('returns override when base is null', () => {
      const override = { version: '1.0.0', headers: [] };
      const result = validator.mergeConfigs(null, override, 'headers');
      expect(result).toBe(override);
    });

    it('returns base when override is null', () => {
      const base = { version: '1.0.0', headers: [] };
      const result = validator.mergeConfigs(base, null, 'headers');
      expect(result).toBe(base);
    });

    it('returns default when both are null', () => {
      const result = validator.mergeConfigs(null, null, 'headers');
      expect(result.version).toBe('3.0.0');
    });

    it('override version takes precedence', () => {
      const base = { version: '1.0.0', headers: [] };
      const override = { version: '2.0.0', headers: [] };
      const result = validator.mergeConfigs(base, override, 'headers');
      expect(result.version).toBe('2.0.0');
    });

    it('concatenates header arrays', () => {
      const base = { version: '1.0.0', headers: [{ name: 'A', value: '1' }] };
      const override = { version: '1.0.0', headers: [{ name: 'B', value: '2' }] };
      const result = validator.mergeConfigs(base, override, 'headers');
      expect(result.headers).toHaveLength(2);
    });

    it('merges environments by name', () => {
      const base = { version: '1.0.0', environments: [{ name: 'prod' }, { name: 'dev' }] };
      const override = { version: '1.0.0', environments: [{ name: 'prod', url: 'new' }] };
      const result = validator.mergeConfigs(base, override, 'environments');
      const envs = result.environments as Array<Record<string, unknown>>;
      expect(envs).toHaveLength(2);
      expect(envs.find((e) => e.name === 'prod')).toHaveProperty('url', 'new');
    });

    it('replaces proxy rules entirely', () => {
      const base = { version: '1.0.0', rules: [{ pattern: 'a', target: 'b' }] };
      const override = { version: '1.0.0', rules: [{ pattern: 'c', target: 'd' }] };
      const result = validator.mergeConfigs(base, override, 'proxy');
      const rules = result.rules as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);
      expect(rules[0].pattern).toBe('c');
    });

    it('deep merges metadata configPaths', () => {
      const base = { version: '1.0.0', configPaths: { headers: '/a' } };
      const override = { version: '1.0.0', configPaths: { rules: '/b' } };
      const result = validator.mergeConfigs(base, override, 'metadata');
      expect(result.configPaths).toEqual({ headers: '/a', rules: '/b' });
    });
  });
});
