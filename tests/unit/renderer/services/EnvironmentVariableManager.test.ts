import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnvironmentVariable } from '../../../../src/types/environment';

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

// ---------------------------------------------------------------------------
// Enterprise-realistic factory
// ---------------------------------------------------------------------------

type EnvStore = Record<string, Record<string, EnvironmentVariable>>;

function makeEnterpriseEnvs(): EnvStore {
  return {
    Default: {
      OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false, updatedAt: '2025-11-15T09:30:00.000Z' },
      OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true, updatedAt: '2025-11-15T09:30:00.000Z' },
      API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2', isSecret: false, updatedAt: '2025-11-15T09:30:00.000Z' },
      DATABASE_CONNECTION_STRING: {
        value: 'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require',
        isSecret: true,
        updatedAt: '2026-01-20T14:45:12.345Z',
      },
    },
    'Staging — EU Region': {
      OAUTH2_CLIENT_ID: { value: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901', isSecret: false, updatedAt: '2025-12-01T08:00:00.000Z' },
      API_GATEWAY_URL: { value: 'https://staging-eu.openheaders.io:8443/v2', isSecret: false, updatedAt: '2025-12-01T08:00:00.000Z' },
    },
    Production: {
      OAUTH2_CLIENT_ID: { value: 'oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012', isSecret: false, updatedAt: '2026-01-10T16:30:00.000Z' },
      OAUTH2_CLIENT_SECRET: { value: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi', isSecret: true, updatedAt: '2026-01-10T16:30:00.000Z' },
      REDIS_URL: { value: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0', isSecret: true, updatedAt: '2026-01-10T16:30:00.000Z' },
    },
    'QA — Empty': {},
  };
}

describe('EnvironmentVariableManager', () => {
  let manager: InstanceType<typeof EnvironmentVariableManager>;

  beforeEach(() => {
    manager = new EnvironmentVariableManager();
  });

  // ========================================================================
  // getAllVariables
  // ========================================================================
  describe('getAllVariables', () => {
    it('returns all variable values for enterprise Default environment', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.getAllVariables(envs, 'Default');
      expect(result).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        OAUTH2_CLIENT_SECRET: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        API_GATEWAY_URL: 'https://gateway.openheaders.io:8443/v2',
        DATABASE_CONNECTION_STRING: 'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require',
      });
    });

    it('returns variables from Production with special chars in values', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.getAllVariables(envs, 'Production');
      expect(result).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012',
        OAUTH2_CLIENT_SECRET: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi',
        REDIS_URL: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0',
      });
    });

    it('returns empty object for non-existent environment', () => {
      const result = manager.getAllVariables({}, 'NonExistent');
      expect(result).toEqual({});
    });

    it('returns empty string for variables without value (fallback)', () => {
      const environments = {
        Default: { KEY: { isSecret: false } },
      } as unknown as Parameters<typeof manager.getAllVariables>[0];
      const result = manager.getAllVariables(environments, 'Default');
      expect(result).toEqual({ KEY: '' });
    });

    it('returns empty object for empty environment', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.getAllVariables(envs, 'QA — Empty');
      expect(result).toEqual({});
    });

    it('handles environment name with special characters (em dash, spaces)', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.getAllVariables(envs, 'Staging — EU Region');
      expect(result).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        API_GATEWAY_URL: 'https://staging-eu.openheaders.io:8443/v2',
      });
    });
  });

  // ========================================================================
  // setVariable
  // ========================================================================
  describe('setVariable', () => {
    it('sets a new enterprise variable with full shape', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.setVariable(envs, 'Default', 'STRIPE_WEBHOOK_SECRET', 'whsec_a1b2c3d4e5f6g7h8i9j0');
      expect(result.Default.STRIPE_WEBHOOK_SECRET).toEqual({
        value: 'whsec_a1b2c3d4e5f6g7h8i9j0',
        isSecret: false,
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });

    it('sets a secret variable', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.setVariable(envs, 'Production', 'JWT_SIGNING_KEY', 'rsa-private-key-pem-data', true);
      expect(result.Production.JWT_SIGNING_KEY).toEqual({
        value: 'rsa-private-key-pem-data',
        isSecret: true,
        updatedAt: expect.any(String),
      });
    });

    it('deletes variable when value is null', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.setVariable(envs, 'Default', 'OAUTH2_CLIENT_SECRET', null);
      expect(result.Default.OAUTH2_CLIENT_SECRET).toBeUndefined();
      // Other vars unaffected
      expect(result.Default.OAUTH2_CLIENT_ID.value).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('deletes variable when value is empty string', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.setVariable(envs, 'Production', 'REDIS_URL', '');
      expect(result.Production.REDIS_URL).toBeUndefined();
      expect(result.Production.OAUTH2_CLIENT_ID.value).toBe('oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012');
    });

    it('throws when environment does not exist', () => {
      expect(() =>
        manager.setVariable({}, 'NonExistent', 'KEY', 'value')
      ).toThrow("Environment 'NonExistent' does not exist");
    });

    it('does not mutate original environments', () => {
      const envs = makeEnterpriseEnvs();
      const originalSecret = envs.Default.OAUTH2_CLIENT_SECRET.value;
      const result = manager.setVariable(envs, 'Default', 'OAUTH2_CLIENT_SECRET', 'new-secret');
      expect(envs.Default.OAUTH2_CLIENT_SECRET.value).toBe(originalSecret);
      expect(result.Default.OAUTH2_CLIENT_SECRET.value).toBe('new-secret');
    });

    it('updates existing variable preserving other variables', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.setVariable(envs, 'Default', 'API_GATEWAY_URL', 'https://api-v3.openheaders.io/v3');
      expect(result.Default.API_GATEWAY_URL.value).toBe('https://api-v3.openheaders.io/v3');
      expect(result.Default.OAUTH2_CLIENT_ID.value).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.Default.DATABASE_CONNECTION_STRING.value).toBe(
        'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require'
      );
    });

    it('handles values with special characters (connection strings, equals, ampersands)', () => {
      const envs = { Default: {} } as EnvStore;
      const connStr = 'mongodb+srv://user:P@ss=w0rd!&special@cluster.openheaders.io/db?retryWrites=true&w=majority';
      const result = manager.setVariable(envs, 'Default', 'MONGO_URI', connStr);
      expect(result.Default.MONGO_URI.value).toBe(connStr);
    });
  });

  // ========================================================================
  // createEnvironment
  // ========================================================================
  describe('createEnvironment', () => {
    it('creates a new empty environment preserving all existing ones', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.createEnvironment(envs, 'DR — Disaster Recovery');
      expect(result['DR — Disaster Recovery']).toEqual({});
      expect(Object.keys(result)).toEqual([
        'Default',
        'Staging — EU Region',
        'Production',
        'QA — Empty',
        'DR — Disaster Recovery',
      ]);
    });

    it('throws when environment already exists', () => {
      const envs = makeEnterpriseEnvs();
      expect(() =>
        manager.createEnvironment(envs, 'Production')
      ).toThrow("Environment 'Production' already exists");
    });

    it('does not mutate original environments', () => {
      const envs = makeEnterpriseEnvs();
      const originalKeys = Object.keys(envs);
      const result = manager.createEnvironment(envs, 'New');
      expect(Object.keys(envs)).toEqual(originalKeys);
      expect(Object.keys(result)).toContain('New');
    });
  });

  // ========================================================================
  // deleteEnvironment
  // ========================================================================
  describe('deleteEnvironment', () => {
    it('deletes the specified environment preserving others', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.deleteEnvironment(envs, 'QA — Empty');
      expect(result['QA — Empty']).toBeUndefined();
      expect(Object.keys(result)).toEqual(['Default', 'Staging — EU Region', 'Production']);
    });

    it('throws when trying to delete Default environment', () => {
      expect(() =>
        manager.deleteEnvironment({ Default: {} }, 'Default')
      ).toThrow('Cannot delete Default');
    });

    it('does not mutate original environments', () => {
      const envs = makeEnterpriseEnvs();
      manager.deleteEnvironment(envs, 'Production');
      expect(envs.Production).toBeDefined();
    });

    it('deletes environment with populated variables', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.deleteEnvironment(envs, 'Production');
      expect(result.Production).toBeUndefined();
      expect(result.Default.OAUTH2_CLIENT_ID.value).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  // ========================================================================
  // validateEnvironmentExists
  // ========================================================================
  describe('validateEnvironmentExists', () => {
    it('does not throw for existing environment', () => {
      const envs = makeEnterpriseEnvs();
      expect(() =>
        manager.validateEnvironmentExists(envs, 'Staging — EU Region')
      ).not.toThrow();
    });

    it('throws for non-existing environment with descriptive message', () => {
      expect(() =>
        manager.validateEnvironmentExists({}, 'Missing Environment')
      ).toThrow("Environment 'Missing Environment' does not exist");
    });
  });

  // ========================================================================
  // getVariableCount
  // ========================================================================
  describe('getVariableCount', () => {
    it('returns correct count for populated environment', () => {
      const envs = makeEnterpriseEnvs();
      expect(manager.getVariableCount(envs, 'Default')).toBe(4);
      expect(manager.getVariableCount(envs, 'Production')).toBe(3);
      expect(manager.getVariableCount(envs, 'Staging — EU Region')).toBe(2);
    });

    it('returns 0 for empty environment', () => {
      const envs = makeEnterpriseEnvs();
      expect(manager.getVariableCount(envs, 'QA — Empty')).toBe(0);
    });

    it('returns 0 for non-existent environment', () => {
      expect(manager.getVariableCount({}, 'Missing')).toBe(0);
    });
  });

  // ========================================================================
  // exportEnvironment
  // ========================================================================
  describe('exportEnvironment', () => {
    it('exports as JSON by default with full variable details', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.exportEnvironment(envs, 'Production');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({
        OAUTH2_CLIENT_ID: {
          value: 'oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012',
          isSecret: false,
          updatedAt: '2026-01-10T16:30:00.000Z',
        },
        OAUTH2_CLIENT_SECRET: {
          value: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi',
          isSecret: true,
          updatedAt: '2026-01-10T16:30:00.000Z',
        },
        REDIS_URL: {
          value: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0',
          isSecret: true,
          updatedAt: '2026-01-10T16:30:00.000Z',
        },
      });
    });

    it('exports as .env format preserving special characters', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.exportEnvironment(envs, 'Default', 'env');
      const lines = result.split('\n');
      expect(lines).toContain('OAUTH2_CLIENT_ID=oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(lines).toContain('API_GATEWAY_URL=https://gateway.openheaders.io:8443/v2');
      expect(lines).toContain('DATABASE_CONNECTION_STRING=postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require');
      expect(lines).toHaveLength(4);
    });

    it('exports as shell format with quoted values', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.exportEnvironment(envs, 'Staging — EU Region', 'shell');
      expect(result).toContain('export OAUTH2_CLIENT_ID="oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901"');
      expect(result).toContain('export API_GATEWAY_URL="https://staging-eu.openheaders.io:8443/v2"');
    });

    it('throws on non-existent environment', () => {
      expect(() =>
        manager.exportEnvironment({}, 'Missing')
      ).toThrow("does not exist");
    });

    it('throws on unsupported format', () => {
      const envs = makeEnterpriseEnvs();
      expect(() =>
        manager.exportEnvironment(envs, 'Default', 'xml')
      ).toThrow('Unsupported export format');
    });

    it('handles empty environment export as empty string', () => {
      const envs = makeEnterpriseEnvs();
      const result = manager.exportEnvironment(envs, 'QA — Empty', 'env');
      expect(result).toBe('');
    });
  });

  // ========================================================================
  // importEnvironment
  // ========================================================================
  describe('importEnvironment', () => {
    it('imports JSON with full variable objects preserving all fields', () => {
      const data = JSON.stringify({
        OAUTH2_TOKEN: { value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig', isSecret: true, updatedAt: '2026-01-15T10:00:00.000Z' },
        ENDPOINT: { value: 'https://api.openheaders.io/v2', isSecret: false },
      });
      const result = manager.importEnvironment(data, 'json');
      expect(result.OAUTH2_TOKEN).toEqual({
        value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
        isSecret: true,
        updatedAt: '2026-01-15T10:00:00.000Z',
      });
      expect(result.ENDPOINT.isSecret).toBe(false);
    });

    it('imports JSON with simple key-value pairs (legacy format)', () => {
      const data = JSON.stringify({
        API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        REGION: 'eu-west-1',
        PORT: 8443,
      });
      const result = manager.importEnvironment(data, 'json');
      expect(result.API_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(result.API_KEY.isSecret).toBe(false);
      expect(result.API_KEY.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.PORT.value).toBe('8443');
    });

    it('imports .env format with special characters', () => {
      const data = [
        '# OpenHeaders production config',
        'DATABASE_URL=postgresql://admin:P@ss=w0rd&special@db.openheaders.io:5432/prod',
        'REDIS_URL=rediss://default:r3d!s@redis.openheaders.io:6380/0',
        '',
        'STRIPE_KEY=ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
      ].join('\n');
      const result = manager.importEnvironment(data, 'env');
      expect(result.DATABASE_URL.value).toBe('postgresql://admin:P@ss=w0rd&special@db.openheaders.io:5432/prod');
      expect(result.REDIS_URL.value).toBe('rediss://default:r3d!s@redis.openheaders.io:6380/0');
      expect(result.STRIPE_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('handles .env with equals in values (connection strings, query params)', () => {
      const data = 'CONNECTION=user=admin&pass=secret&host=db.openheaders.io';
      const result = manager.importEnvironment(data, 'env');
      expect(result.CONNECTION.value).toBe('user=admin&pass=secret&host=db.openheaders.io');
    });

    it('skips comments and empty lines in .env format', () => {
      const data = '# This is a comment\n\n  \n  # Another\nKEY=value';
      const result = manager.importEnvironment(data, 'env');
      expect(Object.keys(result)).toEqual(['KEY']);
    });

    it('trims whitespace in .env keys and values', () => {
      const data = '  API_KEY  =  ohk_live_abc123  ';
      const result = manager.importEnvironment(data, 'env');
      expect(result['API_KEY']).toBeDefined();
      expect(result['API_KEY'].value).toBe('ohk_live_abc123');
    });

    it('throws on unsupported format', () => {
      expect(() => manager.importEnvironment('data', 'xml')).toThrow(
        'Unsupported import format'
      );
    });

    it('throws on invalid JSON', () => {
      expect(() => manager.importEnvironment('not json {{{', 'json')).toThrow();
    });

    it('handles .env with empty value', () => {
      const data = 'EMPTY_VAR=\nFILLED_VAR=value';
      const result = manager.importEnvironment(data, 'env');
      expect(result.EMPTY_VAR.value).toBe('');
      expect(result.FILLED_VAR.value).toBe('value');
    });
  });
});
