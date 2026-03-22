import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Mock BaseStateManager
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

const EnvironmentStateManager = (
  await import('../../../../src/renderer/services/environment/EnvironmentStateManager')
).default;

// ---------------------------------------------------------------------------
// Enterprise-realistic data
// ---------------------------------------------------------------------------

const WORKSPACE_ID_PROD = 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const WORKSPACE_ID_STAGING = 'ws-b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEnterpriseEnvs(): Record<string, Record<string, EnvironmentVariable>> {
  return {
    Default: {
      OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false, updatedAt: '2025-11-15T09:30:00.000Z' },
      OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true, updatedAt: '2025-11-15T09:30:00.000Z' },
    },
    'Staging — EU Region': {
      API_GATEWAY_URL: { value: 'https://staging-eu.openheaders.io:8443/v2', isSecret: false, updatedAt: '2025-12-01T08:00:00.000Z' },
    },
    Production: {
      DATABASE_CONNECTION_STRING: {
        value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full',
        isSecret: true,
        updatedAt: '2026-01-10T16:30:00.000Z',
      },
      REDIS_URL: { value: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0', isSecret: true, updatedAt: '2026-01-10T16:30:00.000Z' },
    },
  };
}

describe('EnvironmentStateManager (environment/)', () => {
  let manager: InstanceType<typeof EnvironmentStateManager>;

  beforeEach(() => {
    manager = new EnvironmentStateManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  // ========================================================================
  // constructor / initial state
  // ========================================================================
  describe('constructor', () => {
    it('initializes with full default state shape', () => {
      const state = manager.getState();
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
      expect(manager.hasInitialData()).toBe(false);
    });

    it('has no init promise', () => {
      expect(manager.getInitPromise()).toBeNull();
    });

    it('has empty load promises map', () => {
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_PROD)).toBe(false);
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_STAGING)).toBe(false);
    });
  });

  // ========================================================================
  // getState — immutability
  // ========================================================================
  describe('getState', () => {
    it('returns an immutable copy — environment mutations do not propagate', () => {
      manager.setState({ environments: makeEnterpriseEnvs() });
      const state1 = manager.getState();
      state1.currentWorkspaceId = 'hacked';
      state1.environments['Injected'] = {};
      state1.activeEnvironment = 'Injected';
      const state2 = manager.getState();
      expect(state2.currentWorkspaceId).toBe('default-personal');
      expect(state2.environments['Injected']).toBeUndefined();
      expect(state2.activeEnvironment).toBe('Default');
    });

    it('returns enterprise environments with full shape', () => {
      manager.setState({
        environments: makeEnterpriseEnvs(),
        activeEnvironment: 'Production',
        currentWorkspaceId: WORKSPACE_ID_PROD,
      });
      const state = manager.getState();
      expect(state.currentWorkspaceId).toBe(WORKSPACE_ID_PROD);
      expect(state.activeEnvironment).toBe('Production');
      expect(Object.keys(state.environments)).toEqual(['Default', 'Staging — EU Region', 'Production']);
      expect(state.environments.Production.DATABASE_CONNECTION_STRING).toEqual({
        value: 'postgresql://prod_user:Pr0d$ecret!@db.openheaders.io:5432/production?sslmode=verify-full',
        isSecret: true,
        updatedAt: '2026-01-10T16:30:00.000Z',
      });
    });
  });

  // ========================================================================
  // setState
  // ========================================================================
  describe('setState', () => {
    it('merges partial updates preserving unchanged fields', () => {
      manager.setState({ isLoading: true, currentWorkspaceId: WORKSPACE_ID_PROD });
      const state = manager.getState();
      expect(state.isLoading).toBe(true);
      expect(state.currentWorkspaceId).toBe(WORKSPACE_ID_PROD);
      expect(state.environments).toEqual({ Default: {} });
      expect(state.error).toBeNull();
    });

    it('notifies all listeners on state change with updated values', () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      manager.subscribe(listenerA);
      manager.subscribe(listenerB);
      listenerA.mockClear();
      listenerB.mockClear();

      manager.setState({ isReady: true, activeEnvironment: 'Production' });
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
      const [receivedState] = listenerA.mock.calls[0];
      expect(receivedState.isReady).toBe(true);
      expect(receivedState.activeEnvironment).toBe('Production');
    });

    it('handles rapid successive updates', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      listener.mockClear();

      manager.setState({ isLoading: true });
      manager.setState({ environments: makeEnterpriseEnvs() });
      manager.setState({ isLoading: false, isReady: true });

      expect(listener).toHaveBeenCalledTimes(3);
      const finalState = listener.mock.calls[2][0];
      expect(finalState.isLoading).toBe(false);
      expect(finalState.isReady).toBe(true);
      expect(Object.keys(finalState.environments)).toHaveLength(3);
    });

    it('overwrites error state on successful load', () => {
      manager.setState({ error: 'Network timeout loading environments', isReady: false });
      expect(manager.getState().error).toBe('Network timeout loading environments');

      manager.setState({ error: null, isReady: true, environments: makeEnterpriseEnvs() });
      const state = manager.getState();
      expect(state.error).toBeNull();
      expect(state.isReady).toBe(true);
      expect(Object.keys(state.environments)).toHaveLength(3);
    });
  });

  // ========================================================================
  // isReady
  // ========================================================================
  describe('isReady', () => {
    it('returns false when not ready', () => {
      expect(manager.isReady()).toBe(false);
    });

    it('returns true when ready and not loading', () => {
      manager.setState({ isReady: true, isLoading: false });
      expect(manager.isReady()).toBe(true);
    });

    it('returns false when ready but still loading', () => {
      manager.setState({ isReady: true, isLoading: true });
      expect(manager.isReady()).toBe(false);
    });

    it('returns false during workspace switch (loading state)', () => {
      manager.setState({ isReady: true });
      expect(manager.isReady()).toBe(true);
      manager.setState({ isLoading: true, isReady: false });
      expect(manager.isReady()).toBe(false);
    });
  });

  // ========================================================================
  // waitForReady
  // ========================================================================
  describe('waitForReady', () => {
    it('resolves immediately when already ready', async () => {
      manager.setState({ isReady: true });
      const result = await manager.waitForReady(100);
      expect(result).toBe(true);
    });

    it('resolves when state becomes ready asynchronously', async () => {
      vi.useRealTimers();
      setTimeout(() => manager.setState({ isReady: true }), 50);
      const result = await manager.waitForReady(1000);
      expect(result).toBe(true);
    });

    it('throws on timeout with descriptive error', async () => {
      vi.useRealTimers();
      await expect(manager.waitForReady(100)).rejects.toThrow(
        'Timeout waiting for environment service to be ready'
      );
    });
  });

  // ========================================================================
  // init / load promise tracking
  // ========================================================================
  describe('promise tracking', () => {
    it('tracks init promise round-trip', () => {
      const promise = Promise.resolve(true);
      manager.setInitPromise(promise);
      expect(manager.getInitPromise()).toBe(promise);
    });

    it('tracks load promises per workspace independently', () => {
      const promiseProd = Promise.resolve(true);
      const promiseStaging = Promise.resolve(true);
      manager.setLoadPromise(WORKSPACE_ID_PROD, promiseProd);
      manager.setLoadPromise(WORKSPACE_ID_STAGING, promiseStaging);

      expect(manager.getLoadPromise(WORKSPACE_ID_PROD)).toBe(promiseProd);
      expect(manager.getLoadPromise(WORKSPACE_ID_STAGING)).toBe(promiseStaging);
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_PROD)).toBe(true);
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_STAGING)).toBe(true);
    });

    it('clears load promise for specific workspace only', () => {
      manager.setLoadPromise(WORKSPACE_ID_PROD, Promise.resolve(true));
      manager.setLoadPromise(WORKSPACE_ID_STAGING, Promise.resolve(true));
      manager.clearLoadPromise(WORKSPACE_ID_PROD);

      expect(manager.getLoadPromise(WORKSPACE_ID_PROD)).toBeUndefined();
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_PROD)).toBe(false);
      expect(manager.isLoadingWorkspace(WORKSPACE_ID_STAGING)).toBe(true);
    });

    it('returns undefined for workspace that was never tracked', () => {
      expect(manager.getLoadPromise('ws-unknown-workspace')).toBeUndefined();
      expect(manager.isLoadingWorkspace('ws-unknown-workspace')).toBe(false);
    });
  });

  // ========================================================================
  // initial data tracking
  // ========================================================================
  describe('initial data tracking', () => {
    it('starts without initial data and marks it loaded', () => {
      expect(manager.hasInitialData()).toBe(false);
      manager.markInitialDataLoaded();
      expect(manager.hasInitialData()).toBe(true);
    });
  });

  // ========================================================================
  // subscribe (inherited from BaseStateManager)
  // ========================================================================
  describe('subscribe', () => {
    it('calls listener immediately with full default state', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        {
          currentWorkspaceId: 'default-personal',
          environments: { Default: {} },
          activeEnvironment: 'Default',
          isLoading: false,
          isReady: false,
          error: null,
        },
        []
      );
    });

    it('returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = manager.subscribe(listener);
      listener.mockClear();

      unsub();
      manager.setState({ isReady: true });
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple simultaneous listeners', () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      manager.subscribe(listenerA);
      manager.subscribe(listenerB);
      listenerA.mockClear();
      listenerB.mockClear();

      manager.setState({ isReady: true, activeEnvironment: 'Production' });
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
      expect(listenerA.mock.calls[0][0].activeEnvironment).toBe('Production');
    });
  });

  // ========================================================================
  // cleanup
  // ========================================================================
  describe('cleanup', () => {
    it('removes all listeners', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      listener.mockClear();

      manager.cleanup();
      manager.setState({ isReady: true });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
