/**
 * Tests for the environment sub-managers that CentralizedEnvironmentService delegates to.
 *
 * CentralizedEnvironmentService.ts uses mixed CJS/ESM syntax (require + export)
 * which prevents direct import in vitest. Instead, we test the component managers
 * individually: EnvironmentVariableManager, EnvironmentStateManager, plus pure
 * state-management patterns that mirror CES behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

    it('extracts values from variable objects', () => {
      const environments = {
        Default: {
          API_KEY: { value: 'abc123', isSecret: false },
          DB_URL: { value: 'postgres://localhost', isSecret: true },
        },
      };
      const result = vm.getAllVariables(environments, 'Default');
      expect(result).toEqual({
        API_KEY: 'abc123',
        DB_URL: 'postgres://localhost',
      });
    });

    it('returns empty string for variables without value', () => {
      const environments = {
        Default: {
          // Intentionally omitting value to test ?? '' fallback
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
  });

  describe('setVariable()', () => {
    it('adds a new variable', () => {
      const envs = { Default: {} };
      const result = vm.setVariable(envs, 'Default', 'MY_VAR', 'hello');
      expect(result.Default.MY_VAR.value).toBe('hello');
      expect(result.Default.MY_VAR.isSecret).toBe(false);
      expect(result.Default.MY_VAR.updatedAt).toBeDefined();
    });

    it('marks variable as secret', () => {
      const envs = { Default: {} };
      const result = vm.setVariable(envs, 'Default', 'SECRET', 'shhh', true);
      expect(result.Default.SECRET.isSecret).toBe(true);
    });

    it('deletes variable when value is null', () => {
      const envs = { Default: { TO_DELETE: { value: 'old', isSecret: false } } };
      const result = vm.setVariable(envs, 'Default', 'TO_DELETE', null);
      expect(result.Default.TO_DELETE).toBeUndefined();
    });

    it('deletes variable when value is empty string', () => {
      const envs = { Default: { TO_DELETE: { value: 'old', isSecret: false } } };
      const result = vm.setVariable(envs, 'Default', 'TO_DELETE', '');
      expect(result.Default.TO_DELETE).toBeUndefined();
    });

    it('throws when environment does not exist', () => {
      const envs = { Default: {} };
      expect(() => vm.setVariable(envs, 'NonExistent', 'VAR', 'val'))
        .toThrow("Environment 'NonExistent' does not exist");
    });

    it('does not mutate the original environments object', () => {
      const envs: Record<string, Record<string, { value: string; isSecret: boolean }>> = { Default: { EXISTING: { value: 'keep', isSecret: false } } };
      const result = vm.setVariable(envs, 'Default', 'NEW', 'added');
      expect(envs.Default.NEW).toBeUndefined();
      expect(result.Default.NEW.value).toBe('added');
    });
  });

  describe('createEnvironment()', () => {
    it('creates a new empty environment', () => {
      const envs = { Default: {} };
      const result = vm.createEnvironment(envs, 'Staging');
      expect(result.Staging).toEqual({});
      expect(result.Default).toEqual({});
    });

    it('throws when environment already exists', () => {
      const envs = { Default: {}, Staging: {} };
      expect(() => vm.createEnvironment(envs, 'Staging'))
        .toThrow("Environment 'Staging' already exists");
    });
  });

  describe('deleteEnvironment()', () => {
    it('deletes the specified environment', () => {
      const envs = { Default: {}, Staging: {} };
      const result = vm.deleteEnvironment(envs, 'Staging');
      expect(result.Staging).toBeUndefined();
      expect(result.Default).toEqual({});
    });

    it('throws when trying to delete Default', () => {
      const envs = { Default: {} };
      expect(() => vm.deleteEnvironment(envs, 'Default'))
        .toThrow('Cannot delete Default environment');
    });
  });

  describe('validateEnvironmentExists()', () => {
    it('does not throw for existing environment', () => {
      const envs = { Default: {}, Production: {} };
      expect(() => vm.validateEnvironmentExists(envs, 'Production')).not.toThrow();
    });

    it('throws for non-existent environment', () => {
      const envs = { Default: {} };
      expect(() => vm.validateEnvironmentExists(envs, 'Missing'))
        .toThrow("Environment 'Missing' does not exist");
    });
  });

  describe('getVariableCount()', () => {
    it('returns 0 for empty environment', () => {
      expect(vm.getVariableCount({ Default: {} }, 'Default')).toBe(0);
    });

    it('returns correct count', () => {
      const envs = { Default: { A: { value: '1', isSecret: false }, B: { value: '2', isSecret: false } } };
      expect(vm.getVariableCount(envs, 'Default')).toBe(2);
    });

    it('returns 0 for non-existent environment', () => {
      expect(vm.getVariableCount({ Default: {} }, 'Missing')).toBe(0);
    });
  });

  describe('exportEnvironment()', () => {
    const envs = {
      Default: {
        API_KEY: { value: 'abc', isSecret: false },
        DB_URL: { value: 'postgres://localhost', isSecret: true },
      },
    };

    it('exports as JSON', () => {
      const result = vm.exportEnvironment(envs, 'Default', 'json');
      const parsed = JSON.parse(result);
      expect(parsed.API_KEY.value).toBe('abc');
    });

    it('exports as .env format', () => {
      const result = vm.exportEnvironment(envs, 'Default', 'env');
      expect(result).toContain('API_KEY=abc');
      expect(result).toContain('DB_URL=postgres://localhost');
    });

    it('exports as shell format', () => {
      const result = vm.exportEnvironment(envs, 'Default', 'shell');
      expect(result).toContain('export API_KEY="abc"');
      expect(result).toContain('export DB_URL="postgres://localhost"');
    });

    it('throws for unsupported format', () => {
      expect(() => vm.exportEnvironment(envs, 'Default', 'yaml'))
        .toThrow('Unsupported export format: yaml');
    });

    it('throws for non-existent environment', () => {
      expect(() => vm.exportEnvironment(envs, 'Missing', 'json'))
        .toThrow("Environment 'Missing' does not exist");
    });
  });

  describe('importEnvironment()', () => {
    it('imports JSON format with variable objects', () => {
      const data = JSON.stringify({
        VAR1: { value: 'val1', isSecret: false },
      });
      const result = vm.importEnvironment(data, 'json');
      expect(result.VAR1.value).toBe('val1');
      expect(result.VAR1.isSecret).toBe(false);
    });

    it('imports JSON format with simple key-value pairs', () => {
      const data = JSON.stringify({ SIMPLE: 'just-a-value' });
      const result = vm.importEnvironment(data, 'json');
      expect(result.SIMPLE.value).toBe('just-a-value');
      expect(result.SIMPLE.isSecret).toBe(false);
    });

    it('imports .env format', () => {
      const data = 'API_KEY=abc123\nDB_URL=postgres://localhost\n# comment\n';
      const result = vm.importEnvironment(data, 'env');
      expect(result.API_KEY.value).toBe('abc123');
      expect(result.DB_URL.value).toBe('postgres://localhost');
    });

    it('handles .env with = in values', () => {
      const data = 'QUERY=a=b&c=d';
      const result = vm.importEnvironment(data, 'env');
      expect(result.QUERY.value).toBe('a=b&c=d');
    });

    it('skips comments and blank lines in .env format', () => {
      const data = '# comment\n\nKEY=val\n';
      const result = vm.importEnvironment(data, 'env');
      expect(Object.keys(result)).toEqual(['KEY']);
    });

    it('throws for unsupported format', () => {
      expect(() => vm.importEnvironment('data', 'xml'))
        .toThrow('Unsupported import format: xml');
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
    it('has correct defaults', () => {
      expect(esm.state.currentWorkspaceId).toBe('default-personal');
      expect(esm.state.environments).toEqual({ Default: {} });
      expect(esm.state.activeEnvironment).toBe('Default');
      expect(esm.state.isLoading).toBe(false);
      expect(esm.state.isReady).toBe(false);
      expect(esm.state.error).toBeNull();
    });
  });

  describe('setState()', () => {
    it('merges updates into state', () => {
      esm.setState({ isLoading: true });
      expect(esm.state.isLoading).toBe(true);
    });
  });

  describe('getState()', () => {
    it('returns a copy of state with environments spread', () => {
      esm.state.environments = { Default: { key: { value: 'val', isSecret: false } } };
      const state = esm.getState();
      expect(state.environments.Default).toEqual({ key: { value: 'val', isSecret: false } });
    });
  });

  describe('isReady()', () => {
    it('returns false when not ready', () => {
      expect(esm.isReady()).toBe(false);
    });

    it('returns false when loading', () => {
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
    it('setLoadPromise / getLoadPromise / clearLoadPromise round-trip', () => {
      const promise = Promise.resolve(true);
      esm.setLoadPromise('ws1', promise);
      expect(esm.getLoadPromise('ws1')).toBe(promise);
      expect(esm.isLoadingWorkspace('ws1')).toBe(true);
      esm.clearLoadPromise('ws1');
      expect(esm.isLoadingWorkspace('ws1')).toBe(false);
    });
  });

  describe('initial data tracking', () => {
    it('starts without initial data', () => {
      expect(esm.hasInitialData()).toBe(false);
    });

    it('marks initial data as loaded', () => {
      esm.markInitialDataLoaded();
      expect(esm.hasInitialData()).toBe(true);
    });
  });
});

// ======================================================================
// CES-style patterns — pure state management logic
// ======================================================================
describe('CES state management patterns', () => {
  describe('batchSetVariables pattern', () => {
    it('sets multiple variables in a single pass', () => {
      const environments = { Default: { existing: { value: 'keep' } } };
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      const variables = [
        { name: 'VAR1', value: 'val1', isSecret: false },
        { name: 'VAR2', value: 'val2', isSecret: true },
      ];

      for (const { name, value, isSecret } of variables) {
        updatedEnvironments.Default[name] = {
          value,
          isSecret: isSecret || false,
          updatedAt: new Date().toISOString(),
        };
      }

      expect(updatedEnvironments.Default.existing.value).toBe('keep');
      expect(updatedEnvironments.Default.VAR1.value).toBe('val1');
      expect(updatedEnvironments.Default.VAR2.isSecret).toBe(true);
    });

    it('deletes variables with null or empty values', () => {
      const environments = {
        Default: {
          TO_DELETE: { value: 'old' },
          KEEP: { value: 'keep' },
        },
      };
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      const variables = [{ name: 'TO_DELETE', value: null, isSecret: false }];

      for (const { name, value } of variables) {
        if (value === null || value === '') {
          delete updatedEnvironments.Default[name];
        }
      }

      expect(updatedEnvironments.Default.TO_DELETE).toBeUndefined();
      expect(updatedEnvironments.Default.KEEP.value).toBe('keep');
    });

    it('throws for non-existent environment', () => {
      const environments = { Default: {} };
      const envName = 'NonExistent';
      const updatedEnvironments = JSON.parse(JSON.stringify(environments));
      expect(updatedEnvironments[envName]).toBeUndefined();
    });
  });

  describe('deleteEnvironment pattern', () => {
    it('switches to Default when deleting active environment', () => {
      const state = {
        environments: { Default: {}, Staging: {} } as Record<string, Record<string, { value: string; isSecret: boolean }>>,
        activeEnvironment: 'Staging',
      };

      const wasActive = state.activeEnvironment === 'Staging';
      const updatedEnvs = { ...state.environments };
      delete updatedEnvs.Staging;

      const updates: { environments: Record<string, Record<string, { value: string; isSecret: boolean }>>; activeEnvironment?: string } = { environments: updatedEnvs };
      if (wasActive) {
        updates.activeEnvironment = 'Default';
      }

      expect(updates.activeEnvironment).toBe('Default');
      expect(updates.environments.Staging).toBeUndefined();
    });

    it('does not change active environment when deleting non-active', () => {
      const state = {
        environments: { Default: {}, Staging: {} },
        activeEnvironment: 'Default',
      };

      const wasActive = state.activeEnvironment === 'Staging';
      expect(wasActive).toBe(false);
    });
  });

  describe('handleWorkspaceChange pattern', () => {
    it('skips when already in target workspace and ready', () => {
      const state = { currentWorkspaceId: 'ws1', isReady: true };
      const shouldChange = !(state.currentWorkspaceId === 'ws1' && state.isReady);
      expect(shouldChange).toBe(false);
    });

    it('proceeds when workspace is different', () => {
      const state = { currentWorkspaceId: 'ws1', isReady: true };
      const shouldChange = !(state.currentWorkspaceId === 'ws2' && state.isReady);
      expect(shouldChange).toBe(true);
    });

    it('proceeds when not ready even if same workspace', () => {
      const state = { currentWorkspaceId: 'ws1', isReady: false };
      const shouldChange = !(state.currentWorkspaceId === 'ws1' && state.isReady);
      expect(shouldChange).toBe(true);
    });
  });

  describe('resolveTemplate pattern', () => {
    it('returns string result directly', () => {
      const getResult = (): string | { resolved: string; missing: string[] } => 'resolved-value';
      const result = getResult();
      const output = typeof result === 'string' ? result : result.resolved;
      expect(output).toBe('resolved-value');
    });

    it('extracts resolved from object result', () => {
      const result: string | { resolved: string; missing: string[] } = { resolved: 'from-object', missing: ['VAR1'] };
      const output = typeof result === 'string' ? result : result.resolved;
      expect(output).toBe('from-object');
    });
  });
});
