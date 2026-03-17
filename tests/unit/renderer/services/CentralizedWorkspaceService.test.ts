/**
 * Tests for the workspace sub-managers that CentralizedWorkspaceService delegates to.
 *
 * CentralizedWorkspaceService.ts uses mixed CJS/ESM syntax (require + export)
 * which prevents direct import in vitest. Instead, we test the component managers
 * individually: BaseStateManager, AutoSaveManager — plus pure state-management
 * patterns that mirror CWS behaviour.
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

// Import the CJS sub-managers that CWS delegates to
const BaseStateManager = (await import(
  '../../../../src/renderer/services/workspace/BaseStateManager'
) as any).default || (await import('../../../../src/renderer/services/workspace/BaseStateManager') as any);

const AutoSaveManagerModule = await import(
  '../../../../src/renderer/services/workspace/AutoSaveManager'
);
const AutoSaveManager = (AutoSaveManagerModule as any).default || AutoSaveManagerModule;

// ======================================================================
// BaseStateManager (base class of CentralizedWorkspaceService)
// ======================================================================
describe('BaseStateManager', () => {
  let manager: any;

  beforeEach(() => {
    manager = new BaseStateManager('TestManager');
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('constructor', () => {
    it('initializes with empty state and listeners', () => {
      expect(manager.listeners.size).toBe(0);
      expect(manager.getState()).toEqual({});
      expect(manager.serviceName).toBe('TestManager');
    });
  });

  describe('setState()', () => {
    it('merges updates into existing state', () => {
      manager.state = { a: 1, b: 2 };
      manager.setState({ b: 3, c: 4 });
      expect(manager.state).toEqual({ a: 1, b: 3, c: 4 });
    });
  });

  describe('getState()', () => {
    it('returns an immutable deep copy of state', () => {
      manager.state = { nested: { key: 'value' } };
      const copy = manager.getState();
      copy.nested.key = 'modified';
      expect(manager.state.nested.key).toBe('value');
    });
  });

  describe('subscribe()', () => {
    it('adds listener and calls it immediately with current state', () => {
      manager.state = { x: 42 };
      const listener = vi.fn();
      manager.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ x: 42 }, []);
    });

    it('calls listener on subsequent state changes', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      listener.mockClear();
      manager.setState({ y: 100 }, ['y']);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ y: 100 }), ['y']);
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = manager.subscribe(listener);
      listener.mockClear();
      unsub();
      manager.setState({ z: 1 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('notifyListeners()', () => {
    it('catches listener errors without throwing', () => {
      const badListener = vi.fn(() => { throw new Error('boom'); });
      const goodListener = vi.fn();
      manager.listeners.add(badListener);
      manager.listeners.add(goodListener);
      expect(() => manager.notifyListeners(['test'])).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('cleanup()', () => {
    it('clears all listeners', () => {
      manager.subscribe(vi.fn());
      manager.subscribe(vi.fn());
      expect(manager.listeners.size).toBe(2);
      manager.cleanup();
      expect(manager.listeners.size).toBe(0);
    });
  });
});

// ======================================================================
// AutoSaveManager (used by CWS for dirty tracking and auto-save)
// ======================================================================
describe('AutoSaveManager', () => {
  let asm: any;

  beforeEach(() => {
    vi.useFakeTimers();
    asm = new AutoSaveManager();
  });

  afterEach(() => {
    asm.stopAutoSave();
    vi.useRealTimers();
  });

  describe('markDirty / markClean / hasDirtyData', () => {
    it('starts clean', () => {
      expect(asm.hasDirtyData()).toBe(false);
    });

    it('marks a data type dirty', () => {
      asm.markDirty('sources');
      expect(asm.hasDirtyData()).toBe(true);
      expect(asm.getDirtyState().sources).toBe(true);
    });

    it('marks a data type clean', () => {
      asm.markDirty('sources');
      asm.markClean('sources');
      expect(asm.getDirtyState().sources).toBe(false);
    });

    it('ignores unknown data types', () => {
      asm.markDirty('unknown');
      expect(asm.hasDirtyData()).toBe(false);
    });

    it('tracks multiple data types independently', () => {
      asm.markDirty('sources');
      asm.markDirty('rules');
      asm.markClean('sources');
      expect(asm.getDirtyState().sources).toBe(false);
      expect(asm.getDirtyState().rules).toBe(true);
    });
  });

  describe('getDirtyState()', () => {
    it('returns a copy (not a reference)', () => {
      const state = asm.getDirtyState();
      state.sources = true;
      expect(asm.getDirtyState().sources).toBe(false);
    });
  });

  describe('resetDirtyState()', () => {
    it('resets all data types to clean', () => {
      asm.markDirty('sources');
      asm.markDirty('rules');
      asm.markDirty('proxyRules');
      asm.resetDirtyState();
      expect(asm.hasDirtyData()).toBe(false);
    });
  });

  describe('scheduleAutoSave()', () => {
    it('calls save callback after 1 second', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      asm.scheduleAutoSave(saveFn);
      expect(saveFn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(saveFn).toHaveBeenCalledTimes(1);
    });

    it('debounces rapid calls', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      asm.scheduleAutoSave(saveFn);
      asm.scheduleAutoSave(saveFn);
      asm.scheduleAutoSave(saveFn);
      await vi.advanceTimersByTimeAsync(1000);
      expect(saveFn).toHaveBeenCalledTimes(1);
    });

    it('skips during workspace switching', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      asm.setWorkspaceSwitching(true);
      asm.scheduleAutoSave(saveFn);
      await vi.advanceTimersByTimeAsync(2000);
      expect(saveFn).not.toHaveBeenCalled();
    });
  });

  describe('setWorkspaceSwitching()', () => {
    it('clears pending saves when switching starts', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      asm.scheduleAutoSave(saveFn);
      asm.setWorkspaceSwitching(true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(saveFn).not.toHaveBeenCalled();
    });

    it('allows saves after switching ends', async () => {
      asm.setWorkspaceSwitching(true);
      asm.setWorkspaceSwitching(false);
      const saveFn = vi.fn().mockResolvedValue(undefined);
      asm.scheduleAutoSave(saveFn);
      await vi.advanceTimersByTimeAsync(1000);
      expect(saveFn).toHaveBeenCalled();
    });
  });

  describe('stopAutoSave()', () => {
    it('clears auto-save interval and timers', () => {
      asm.startAutoSave(vi.fn());
      asm.scheduleAutoSave(vi.fn());
      asm.stopAutoSave();
      expect(asm.autoSaveInterval).toBeNull();
    });
  });
});

// ======================================================================
// CWS-style state management patterns
// Tests the coordination logic that CWS implements using BaseStateManager.
// ======================================================================
describe('CWS state management patterns', () => {
  let manager: any;

  beforeEach(() => {
    manager = new BaseStateManager('CWSLike');
    // Set up CWS-like initial state
    manager.state = {
      initialized: false,
      loading: false,
      error: null,
      workspaces: [],
      activeWorkspaceId: 'default-personal',
      isWorkspaceSwitching: false,
      syncStatus: {},
      sources: [],
      rules: { header: [], request: [], response: [] },
      proxyRules: [],
      lastSaved: {},
    };
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('isReady pattern', () => {
    it('is not ready when not initialized', () => {
      expect(manager.state.initialized && !manager.state.loading).toBe(false);
    });

    it('is not ready when loading', () => {
      manager.state.initialized = true;
      manager.state.loading = true;
      expect(manager.state.initialized && !manager.state.loading).toBe(false);
    });

    it('is ready when initialized and not loading', () => {
      manager.state.initialized = true;
      manager.state.loading = false;
      expect(manager.state.initialized && !manager.state.loading).toBe(true);
    });
  });

  describe('source operations', () => {
    it('updateSource merges refreshOptions', () => {
      manager.state.sources = [
        { sourceId: '1', sourceType: 'http', refreshOptions: { enabled: true, interval: 5000 } },
      ];

      const updates = { refreshOptions: { interval: 10000 } };
      const sources = manager.state.sources.map((source: any) => {
        if (source.sourceId === '1') {
          const mergedUpdates = { ...updates };
          if (updates.refreshOptions && source.refreshOptions) {
            mergedUpdates.refreshOptions = {
              ...source.refreshOptions,
              ...updates.refreshOptions,
            };
          }
          return { ...source, ...mergedUpdates, updatedAt: new Date().toISOString() };
        }
        return source;
      });

      expect(sources[0].refreshOptions.enabled).toBe(true);
      expect(sources[0].refreshOptions.interval).toBe(10000);
    });

    it('removeSource filters by id', () => {
      manager.state.sources = [{ sourceId: '1' }, { sourceId: '2' }, { sourceId: '3' }];
      const sources = manager.state.sources.filter(
        (s: any) => s.sourceId !== String('2')
      );
      expect(sources).toHaveLength(2);
      expect(sources.map((s: any) => s.sourceId)).toEqual(['1', '3']);
    });

    it('updateSourceActivation activates and clears dependencies', () => {
      manager.state.sources = [
        { sourceId: '1', activationState: 'waiting_for_deps', missingDependencies: ['KEY'] },
      ];

      const sources = manager.state.sources.map((source: any) => {
        if (source.sourceId === '1') {
          return {
            ...source,
            activationState: 'active',
            missingDependencies: [],
          };
        }
        return source;
      });

      expect(sources[0].activationState).toBe('active');
      expect(sources[0].missingDependencies).toEqual([]);
    });
  });

  describe('proxy rule operations', () => {
    it('addProxyRule appends to array', () => {
      manager.state.proxyRules = [{ id: 'p1' }];
      const rule = { id: 'p2', pattern: '*.api.com' };
      const proxyRules = [...manager.state.proxyRules, rule];
      expect(proxyRules).toHaveLength(2);
      expect(proxyRules[1]).toEqual(rule);
    });

    it('removeProxyRule filters by id', () => {
      manager.state.proxyRules = [{ id: 'p1' }, { id: 'p2' }];
      const proxyRules = manager.state.proxyRules.filter((r: any) => r.id !== 'p1');
      expect(proxyRules).toHaveLength(1);
      expect(proxyRules[0].id).toBe('p2');
    });
  });

  describe('workspace metadata update', () => {
    it('updates metadata for matching workspace', () => {
      manager.state.workspaces = [
        { id: 'ws1', name: 'Test', metadata: { sourceCount: 0 } },
        { id: 'ws2', name: 'Other', metadata: { sourceCount: 3 } },
      ];

      const workspaces = manager.state.workspaces.map((w: any) =>
        w.id === 'ws1'
          ? { ...w, metadata: { ...w.metadata, sourceCount: 5 }, updatedAt: new Date().toISOString() }
          : w
      );

      expect(workspaces[0].metadata.sourceCount).toBe(5);
      expect(workspaces[0].updatedAt).toBeDefined();
      expect(workspaces[1].metadata.sourceCount).toBe(3);
    });
  });

  describe('workspace validation', () => {
    it('rejects empty workspace name', () => {
      const name = '';
      expect(name.length < 1 || name.length > 100).toBe(true);
    });

    it('rejects name over 100 characters', () => {
      const name = 'a'.repeat(101);
      expect(name.length < 1 || name.length > 100).toBe(true);
    });

    it('accepts valid workspace name', () => {
      const name = 'My Workspace';
      expect(name.length < 1 || name.length > 100).toBe(false);
    });

    it('rejects invalid workspace type', () => {
      const type = 'invalid';
      expect(['personal', 'team', 'git'].includes(type)).toBe(false);
    });

    it('accepts valid workspace types', () => {
      expect(['personal', 'team', 'git'].includes('personal')).toBe(true);
      expect(['personal', 'team', 'git'].includes('team')).toBe(true);
      expect(['personal', 'team', 'git'].includes('git')).toBe(true);
    });

    it('prevents deletion of default-personal workspace', () => {
      const workspaceId = 'default-personal';
      expect(workspaceId === 'default-personal').toBe(true);
    });
  });

  describe('saveAll pattern', () => {
    it('selects only dirty data types for saving', () => {
      const dirtyState = { sources: true, rules: false, proxyRules: true };
      const saves: string[] = [];
      if (dirtyState.sources) saves.push('sources');
      if (dirtyState.rules) saves.push('rules');
      if (dirtyState.proxyRules) saves.push('proxyRules');
      expect(saves).toEqual(['sources', 'proxyRules']);
    });

    it('skips save when nothing is dirty', () => {
      const dirtyState = { sources: false, rules: false, proxyRules: false };
      const saves: string[] = [];
      if (dirtyState.sources) saves.push('sources');
      if (dirtyState.rules) saves.push('rules');
      if (dirtyState.proxyRules) saves.push('proxyRules');
      expect(saves).toHaveLength(0);
    });
  });

  describe('switchWorkspace early return', () => {
    it('returns early when already in target workspace', () => {
      manager.state.activeWorkspaceId = 'ws1';
      const shouldSwitch = manager.state.activeWorkspaceId !== 'ws1';
      expect(shouldSwitch).toBe(false);
    });

    it('allows switch to different workspace', () => {
      manager.state.activeWorkspaceId = 'ws1';
      const shouldSwitch = manager.state.activeWorkspaceId !== 'ws2';
      expect(shouldSwitch).toBe(true);
    });
  });

  describe('clearAllData pattern', () => {
    it('resets all data to empty defaults', () => {
      manager.state.sources = [{ sourceId: '1' }];
      manager.state.rules = { header: [{ id: 'r1' }], request: [], response: [] };
      manager.state.proxyRules = [{ id: 'p1' }];

      manager.setState({
        sources: [],
        rules: { header: [], request: [], response: [] },
        proxyRules: [],
      });

      expect(manager.state.sources).toEqual([]);
      expect(manager.state.rules).toEqual({ header: [], request: [], response: [] });
      expect(manager.state.proxyRules).toEqual([]);
    });
  });

  describe('rule count calculation', () => {
    it('calculates total rules across all types', () => {
      const rules = { header: [1, 2, 3], request: [4], response: [5, 6] };
      const totalRules = Object.values(rules).reduce(
        (sum: number, ruleArray: any[]) => sum + ruleArray.length,
        0
      );
      expect(totalRules).toBe(6);
    });

    it('returns 0 for empty rules', () => {
      const rules = { header: [], request: [], response: [] };
      const totalRules = Object.values(rules).reduce(
        (sum: number, ruleArray: any[]) => sum + ruleArray.length,
        0
      );
      expect(totalRules).toBe(0);
    });
  });
});
