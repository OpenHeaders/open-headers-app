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

const SyncManager = (
  await import('../../../../src/renderer/services/workspace/SyncManager')
).default;

describe('SyncManager', () => {
  let manager: InstanceType<typeof SyncManager>;
  let mockElectronAPI: {
    onWorkspaceSyncCompleted: ReturnType<typeof vi.fn> | undefined;
    loadFromStorage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockElectronAPI = {
      onWorkspaceSyncCompleted: vi.fn().mockReturnValue(() => {}),
      loadFromStorage: vi.fn(),
    };
    manager = new SyncManager(mockElectronAPI as ConstructorParameters<typeof SyncManager>[0]);
  });

  // ========================================================================
  // needsInitialSync
  // ========================================================================
  describe('needsInitialSync', () => {
    it('returns true when no data exists', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when data is empty string', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when data is whitespace', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('   ');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when data is empty array string', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('[]');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when parsed data is empty array', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('[]');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns false when data has sources', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue(
        JSON.stringify([{ sourceId: '1' }])
      );
      expect(await manager.needsInitialSync('ws-1')).toBe(false);
    });

    it('returns true when JSON is invalid', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('not json');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when storage throws', async () => {
      mockElectronAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('returns true when parsed data is not an array', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue('{"key": "value"}');
      expect(await manager.needsInitialSync('ws-1')).toBe(true);
    });

    it('loads from correct workspace path', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);
      await manager.needsInitialSync('ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockElectronAPI.loadFromStorage).toHaveBeenCalledWith(
        'workspaces/ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890/sources.json'
      );
    });

    it('returns false when data has enterprise sources array', async () => {
      mockElectronAPI.loadFromStorage.mockResolvedValue(
        JSON.stringify([
          { sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceType: 'http', sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token' },
          { sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json' },
        ])
      );
      expect(await manager.needsInitialSync('ws-prod')).toBe(false);
    });
  });

  // ========================================================================
  // setupSyncListener
  // ========================================================================
  describe('setupSyncListener', () => {
    it('returns cleanup function when electronAPI is available', () => {
      const unsubscribe = vi.fn();
      mockElectronAPI.onWorkspaceSyncCompleted!.mockReturnValue(unsubscribe);

      const cleanup = manager.setupSyncListener(vi.fn());
      expect(typeof cleanup).toBe('function');
    });

    it('returns noop when electronAPI is null', () => {
      // Intentionally null to test defensive guard
      const mgr = new SyncManager(null as unknown as ConstructorParameters<typeof SyncManager>[0]);
      const cleanup = mgr.setupSyncListener(vi.fn());
      expect(typeof cleanup).toBe('function');
      cleanup(); // should not throw
    });

    it('returns noop when onWorkspaceSyncCompleted is not available', () => {
      // Intentionally empty to test missing callback
      const mgr = new SyncManager({} as ConstructorParameters<typeof SyncManager>[0]);
      const cleanup = mgr.setupSyncListener(vi.fn());
      expect(typeof cleanup).toBe('function');
    });

    it('calls onSyncComplete for non-initial sync events', () => {
      let capturedCallback: Function;
      mockElectronAPI.onWorkspaceSyncCompleted!.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return vi.fn();
      });

      const onSyncComplete = vi.fn();
      manager.setupSyncListener(onSyncComplete);

      // Simulate non-initial sync event
      capturedCallback!({ workspaceId: 'ws-1', isInitialSync: false, success: true });
      expect(onSyncComplete).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        isInitialSync: false,
        success: true,
      });
    });

    it('skips initial sync events', () => {
      let capturedCallback: Function;
      mockElectronAPI.onWorkspaceSyncCompleted!.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return vi.fn();
      });

      const onSyncComplete = vi.fn();
      manager.setupSyncListener(onSyncComplete);

      // Simulate initial sync event
      capturedCallback!({ workspaceId: 'ws-1', isInitialSync: true, success: true });
      expect(onSyncComplete).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // waitForInitialSync
  // ========================================================================
  describe('waitForInitialSync', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves when sync event fires with matching workspace and success', async () => {
      vi.useFakeTimers();
      let capturedCallback: Function;
      mockElectronAPI.onWorkspaceSyncCompleted!.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return vi.fn();
      });
      // Prevent the interval from causing timeout
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);

      const promise = manager.waitForInitialSync('ws-1', 5000);

      // Simulate the sync event
      capturedCallback!({
        workspaceId: 'ws-1',
        isInitialSync: true,
        success: true,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when sync event fires with failure', async () => {
      vi.useFakeTimers();
      let capturedCallback: Function;
      mockElectronAPI.onWorkspaceSyncCompleted!.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return vi.fn();
      });
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);

      const promise = manager.waitForInitialSync('ws-1', 5000);

      capturedCallback!({
        workspaceId: 'ws-1',
        isInitialSync: true,
        success: false,
        error: 'Auth failed',
      });

      await expect(promise).rejects.toThrow('Auth failed');
    });

    it('ignores sync events for different workspaces', async () => {
      vi.useFakeTimers();
      let capturedCallback: Function;
      mockElectronAPI.onWorkspaceSyncCompleted!.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return vi.fn();
      });
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);

      const promise = manager.waitForInitialSync('ws-1', 2000);
      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const handled = promise.catch((e: Error) => { caughtError = e; });

      // Fire event for wrong workspace
      capturedCallback!({
        workspaceId: 'ws-2',
        isInitialSync: true,
        success: true,
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(3000);
      await handled;

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toBe('Sync timeout');
    });

    it('resolves via file check when data appears', async () => {
      vi.useFakeTimers();
      // No IPC listener
      mockElectronAPI.onWorkspaceSyncCompleted = undefined;

      let callCount = 0;
      mockElectronAPI.loadFromStorage.mockImplementation(() => {
        callCount++;
        if (callCount >= 2) {
          return Promise.resolve(JSON.stringify([{ sourceId: '1' }]));
        }
        return Promise.resolve(null);
      });

      const promise = manager.waitForInitialSync('ws-1', 10000);

      // Advance time to trigger file checks
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects on timeout', async () => {
      vi.useFakeTimers();
      mockElectronAPI.onWorkspaceSyncCompleted!.mockReturnValue(vi.fn());
      mockElectronAPI.loadFromStorage.mockResolvedValue(null);

      const promise = manager.waitForInitialSync('ws-1', 2000);
      // Attach catch handler immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const handled = promise.catch((e: Error) => { caughtError = e; });

      await vi.advanceTimersByTimeAsync(3000);
      await handled;

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toBe('Sync timeout');
    });
  });
});
