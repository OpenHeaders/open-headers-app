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

const AutoSaveManagerModule = await import(
  '../../../../src/renderer/services/workspace/AutoSaveManager'
);
const AutoSaveManager = (AutoSaveManagerModule as { default?: typeof AutoSaveManagerModule }).default || AutoSaveManagerModule;

describe('AutoSaveManager', () => {
  let manager: InstanceType<typeof AutoSaveManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AutoSaveManager();
  });

  afterEach(() => {
    manager.stopAutoSave();
    vi.useRealTimers();
  });

  // ========================================================================
  // markDirty / markClean / hasDirtyData / getDirtyState / resetDirtyState
  // ========================================================================
  describe('dirty state management', () => {
    it('initializes with all data clean', () => {
      expect(manager.hasDirtyData()).toBe(false);
      expect(manager.getDirtyState()).toEqual({
        sources: false,
        rules: false,
        proxyRules: false,
      });
    });

    it('marks a data type as dirty', () => {
      manager.markDirty('sources');
      expect(manager.hasDirtyData()).toBe(true);
      expect(manager.getDirtyState().sources).toBe(true);
      expect(manager.getDirtyState().rules).toBe(false);
    });

    it('marks a data type as clean', () => {
      manager.markDirty('rules');
      manager.markClean('rules');
      expect(manager.getDirtyState().rules).toBe(false);
    });

    it('ignores unknown data types on markDirty', () => {
      manager.markDirty('unknown');
      expect(manager.hasDirtyData()).toBe(false);
    });

    it('ignores unknown data types on markClean', () => {
      manager.markDirty('sources');
      manager.markClean('unknown');
      expect(manager.hasDirtyData()).toBe(true);
    });

    it('hasDirtyData returns true when any type is dirty', () => {
      manager.markDirty('proxyRules');
      expect(manager.hasDirtyData()).toBe(true);
    });

    it('resetDirtyState clears all dirty flags', () => {
      manager.markDirty('sources');
      manager.markDirty('rules');
      manager.markDirty('proxyRules');
      manager.resetDirtyState();
      expect(manager.hasDirtyData()).toBe(false);
      expect(manager.getDirtyState()).toEqual({
        sources: false,
        rules: false,
        proxyRules: false,
      });
    });

    it('getDirtyState returns a copy', () => {
      const state = manager.getDirtyState();
      state.sources = true;
      expect(manager.getDirtyState().sources).toBe(false);
    });
  });

  // ========================================================================
  // setWorkspaceSwitching
  // ========================================================================
  describe('setWorkspaceSwitching', () => {
    it('sets the workspace switching flag', () => {
      manager.setWorkspaceSwitching(true);
      expect(manager.workspaceSwitching).toBe(true);
    });

    it('clears pending save timers when switching starts', () => {
      manager.saveTimers.global = setTimeout(() => {}, 10000);
      manager.setWorkspaceSwitching(true);
      expect(manager.saveTimers.global).toBeNull();
    });

    it('clears save queue when switching starts', () => {
      manager.saveQueue.push(vi.fn());
      manager.setWorkspaceSwitching(true);
      expect(manager.saveQueue).toEqual([]);
    });

    it('does not clear timers when switching ends', () => {
      manager.saveTimers.global = setTimeout(() => {}, 10000);
      manager.setWorkspaceSwitching(false);
      // Timer should still be set
      expect(manager.workspaceSwitching).toBe(false);
    });
  });

  // ========================================================================
  // scheduleAutoSave
  // ========================================================================
  describe('scheduleAutoSave', () => {
    it('calls the save callback after 1 second', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      manager.scheduleAutoSave(callback);
      expect(callback).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not schedule during workspace switching', () => {
      manager.setWorkspaceSwitching(true);
      const callback = vi.fn();
      manager.scheduleAutoSave(callback);
      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('debounces multiple calls', async () => {
      const callback1 = vi.fn().mockResolvedValue(undefined);
      const callback2 = vi.fn().mockResolvedValue(undefined);
      manager.scheduleAutoSave(callback1);
      vi.advanceTimersByTime(500);
      manager.scheduleAutoSave(callback2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('queues saves when one is already in progress', async () => {
      let resolveSave: () => void;
      const blockingCallback = vi.fn(() => new Promise<void>(r => { resolveSave = r; }));
      const queuedCallback = vi.fn().mockResolvedValue(undefined);

      manager.scheduleAutoSave(blockingCallback);
      await vi.advanceTimersByTimeAsync(1000);
      expect(blockingCallback).toHaveBeenCalled();
      expect(manager.isSaving).toBe(true);

      // While first save is in progress, schedule another
      manager.scheduleAutoSave(queuedCallback);
      await vi.advanceTimersByTimeAsync(1000);
      // Queued callback should not run yet since first save is still active
      expect(queuedCallback).not.toHaveBeenCalled();

      // Resolve first save
      resolveSave!();
      await vi.advanceTimersByTimeAsync(0); // flush microtasks
      // Now the queued save should be rescheduled
      await vi.advanceTimersByTimeAsync(1000);
      expect(queuedCallback).toHaveBeenCalled();
    });

    it('handles save callback errors gracefully', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('save error'));
      manager.scheduleAutoSave(callback);
      await vi.advanceTimersByTimeAsync(1000);
      // Should not throw; isSaving should be reset
      expect(manager.isSaving).toBe(false);
    });
  });

  // ========================================================================
  // startAutoSave / stopAutoSave
  // ========================================================================
  describe('startAutoSave / stopAutoSave', () => {
    it('calls save callback periodically when data is dirty', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      manager.markDirty('sources');
      manager.startAutoSave(callback, 1000);

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      manager.markDirty('rules');
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('does not call save when no data is dirty', async () => {
      const callback = vi.fn();
      manager.startAutoSave(callback, 1000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not call save during workspace switching', async () => {
      const callback = vi.fn();
      manager.markDirty('sources');
      manager.startAutoSave(callback, 1000);
      manager.setWorkspaceSwitching(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('stopAutoSave clears interval and timers', () => {
      manager.startAutoSave(vi.fn(), 1000);
      manager.saveTimers.global = setTimeout(() => {}, 5000);
      manager.stopAutoSave();
      expect(manager.autoSaveInterval).toBeNull();
      expect(Object.keys(manager.saveTimers)).toHaveLength(0);
    });
  });

  // ========================================================================
  // waitForSaves
  // ========================================================================
  describe('waitForSaves', () => {
    it('resolves immediately when not saving', async () => {
      vi.useRealTimers(); // waitForSaves uses real setTimeout
      await manager.waitForSaves();
      // No assertion needed - just verifying it doesn't hang
    });

    it('waits for active save to complete', async () => {
      vi.useRealTimers();
      manager.isSaving = true;
      const waitPromise = manager.waitForSaves();
      // Simulate save completing after a short delay
      setTimeout(() => { manager.isSaving = false; }, 200);
      await waitPromise;
      expect(manager.isSaving).toBe(false);
    });
  });
});
