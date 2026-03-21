import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const EnvironmentStateManager = (
  await import('../../../../src/renderer/services/environment/EnvironmentStateManager')
).default;

describe('EnvironmentStateManager', () => {
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
    it('initializes with default state', () => {
      const state = manager.getState();
      expect(state.currentWorkspaceId).toBe('default-personal');
      expect(state.environments).toEqual({ Default: {} });
      expect(state.activeEnvironment).toBe('Default');
      expect(state.isLoading).toBe(false);
      expect(state.isReady).toBe(false);
      expect(state.error).toBeNull();
    });

    it('has no initial data loaded', () => {
      expect(manager.hasInitialData()).toBe(false);
    });

    it('has no init promise', () => {
      expect(manager.getInitPromise()).toBeNull();
    });
  });

  // ========================================================================
  // getState
  // ========================================================================
  describe('getState', () => {
    it('returns an immutable copy of state', () => {
      const state1 = manager.getState();
      state1.currentWorkspaceId = 'modified';
      state1.environments.NewEnv = {};
      const state2 = manager.getState();
      expect(state2.currentWorkspaceId).toBe('default-personal');
      expect(state2.environments.NewEnv).toBeUndefined();
    });
  });

  // ========================================================================
  // setState
  // ========================================================================
  describe('setState', () => {
    it('merges updates into state', () => {
      manager.setState({ isLoading: true });
      expect(manager.getState().isLoading).toBe(true);
      expect(manager.getState().currentWorkspaceId).toBe('default-personal');
    });

    it('notifies listeners on state change', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      listener.mockClear(); // clear the initial call

      manager.setState({ isReady: true });
      expect(listener).toHaveBeenCalledTimes(1);
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

    it('resolves when state becomes ready', async () => {
      vi.useRealTimers();
      setTimeout(() => manager.setState({ isReady: true }), 50);
      const result = await manager.waitForReady(1000);
      expect(result).toBe(true);
    });

    it('throws on timeout', async () => {
      vi.useRealTimers();
      await expect(manager.waitForReady(100)).rejects.toThrow('Timeout');
    });
  });

  // ========================================================================
  // init / load promise tracking
  // ========================================================================
  describe('promise tracking', () => {
    it('tracks init promise', () => {
      const promise = Promise.resolve(true);
      manager.setInitPromise(promise);
      expect(manager.getInitPromise()).toBe(promise);
    });

    it('tracks load promise per workspace', () => {
      const promise = Promise.resolve(true);
      manager.setLoadPromise('ws-1', promise);
      expect(manager.getLoadPromise('ws-1')).toBe(promise);
      expect(manager.getLoadPromise('ws-2')).toBeUndefined();
    });

    it('clears load promise', () => {
      manager.setLoadPromise('ws-1', Promise.resolve(true));
      manager.clearLoadPromise('ws-1');
      expect(manager.getLoadPromise('ws-1')).toBeUndefined();
    });

    it('checks if workspace is loading', () => {
      expect(manager.isLoadingWorkspace('ws-1')).toBe(false);
      manager.setLoadPromise('ws-1', Promise.resolve(true));
      expect(manager.isLoadingWorkspace('ws-1')).toBe(true);
    });
  });

  // ========================================================================
  // initial data tracking
  // ========================================================================
  describe('initial data tracking', () => {
    it('marks initial data as loaded', () => {
      manager.markInitialDataLoaded();
      expect(manager.hasInitialData()).toBe(true);
    });
  });

  // ========================================================================
  // subscribe (inherited from BaseStateManager)
  // ========================================================================
  describe('subscribe', () => {
    it('calls listener immediately with current state', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ currentWorkspaceId: 'default-personal' }),
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
  });
});
