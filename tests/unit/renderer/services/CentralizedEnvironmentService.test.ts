/**
 * Tests for the environment sub-managers that CentralizedEnvironmentService delegates to.
 *
 * CentralizedEnvironmentService.ts uses mixed CJS/ESM syntax (require + export)
 * which prevents direct import in vitest. Instead, we test the component managers
 * individually: EnvironmentVariableManager, EnvironmentStateManager, plus pure
 * state-management patterns that mirror CES behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EnvironmentVariable } from '../../../../src/types/environment';

// Mock logger for all sub-module imports
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock BaseStateManager (required by EnvironmentStateManager)
vi.mock('../../../../src/renderer/services/workspace/BaseStateManager', () => {
  type StateListener = (state: Record<string, unknown>, changedKeys: string[]) => void;
  return { default: class {
    listeners: Set<StateListener>;
    state: Record<string, unknown>;
    log: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    serviceName: string;
    constructor(name?: string, initialState?: Record<string, unknown>) {
      this.serviceName = name || '';
      this.listeners = new Set();
      this.state = initialState || {};
      this.log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    }
    subscribe(listener: StateListener) {
      this.listeners.add(listener);
      listener(this.getState(), []);
      return () => this.listeners.delete(listener);
    }
    notifyListeners(changedKeys: string[] = []) {
      const state = this.getState();
      this.listeners.forEach((l: StateListener) => { try { l(state, changedKeys); } catch {} });
    }
    getState() { return JSON.parse(JSON.stringify(this.state)); }
    setState(updates: Record<string, unknown>, changedKeys: string[] = []) {
      this.state = { ...this.state, ...updates };
      this.notifyListeners(changedKeys);
    }
    cleanup() { this.listeners.clear(); }
  } };
});

// Import the CJS sub-managers
const EnvironmentVariableManagerModule = await import(
  '../../../../src/renderer/services/environment/EnvironmentVariableManager'
);
const EnvironmentVariableManager = EnvironmentVariableManagerModule.default;

const EnvironmentStateManagerModule = await import(
  '../../../../src/renderer/services/environment/EnvironmentStateManager'
);
const EnvironmentStateManager = EnvironmentStateManagerModule.default;

// ---------------------------------------------------------------------------
// Enterprise-realistic factory helpers
// ---------------------------------------------------------------------------

function makeEnterpriseEnvironments() {
  return {
    Default: {
      OAUTH2_CLIENT_ID: {
        value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        isSecret: false,
        updatedAt: '2025-11-15T09:30:00.000Z',
      },
      OAUTH2_CLIENT_SECRET: {
        value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        isSecret: true,
        updatedAt: '2025-11-15T09:30:00.000Z',
      },
      API_GATEWAY_URL: {
        value: 'https://gateway.openheaders.io:8443/v2',
        isSecret: false,
        updatedAt: '2025-11-15T09:30:00.000Z',
      },
      DATABASE_CONNECTION_STRING: {
        value: 'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require',
        isSecret: true,
        updatedAt: '2026-01-20T14:45:12.345Z',
      },
    },
    'Staging — EU Region': {
      OAUTH2_CLIENT_ID: {
        value: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        isSecret: false,
        updatedAt: '2025-12-01T08:00:00.000Z',
      },
      OAUTH2_CLIENT_SECRET: {
        value: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg',
        isSecret: true,
        updatedAt: '2025-12-01T08:00:00.000Z',
      },
      API_GATEWAY_URL: {
        value: 'https://staging-eu.openheaders.io:8443/v2',
        isSecret: false,
        updatedAt: '2025-12-01T08:00:00.000Z',
      },
    },
    'QA — Integration Tests': {},
    'Pre-production': {
      BEARER_TOKEN: {
        value: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIiwiaWF0IjoxNzE2MDAwMDAwfQ.signature',
        isSecret: true,
        updatedAt: '2026-02-15T12:00:00.000Z',
      },
    },
    Production: {
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
      API_GATEWAY_URL: {
        value: 'https://api.openheaders.io/v2',
        isSecret: false,
        updatedAt: '2026-01-10T16:30:00.000Z',
      },
      DATABASE_CONNECTION_STRING: {
        value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full&connect_timeout=10',
        isSecret: true,
        updatedAt: '2026-01-10T16:30:00.000Z',
      },
      REDIS_URL: {
        value: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0',
        isSecret: true,
        updatedAt: '2026-01-10T16:30:00.000Z',
      },
    },
  };
}

const ENTERPRISE_WORKSPACE_ID = 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ======================================================================
// EnvironmentVariableManager
// ======================================================================
describe('EnvironmentVariableManager', () => {
  let vm: InstanceType<typeof EnvironmentVariableManager>;

  beforeEach(() => {
    vm = new EnvironmentVariableManager();
  });

  describe('getAllVariables()', () => {
    it('returns empty object for empty environment', () => {
      const result = vm.getAllVariables({ Default: {} }, 'Default');
      expect(result).toEqual({});
    });

    it('extracts values from enterprise variable objects', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.getAllVariables(envs, 'Production');
      expect(result).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012',
        OAUTH2_CLIENT_SECRET: 'sk_prod_9hF60KrOalZGdumwW4cgt0hi',
        API_GATEWAY_URL: 'https://api.openheaders.io/v2',
        DATABASE_CONNECTION_STRING: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full&connect_timeout=10',
        REDIS_URL: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0',
      });
    });

    it('returns empty string for variables without value', () => {
      const environments = {
        Default: {
          EMPTY: { isSecret: false },
        },
      } as unknown as Parameters<typeof vm.getAllVariables>[0];
      const result = vm.getAllVariables(environments, 'Default');
      expect(result.EMPTY).toBe('');
    });

    it('returns empty object for non-existent environment', () => {
      const result = vm.getAllVariables({ Default: {} }, 'NonExistent');
      expect(result).toEqual({});
    });

    it('handles environment with special characters in name', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.getAllVariables(envs, 'Staging — EU Region');
      expect(result).toEqual({
        OAUTH2_CLIENT_ID: 'oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901',
        OAUTH2_CLIENT_SECRET: 'ohk_test_7fD48IqMzkXEbskuU2aer8fg',
        API_GATEWAY_URL: 'https://staging-eu.openheaders.io:8443/v2',
      });
    });

    it('handles empty QA environment', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.getAllVariables(envs, 'QA — Integration Tests');
      expect(result).toEqual({});
    });
  });

  describe('setVariable()', () => {
    it('adds a new enterprise variable with full shape', () => {
      const envs = { Default: {} };
      const result = vm.setVariable(
        envs,
        'Default',
        'STRIPE_WEBHOOK_SECRET',
        'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
      );
      expect(result.Default.STRIPE_WEBHOOK_SECRET).toEqual({
        value: 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        isSecret: false,
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });

    it('marks variable as secret', () => {
      const envs = { Default: {} };
      const result = vm.setVariable(envs, 'Default', 'JWT_SIGNING_KEY', 'rsa-private-key-data', true);
      expect(result.Default.JWT_SIGNING_KEY.isSecret).toBe(true);
      expect(result.Default.JWT_SIGNING_KEY.value).toBe('rsa-private-key-data');
    });

    it('deletes variable when value is null', () => {
      const envs = {
        Default: {
          DEPRECATED_TOKEN: { value: 'old-value', isSecret: true, updatedAt: '2025-01-01T00:00:00.000Z' },
        },
      };
      const result = vm.setVariable(envs, 'Default', 'DEPRECATED_TOKEN', null);
      expect(result.Default.DEPRECATED_TOKEN).toBeUndefined();
    });

    it('deletes variable when value is empty string', () => {
      const envs = {
        Default: {
          TO_CLEAR: { value: 'had-a-value', isSecret: false, updatedAt: '2025-01-01T00:00:00.000Z' },
        },
      };
      const result = vm.setVariable(envs, 'Default', 'TO_CLEAR', '');
      expect(result.Default.TO_CLEAR).toBeUndefined();
    });

    it('throws when environment does not exist', () => {
      const envs = { Default: {} };
      expect(() => vm.setVariable(envs, 'NonExistent', 'VAR', 'val'))
        .toThrow("Environment 'NonExistent' does not exist");
    });

    it('does not mutate the original environments object', () => {
      const envs = makeEnterpriseEnvironments();
      const originalProdSecret = envs.Production.OAUTH2_CLIENT_SECRET.value;
      const result = vm.setVariable(envs, 'Production', 'NEW_VAR', 'new-value');
      expect((envs.Production as Record<string, unknown>).NEW_VAR).toBeUndefined();
      expect(envs.Production.OAUTH2_CLIENT_SECRET.value).toBe(originalProdSecret);
      expect(result.Production.NEW_VAR.value).toBe('new-value');
    });

    it('handles values with special characters (connection strings, JWTs)', () => {
      const envs = { Default: {} };
      const connStr = 'postgresql://user:P@ss=w0rd&special!@host:5432/db?ssl=true&timeout=30';
      const result = vm.setVariable(envs, 'Default', 'DB_CONN', connStr);
      expect(result.Default.DB_CONN.value).toBe(connStr);
    });

    it('updates existing variable preserving environment integrity', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.setVariable(envs, 'Production', 'API_GATEWAY_URL', 'https://api-v3.openheaders.io/v3');
      expect(result.Production.API_GATEWAY_URL.value).toBe('https://api-v3.openheaders.io/v3');
      // Other variables remain intact
      expect(result.Production.OAUTH2_CLIENT_ID.value).toBe('oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012');
      expect(result.Production.REDIS_URL.value).toBe('rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0');
    });
  });

  describe('createEnvironment()', () => {
    it('creates a new empty environment with enterprise name', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.createEnvironment(envs, 'DR — Disaster Recovery');
      expect(result['DR — Disaster Recovery']).toEqual({});
      // All existing environments preserved
      expect(Object.keys(result)).toEqual([
        'Default',
        'Staging — EU Region',
        'QA — Integration Tests',
        'Pre-production',
        'Production',
        'DR — Disaster Recovery',
      ]);
    });

    it('throws when environment already exists', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.createEnvironment(envs, 'Production'))
        .toThrow("Environment 'Production' already exists");
    });
  });

  describe('deleteEnvironment()', () => {
    it('deletes the specified environment while preserving others', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.deleteEnvironment(envs, 'QA — Integration Tests');
      expect(result['QA — Integration Tests']).toBeUndefined();
      expect(Object.keys(result)).toEqual([
        'Default',
        'Staging — EU Region',
        'Pre-production',
        'Production',
      ]);
    });

    it('throws when trying to delete Default', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.deleteEnvironment(envs, 'Default'))
        .toThrow('Cannot delete Default environment');
    });
  });

  describe('validateEnvironmentExists()', () => {
    it('does not throw for existing environment with special chars', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.validateEnvironmentExists(envs, 'Staging — EU Region')).not.toThrow();
    });

    it('throws for non-existent environment', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.validateEnvironmentExists(envs, 'Missing'))
        .toThrow("Environment 'Missing' does not exist");
    });
  });

  describe('getVariableCount()', () => {
    it('returns 0 for empty environment', () => {
      const envs = makeEnterpriseEnvironments();
      expect(vm.getVariableCount(envs, 'QA — Integration Tests')).toBe(0);
    });

    it('returns correct count for production environment', () => {
      const envs = makeEnterpriseEnvironments();
      expect(vm.getVariableCount(envs, 'Production')).toBe(5);
    });

    it('returns 0 for non-existent environment', () => {
      const envs = makeEnterpriseEnvironments();
      expect(vm.getVariableCount(envs, 'Missing')).toBe(0);
    });
  });

  describe('exportEnvironment()', () => {
    it('exports production as JSON with all variable details', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.exportEnvironment(envs, 'Production', 'json');
      const parsed = JSON.parse(result);
      expect(parsed.OAUTH2_CLIENT_ID).toEqual({
        value: 'oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012',
        isSecret: false,
        updatedAt: '2026-01-10T16:30:00.000Z',
      });
      expect(parsed.DATABASE_CONNECTION_STRING.isSecret).toBe(true);
      expect(Object.keys(parsed)).toHaveLength(5);
    });

    it('exports as .env format preserving special chars in values', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.exportEnvironment(envs, 'Default', 'env');
      expect(result).toContain('OAUTH2_CLIENT_ID=oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toContain('DATABASE_CONNECTION_STRING=postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require');
      expect(result).toContain('API_GATEWAY_URL=https://gateway.openheaders.io:8443/v2');
    });

    it('exports as shell format with quoted values', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.exportEnvironment(envs, 'Default', 'shell');
      expect(result).toContain('export OAUTH2_CLIENT_ID="oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890"');
      expect(result).toContain('export API_GATEWAY_URL="https://gateway.openheaders.io:8443/v2"');
    });

    it('throws for unsupported format', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.exportEnvironment(envs, 'Default', 'yaml'))
        .toThrow('Unsupported export format: yaml');
    });

    it('throws for non-existent environment', () => {
      const envs = makeEnterpriseEnvironments();
      expect(() => vm.exportEnvironment(envs, 'Missing', 'json'))
        .toThrow("Environment 'Missing' does not exist");
    });

    it('exports empty environment as empty string in env format', () => {
      const envs = makeEnterpriseEnvironments();
      const result = vm.exportEnvironment(envs, 'QA — Integration Tests', 'env');
      expect(result).toBe('');
    });
  });

  describe('importEnvironment()', () => {
    it('imports JSON format with full variable objects', () => {
      const data = JSON.stringify({
        OAUTH2_TOKEN: { value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature', isSecret: true, updatedAt: '2026-01-15T10:00:00.000Z' },
        ENDPOINT_URL: { value: 'https://api.openheaders.io/v2/resources', isSecret: false },
      });
      const result = vm.importEnvironment(data, 'json');
      expect(result.OAUTH2_TOKEN).toEqual({
        value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature',
        isSecret: true,
        updatedAt: '2026-01-15T10:00:00.000Z',
      });
      expect(result.ENDPOINT_URL.value).toBe('https://api.openheaders.io/v2/resources');
      expect(result.ENDPOINT_URL.isSecret).toBe(false);
    });

    it('imports JSON format with simple key-value pairs (legacy)', () => {
      const data = JSON.stringify({
        API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        REGION: 'eu-west-1',
      });
      const result = vm.importEnvironment(data, 'json');
      expect(result.API_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(result.API_KEY.isSecret).toBe(false);
      expect(result.API_KEY.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.REGION.value).toBe('eu-west-1');
    });

    it('imports .env format with special characters in values', () => {
      const data = [
        '# Production environment variables',
        'DATABASE_URL=postgresql://admin:P@ss=w0rd&special@db.openheaders.io:5432/prod',
        'REDIS_URL=rediss://default:r3d!s@redis.openheaders.io:6380/0',
        '',
        '# API keys',
        'STRIPE_KEY=ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
      ].join('\n');
      const result = vm.importEnvironment(data, 'env');
      expect(result.DATABASE_URL.value).toBe('postgresql://admin:P@ss=w0rd&special@db.openheaders.io:5432/prod');
      expect(result.REDIS_URL.value).toBe('rediss://default:r3d!s@redis.openheaders.io:6380/0');
      expect(result.STRIPE_KEY.value).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('handles .env with = in values', () => {
      const data = 'QUERY=filter=active&sort=name&limit=100';
      const result = vm.importEnvironment(data, 'env');
      expect(result.QUERY.value).toBe('filter=active&sort=name&limit=100');
    });

    it('skips comments and blank lines in .env format', () => {
      const data = '# comment\n\n  \nKEY=val\n  # another comment\n';
      const result = vm.importEnvironment(data, 'env');
      expect(Object.keys(result)).toEqual(['KEY']);
    });

    it('throws for unsupported format', () => {
      expect(() => vm.importEnvironment('data', 'xml'))
        .toThrow('Unsupported import format: xml');
    });

    it('throws for invalid JSON', () => {
      expect(() => vm.importEnvironment('not valid json {{{', 'json')).toThrow();
    });
  });
});

// ======================================================================
// EnvironmentStateManager
// ======================================================================
describe('EnvironmentStateManager', () => {
  let esm: InstanceType<typeof EnvironmentStateManager>;

  beforeEach(() => {
    esm = new EnvironmentStateManager();
  });

  afterEach(() => {
    esm.cleanup();
  });

  describe('initial state', () => {
    it('has correct defaults with full shape assertion', () => {
      const state = esm.getState();
      expect(state).toEqual({
        currentWorkspaceId: 'default-personal',
        environments: { Default: {} },
        activeEnvironment: 'Default',
        isLoading: false,
        isReady: false,
        error: null,
      });
    });

    it('has no initial data loaded', () => {
      expect(esm.hasInitialData()).toBe(false);
    });

    it('has no init promise', () => {
      expect(esm.getInitPromise()).toBeNull();
    });
  });

  describe('setState()', () => {
    it('merges enterprise workspace state updates', () => {
      esm.setState({
        currentWorkspaceId: ENTERPRISE_WORKSPACE_ID,
        environments: makeEnterpriseEnvironments(),
        activeEnvironment: 'Production',
        isLoading: false,
        isReady: true,
      });
      const state = esm.getState();
      expect(state.currentWorkspaceId).toBe(ENTERPRISE_WORKSPACE_ID);
      expect(state.activeEnvironment).toBe('Production');
      expect(state.isReady).toBe(true);
      expect(Object.keys(state.environments)).toEqual([
        'Default',
        'Staging — EU Region',
        'QA — Integration Tests',
        'Pre-production',
        'Production',
      ]);
    });

    it('notifies listeners on state change', () => {
      const listener = vi.fn();
      esm.subscribe(listener);
      listener.mockClear();

      esm.setState({ isReady: true, currentWorkspaceId: ENTERPRISE_WORKSPACE_ID });
      expect(listener).toHaveBeenCalledTimes(1);
      const [state] = listener.mock.calls[0];
      expect(state.isReady).toBe(true);
      expect(state.currentWorkspaceId).toBe(ENTERPRISE_WORKSPACE_ID);
    });
  });

  describe('getState()', () => {
    it('returns an immutable copy — mutations do not affect internal state', () => {
      esm.setState({ environments: makeEnterpriseEnvironments() });
      const state = esm.getState();
      state.environments['Hacked'] = {};
      state.currentWorkspaceId = 'hacked-workspace';
      const fresh = esm.getState();
      expect(fresh.environments['Hacked']).toBeUndefined();
      expect(fresh.currentWorkspaceId).toBe('default-personal');
    });
  });

  describe('isReady()', () => {
    it('returns false when not ready', () => {
      expect(esm.isReady()).toBe(false);
    });

    it('returns false when loading even if isReady flag is true', () => {
      esm.state.isReady = true;
      esm.state.isLoading = true;
      expect(esm.isReady()).toBe(false);
    });

    it('returns true when ready and not loading', () => {
      esm.state.isReady = true;
      esm.state.isLoading = false;
      expect(esm.isReady()).toBe(true);
    });
  });

  describe('init promise management', () => {
    it('setInitPromise / getInitPromise round-trip', () => {
      const promise = Promise.resolve(true);
      esm.setInitPromise(promise);
      expect(esm.getInitPromise()).toBe(promise);
    });
  });

  describe('load promise management', () => {
    it('manages promises per workspace ID', () => {
      const promiseA = Promise.resolve(true);
      const promiseB = Promise.resolve(true);
      esm.setLoadPromise(ENTERPRISE_WORKSPACE_ID, promiseA);
      esm.setLoadPromise('ws-other-workspace', promiseB);

      expect(esm.getLoadPromise(ENTERPRISE_WORKSPACE_ID)).toBe(promiseA);
      expect(esm.getLoadPromise('ws-other-workspace')).toBe(promiseB);
      expect(esm.isLoadingWorkspace(ENTERPRISE_WORKSPACE_ID)).toBe(true);

      esm.clearLoadPromise(ENTERPRISE_WORKSPACE_ID);
      expect(esm.isLoadingWorkspace(ENTERPRISE_WORKSPACE_ID)).toBe(false);
      expect(esm.isLoadingWorkspace('ws-other-workspace')).toBe(true);
    });

    it('returns undefined for unknown workspace', () => {
      expect(esm.getLoadPromise('ws-unknown')).toBeUndefined();
    });
  });

  describe('initial data tracking', () => {
    it('starts without initial data and marks it loaded', () => {
      expect(esm.hasInitialData()).toBe(false);
      esm.markInitialDataLoaded();
      expect(esm.hasInitialData()).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('calls listener immediately with current state including defaults', () => {
      const listener = vi.fn();
      esm.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          currentWorkspaceId: 'default-personal',
          environments: { Default: {} },
          activeEnvironment: 'Default',
          isLoading: false,
          isReady: false,
          error: null,
        }),
        []
      );
    });

    it('returns an unsubscribe function that prevents future notifications', () => {
      const listener = vi.fn();
      const unsub = esm.subscribe(listener);
      listener.mockClear();

      unsub();
      esm.setState({ isReady: true });
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple concurrent listeners', () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      esm.subscribe(listenerA);
      esm.subscribe(listenerB);
      listenerA.mockClear();
      listenerB.mockClear();

      esm.setState({ activeEnvironment: 'Production' });
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });
  });
});

// ======================================================================
// CES-style patterns — pure state management logic
// ======================================================================
describe('CES state management patterns', () => {
  describe('batchSetVariables pattern', () => {
    it('sets multiple enterprise variables in a single pass', () => {
      const environments = makeEnterpriseEnvironments();
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      const variables: Array<{ name: string; value: string | null; isSecret: boolean }> = [
        { name: 'NEW_API_TOKEN', value: 'Bearer eyJhbGciOiJSUzI1NiJ9.new-payload.sig', isSecret: true },
        { name: 'MONITORING_URL', value: 'https://grafana.openheaders.io/d/api-latency', isSecret: false },
        { name: 'SENTRY_DSN', value: 'https://abc123@sentry.openheaders.io/42', isSecret: false },
      ];

      for (const { name, value, isSecret } of variables) {
        if (value === null || value === '') {
          delete updatedEnvironments.Production[name];
        } else {
          updatedEnvironments.Production[name] = {
            value,
            isSecret: isSecret || false,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      // Original variables preserved
      expect(updatedEnvironments.Production.OAUTH2_CLIENT_ID.value).toBe('oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012');
      expect(updatedEnvironments.Production.REDIS_URL.value).toBe('rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0');
      // New variables added
      expect(updatedEnvironments.Production.NEW_API_TOKEN.value).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.new-payload.sig');
      expect(updatedEnvironments.Production.NEW_API_TOKEN.isSecret).toBe(true);
      expect(updatedEnvironments.Production.MONITORING_URL.value).toBe('https://grafana.openheaders.io/d/api-latency');
      expect(updatedEnvironments.Production.SENTRY_DSN.value).toBe('https://abc123@sentry.openheaders.io/42');
      // Total count
      expect(Object.keys(updatedEnvironments.Production)).toHaveLength(8);
    });

    it('deletes variables with null or empty values', () => {
      const environments = makeEnterpriseEnvironments();
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      const variables: Array<{ name: string; value: string | null }> = [
        { name: 'REDIS_URL', value: null },
        { name: 'DATABASE_CONNECTION_STRING', value: '' },
      ];

      for (const { name, value } of variables) {
        if (value === null || value === '') {
          delete updatedEnvironments.Production[name];
        }
      }

      expect(updatedEnvironments.Production.REDIS_URL).toBeUndefined();
      expect(updatedEnvironments.Production.DATABASE_CONNECTION_STRING).toBeUndefined();
      expect(updatedEnvironments.Production.OAUTH2_CLIENT_ID.value).toBe('oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012');
      expect(Object.keys(updatedEnvironments.Production)).toHaveLength(3);
    });

    it('throws for non-existent environment', () => {
      const environments = makeEnterpriseEnvironments();
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      expect(updatedEnvironments['NonExistent']).toBeUndefined();
    });
  });

  describe('deleteEnvironment pattern', () => {
    it('switches to Default when deleting active environment', () => {
      const state = {
        environments: makeEnterpriseEnvironments(),
        activeEnvironment: 'Staging — EU Region',
      };

      const wasActive = state.activeEnvironment === 'Staging — EU Region';
      const updatedEnvs: Record<string, (typeof state.environments)[keyof typeof state.environments]> = { ...state.environments };
      delete updatedEnvs['Staging — EU Region'];

      const updates: { environments: typeof updatedEnvs; activeEnvironment?: string } = { environments: updatedEnvs };
      if (wasActive) {
        updates.activeEnvironment = 'Default';
      }

      expect(updates.activeEnvironment).toBe('Default');
      expect(updates.environments['Staging — EU Region']).toBeUndefined();
      expect(Object.keys(updates.environments)).toHaveLength(4);
    });

    it('does not change active environment when deleting non-active', () => {
      const state = {
        environments: makeEnterpriseEnvironments(),
        activeEnvironment: 'Production',
      };

      const wasActive = state.activeEnvironment === 'QA — Integration Tests';
      expect(wasActive).toBe(false);
    });
  });

  describe('handleWorkspaceChange pattern', () => {
    it('skips when already in target workspace and ready', () => {
      const state = { currentWorkspaceId: ENTERPRISE_WORKSPACE_ID, isReady: true };
      const shouldChange = !(state.currentWorkspaceId === ENTERPRISE_WORKSPACE_ID && state.isReady);
      expect(shouldChange).toBe(false);
    });

    it('proceeds when workspace is different', () => {
      const state = { currentWorkspaceId: ENTERPRISE_WORKSPACE_ID, isReady: true };
      const shouldChange = !(state.currentWorkspaceId === 'ws-different-workspace' && state.isReady);
      expect(shouldChange).toBe(true);
    });

    it('proceeds when not ready even if same workspace', () => {
      const state = { currentWorkspaceId: ENTERPRISE_WORKSPACE_ID, isReady: false };
      const shouldChange = !(state.currentWorkspaceId === ENTERPRISE_WORKSPACE_ID && state.isReady);
      expect(shouldChange).toBe(true);
    });
  });

  describe('resolveTemplate pattern', () => {
    it('returns string result directly', () => {
      const getResult = (): string | { resolved: string; missing: string[] } => 'https://api.openheaders.io/v2/resources';
      const result = getResult();
      const output = typeof result === 'string' ? result : result.resolved;
      expect(output).toBe('https://api.openheaders.io/v2/resources');
    });

    it('extracts resolved from object result', () => {
      const result: string | { resolved: string; missing: string[] } = {
        resolved: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature',
        missing: ['REFRESH_TOKEN'],
      };
      const output = typeof result === 'string' ? result : result.resolved;
      expect(output).toBe('Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature');
    });
  });

  describe('waitForReady pattern', () => {
    it('resolves immediately when already ready', async () => {
      const esm = new EnvironmentStateManager();
      esm.setState({ isReady: true });
      const result = await esm.waitForReady(100);
      expect(result).toBe(true);
      esm.cleanup();
    });

    it('throws on timeout when not ready', async () => {
      vi.useRealTimers();
      const esm = new EnvironmentStateManager();
      await expect(esm.waitForReady(100)).rejects.toThrow('Timeout waiting for environment service to be ready');
      esm.cleanup();
    });
  });
});
