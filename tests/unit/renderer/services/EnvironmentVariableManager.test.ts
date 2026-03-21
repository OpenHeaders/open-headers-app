import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const EnvironmentVariableManager = (
  await import('../../../../src/renderer/services/environment/EnvironmentVariableManager')
).default;

describe('EnvironmentVariableManager', () => {
  let manager: InstanceType<typeof EnvironmentVariableManager>;

  beforeEach(() => {
    manager = new EnvironmentVariableManager();
  });

  // ========================================================================
  // getAllVariables
  // ========================================================================
  describe('getAllVariables', () => {
    it('returns variables for the active environment', () => {
      const environments = {
        Default: {
          API_KEY: { value: 'abc123', isSecret: true },
          HOST: { value: 'example.com', isSecret: false },
        },
      };
      const result = manager.getAllVariables(environments, 'Default');
      expect(result).toEqual({ API_KEY: 'abc123', HOST: 'example.com' });
    });

    it('returns empty object for non-existent environment', () => {
      const result = manager.getAllVariables({}, 'NonExistent');
      expect(result).toEqual({});
    });

    it('returns empty string for variables without value', () => {
      // Intentionally omitting `value` to test the ?? '' fallback
      const environments = {
        Default: { KEY: { isSecret: false } },
      } as unknown as Parameters<typeof manager.getAllVariables>[0];
      const result = manager.getAllVariables(environments, 'Default');
      expect(result).toEqual({ KEY: '' });
    });

    it('returns empty object for empty environment', () => {
      const environments = { Default: {} };
      const result = manager.getAllVariables(environments, 'Default');
      expect(result).toEqual({});
    });
  });

  // ========================================================================
  // setVariable
  // ========================================================================
  describe('setVariable', () => {
    it('sets a new variable', () => {
      const environments = { Default: {} };
      const result = manager.setVariable(environments, 'Default', 'KEY', 'value');
      expect(result.Default.KEY.value).toBe('value');
      expect(result.Default.KEY.isSecret).toBe(false);
      expect(result.Default.KEY.updatedAt).toBeDefined();
    });

    it('sets a secret variable', () => {
      const environments = { Default: {} };
      const result = manager.setVariable(environments, 'Default', 'TOKEN', 'secret', true);
      expect(result.Default.TOKEN.isSecret).toBe(true);
    });

    it('deletes variable when value is null', () => {
      const environments = {
        Default: { KEY: { value: 'old', isSecret: false } },
      };
      const result = manager.setVariable(environments, 'Default', 'KEY', null);
      expect(result.Default.KEY).toBeUndefined();
    });

    it('deletes variable when value is empty string', () => {
      const environments = {
        Default: { KEY: { value: 'old', isSecret: false } },
      };
      const result = manager.setVariable(environments, 'Default', 'KEY', '');
      expect(result.Default.KEY).toBeUndefined();
    });

    it('throws when environment does not exist', () => {
      expect(() =>
        manager.setVariable({}, 'NonExistent', 'KEY', 'value')
      ).toThrow("Environment 'NonExistent' does not exist");
    });

    it('does not mutate original environments', () => {
      const environments = { Default: { KEY: { value: 'old', isSecret: false } } };
      const result = manager.setVariable(environments, 'Default', 'KEY', 'new');
      expect(environments.Default.KEY.value).toBe('old');
      expect(result.Default.KEY.value).toBe('new');
    });

    it('updates existing variable value', () => {
      const environments = {
        Default: { KEY: { value: 'old', isSecret: false, updatedAt: '2024-01-01' } },
      };
      const result = manager.setVariable(environments, 'Default', 'KEY', 'new');
      expect(result.Default.KEY.value).toBe('new');
    });
  });

  // ========================================================================
  // createEnvironment
  // ========================================================================
  describe('createEnvironment', () => {
    it('creates a new empty environment', () => {
      const environments = { Default: {} };
      const result = manager.createEnvironment(environments, 'Production');
      expect(result.Production).toEqual({});
      expect(result.Default).toEqual({});
    });

    it('throws when environment already exists', () => {
      const environments = { Default: {} };
      expect(() =>
        manager.createEnvironment(environments, 'Default')
      ).toThrow("already exists");
    });

    it('does not mutate original environments', () => {
      const environments = { Default: {} };
      const result = manager.createEnvironment(environments, 'New');
      expect(Object.keys(environments)).toEqual(['Default']);
      expect(Object.keys(result)).toEqual(['Default', 'New']);
    });
  });

  // ========================================================================
  // deleteEnvironment
  // ========================================================================
  describe('deleteEnvironment', () => {
    it('deletes the specified environment', () => {
      const environments = { Default: {}, Staging: {} };
      const result = manager.deleteEnvironment(environments, 'Staging');
      expect(result.Staging).toBeUndefined();
      expect(result.Default).toBeDefined();
    });

    it('throws when trying to delete Default environment', () => {
      expect(() =>
        manager.deleteEnvironment({ Default: {} }, 'Default')
      ).toThrow('Cannot delete Default');
    });

    it('does not mutate original environments', () => {
      const environments = { Default: {}, Staging: {} };
      manager.deleteEnvironment(environments, 'Staging');
      expect(environments.Staging).toBeDefined();
    });
  });

  // ========================================================================
  // validateEnvironmentExists
  // ========================================================================
  describe('validateEnvironmentExists', () => {
    it('does not throw for existing environment', () => {
      expect(() =>
        manager.validateEnvironmentExists({ Default: {} }, 'Default')
      ).not.toThrow();
    });

    it('throws for non-existing environment', () => {
      expect(() =>
        manager.validateEnvironmentExists({}, 'Missing')
      ).toThrow("does not exist");
    });
  });

  // ========================================================================
  // getVariableCount
  // ========================================================================
  describe('getVariableCount', () => {
    it('returns count of variables', () => {
      const environments = {
        Default: { A: { value: '1', isSecret: false }, B: { value: '2', isSecret: false } },
      };
      expect(manager.getVariableCount(environments, 'Default')).toBe(2);
    });

    it('returns 0 for empty environment', () => {
      expect(manager.getVariableCount({ Default: {} }, 'Default')).toBe(0);
    });

    it('returns 0 for non-existent environment', () => {
      expect(manager.getVariableCount({}, 'Missing')).toBe(0);
    });
  });

  // ========================================================================
  // exportEnvironment
  // ========================================================================
  describe('exportEnvironment', () => {
    const environments = {
      Default: {
        API_KEY: { value: 'abc123', isSecret: true, updatedAt: '2024-01-01' },
        HOST: { value: 'example.com', isSecret: false, updatedAt: '2024-01-01' },
      },
    };

    it('exports as JSON by default', () => {
      const result = manager.exportEnvironment(environments, 'Default');
      const parsed = JSON.parse(result);
      expect(parsed.API_KEY.value).toBe('abc123');
      expect(parsed.HOST.value).toBe('example.com');
    });

    it('exports as .env format', () => {
      const result = manager.exportEnvironment(environments, 'Default', 'env');
      expect(result).toContain('API_KEY=abc123');
      expect(result).toContain('HOST=example.com');
    });

    it('exports as shell format', () => {
      const result = manager.exportEnvironment(environments, 'Default', 'shell');
      expect(result).toContain('export API_KEY="abc123"');
      expect(result).toContain('export HOST="example.com"');
    });

    it('throws on non-existent environment', () => {
      expect(() =>
        manager.exportEnvironment({}, 'Missing')
      ).toThrow("does not exist");
    });

    it('throws on unsupported format', () => {
      expect(() =>
        manager.exportEnvironment(environments, 'Default', 'xml')
      ).toThrow('Unsupported export format');
    });

    it('handles empty environment export', () => {
      const envs = { Default: {} };
      const result = manager.exportEnvironment(envs, 'Default', 'env');
      expect(result).toBe('');
    });
  });

  // ========================================================================
  // importEnvironment
  // ========================================================================
  describe('importEnvironment', () => {
    it('imports JSON with variable objects', () => {
      const data = JSON.stringify({
        KEY: { value: 'val', isSecret: false, updatedAt: '2024-01-01' },
      });
      const result = manager.importEnvironment(data, 'json');
      expect(result.KEY.value).toBe('val');
      expect(result.KEY.isSecret).toBe(false);
    });

    it('imports JSON with simple key-value pairs', () => {
      const data = JSON.stringify({ KEY: 'simple-value', NUM: 42 });
      const result = manager.importEnvironment(data, 'json');
      expect(result.KEY.value).toBe('simple-value');
      expect(result.KEY.isSecret).toBe(false);
      expect(result.NUM.value).toBe('42');
    });

    it('imports .env format', () => {
      const data = 'API_KEY=abc123\nHOST=example.com';
      const result = manager.importEnvironment(data, 'env');
      expect(result.API_KEY.value).toBe('abc123');
      expect(result.HOST.value).toBe('example.com');
    });

    it('handles .env with equals in value', () => {
      const data = 'CONNECTION=user=admin&pass=secret';
      const result = manager.importEnvironment(data, 'env');
      expect(result.CONNECTION.value).toBe('user=admin&pass=secret');
    });

    it('skips comments in .env format', () => {
      const data = '# This is a comment\nKEY=value';
      const result = manager.importEnvironment(data, 'env');
      expect(Object.keys(result)).toEqual(['KEY']);
    });

    it('skips empty lines in .env format', () => {
      const data = 'KEY1=val1\n\n\nKEY2=val2';
      const result = manager.importEnvironment(data, 'env');
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('trims whitespace in .env keys and values', () => {
      const data = '  KEY  =  value  ';
      const result = manager.importEnvironment(data, 'env');
      expect(result['KEY']).toBeDefined();
      expect(result['KEY'].value).toBe('value');
    });

    it('throws on unsupported format', () => {
      expect(() => manager.importEnvironment('data', 'xml')).toThrow(
        'Unsupported import format'
      );
    });

    it('throws on invalid JSON', () => {
      expect(() => manager.importEnvironment('not json', 'json')).toThrow();
    });
  });
});
