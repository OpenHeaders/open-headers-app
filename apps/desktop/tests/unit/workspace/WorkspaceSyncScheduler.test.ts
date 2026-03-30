import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '@/types/workspace';

// Mock electron
vi.mock('electron', () => ({
  default: {
    app: { getPath: () => '/tmp/test' },
    BrowserWindow: { getAllWindows: () => [] },
  },
  app: { getPath: () => '/tmp/test' },
  BrowserWindow: { getAllWindows: () => [] },
}));

// Mock mainLogger
vi.mock('@/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Mock atomicFileWriter
vi.mock('@/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue(null),
  },
}));

// Mock config/version
vi.mock('@/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
}));

// Mock EnvironmentSyncUtils
vi.mock('@/services/workspace/git/utils/EnvironmentSyncUtils.js', () => ({
  countNonEmptyEnvValues: vi.fn().mockReturnValue(0),
  readFileWithAtomicWriter: vi.fn().mockResolvedValue({ exists: false, content: null }),
  createBackupIfNeeded: vi.fn().mockResolvedValue(undefined),
  cleanupOldBackups: vi.fn().mockResolvedValue(undefined),
  extractVarData: vi.fn().mockReturnValue({ value: '', isSecret: false, hasNonEmptyValue: false }),
  validateEnvironmentWrite: vi
    .fn()
    .mockReturnValue({ safe: true, shouldBackup: false, shouldBlock: false, lossPercentage: 0 }),
  ENV_FILE_READ_MAX_RETRIES: 3,
}));

import type {
  GitSyncServiceLike as GitSyncService,
  NetworkServiceLike as NetworkService,
  WorkspaceSettingsServiceLike as WorkspaceSettingsServiceInterface,
} from '@/services/workspace/sync/types';
import { WorkspaceSyncScheduler } from '@/services/workspace/WorkspaceSyncScheduler';

/** Helper to access private fields for test assertions. */
function testable(s: WorkspaceSyncScheduler) {
  return s as unknown as {
    syncInProgress: Map<string, boolean>;
    activeWorkspaceId: string | null;
    activeWorkspace: Workspace | null;
    checkGitConnectivity(workspaceId: string, workspace: Workspace): Promise<boolean>;
  };
}

/** Create a minimal valid Workspace for tests. */
function testWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'OpenHeaders Staging Environment',
    type: 'git',
    ...overrides,
  };
}

// Helper to create mock services
function createMockGitSyncService() {
  return {
    getGitStatus: vi.fn().mockResolvedValue({ isInstalled: true }),
    syncWorkspace: vi.fn().mockResolvedValue({ success: true, data: null }),
    testConnection: vi.fn().mockResolvedValue({ success: true }),
  };
}

function createMockWorkspaceSettingsService() {
  return {
    getWorkspaces: vi.fn().mockResolvedValue([]),
    updateWorkspace: vi.fn().mockResolvedValue(undefined),
    updateSyncStatus: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockNetworkService(isOnline = true) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    getState: vi.fn().mockReturnValue({ isOnline }),
    _emit(event: string, ...args: unknown[]) {
      (listeners.get(event) || []).forEach((fn) => {
        fn(...args);
      });
    },
  } satisfies NetworkService & { _emit: (event: string, ...args: unknown[]) => void };
}

describe('WorkspaceSyncScheduler', () => {
  let gitSync: ReturnType<typeof createMockGitSyncService>;
  let settingsService: ReturnType<typeof createMockWorkspaceSettingsService>;
  let networkService: ReturnType<typeof createMockNetworkService>;
  let broadcaster: ReturnType<typeof vi.fn>;
  let scheduler: WorkspaceSyncScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    gitSync = createMockGitSyncService();
    settingsService = createMockWorkspaceSettingsService();
    networkService = createMockNetworkService(true);
    broadcaster = vi.fn();
    scheduler = new WorkspaceSyncScheduler(
      gitSync as unknown as GitSyncService,
      settingsService as unknown as WorkspaceSettingsServiceInterface,
      networkService as unknown as NetworkService,
      { broadcaster } as ConstructorParameters<typeof WorkspaceSyncScheduler>[3],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize()', () => {
    it('registers semantic network event listeners', async () => {
      await scheduler.initialize();
      expect(networkService.on).toHaveBeenCalledWith('offline', expect.any(Function));
      expect(networkService.on).toHaveBeenCalledWith('online', expect.any(Function));
    });
  });

  describe('startSync()', () => {
    it('does not start sync when network is offline', () => {
      networkService.getState.mockReturnValue({ isOnline: false });
      // performSync resolves workspace internally — give it something to find
      settingsService.getWorkspaces.mockResolvedValue([testWorkspace({ id: 'ws-1' })]);
      scheduler.startSync('ws-1');
      // The initial performSync fires but network check in preflight blocks it
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('does not schedule duplicate syncs for same workspace', () => {
      scheduler.startSync('ws-1');
      scheduler.startSync('ws-1');
      // Second call should not create a new timer (idempotent)
    });
  });

  describe('stopSync()', () => {
    it('clears sync timer for workspace', () => {
      scheduler.startSync('ws-1');
      scheduler.stopSync('ws-1');
      // Should be able to start again after stopping without error
      scheduler.startSync('ws-1');
    });

    it('does nothing for workspace with no timer', () => {
      // Should not throw
      expect(() => scheduler.stopSync('nonexistent')).not.toThrow();
    });
  });

  describe('performSync()', () => {
    it('returns skipped:already_in_progress when sync already in progress', async () => {
      testable(scheduler).syncInProgress.set('ws-1', true);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'skipped', reason: 'already_in_progress' });
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('returns skipped:workspace_not_found when workspace missing', async () => {
      settingsService.getWorkspaces.mockResolvedValue([]);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'skipped', reason: 'workspace_not_found' });
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('returns skipped:workspace_not_syncable for personal workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([testWorkspace({ id: 'ws-1', type: 'personal' })]);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'skipped', reason: 'workspace_not_syncable' });
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('returns skipped:network_offline when network is offline', async () => {
      networkService.getState.mockReturnValue({ isOnline: false });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'skipped', reason: 'network_offline' });
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('returns skipped:git_not_installed when git is not installed', async () => {
      gitSync.getGitStatus.mockResolvedValue({ isInstalled: false });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'skipped', reason: 'git_not_installed' });
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('returns completed outcome on successful sync', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      const result = await scheduler.performSync('ws-1');
      expect(result).toEqual({ outcome: 'completed' });
    });

    it('calls syncWorkspace with correct config', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({
          id: 'ws-1',
          name: 'My Team',
          gitUrl: 'https://github.com/test/repo',
          gitBranch: 'develop',
          gitPath: 'custom/path.json',
          authType: 'token',
          authData: { token: 'abc' },
        }),
      ]);

      await scheduler.performSync('ws-1');

      expect(gitSync.syncWorkspace).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        workspaceName: 'My Team',
        url: 'https://github.com/test/repo',
        branch: 'develop',
        path: 'custom/path.json',
        authType: 'token',
        authData: { token: 'abc' },
      });
    });

    it('uses default values for missing config fields', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/test/repo' }),
      ]);

      await scheduler.performSync('ws-1');

      expect(gitSync.syncWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'main',
          path: 'config/open-headers.json',
          authType: 'none',
          authData: {},
        }),
      );
    });

    it('broadcasts sync error on failure', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: false, error: 'auth failed' });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);

      await scheduler.performSync('ws-1');

      expect(broadcaster).toHaveBeenCalledWith(
        'workspace-sync-completed',
        expect.objectContaining({
          workspaceId: 'ws-1',
          success: false,
          error: 'auth failed',
        }),
      );
    });

    it('clears syncInProgress flag after completion', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      await scheduler.performSync('ws-1');
      expect(testable(scheduler).syncInProgress.get('ws-1')).toBe(false);
    });

    it('clears syncInProgress flag even on error', async () => {
      gitSync.syncWorkspace.mockRejectedValue(new Error('network error'));
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      await scheduler.performSync('ws-1');
      expect(testable(scheduler).syncInProgress.get('ws-1')).toBe(false);
    });

    it('reads workspace from settings at call time, not from closure', async () => {
      // First call: workspace has token auth
      settingsService.getWorkspaces.mockResolvedValueOnce([
        testWorkspace({
          id: 'ws-1',
          gitUrl: 'https://github.com/openheaders/test',
          authType: 'token',
          authData: { token: 'old-token' },
        }),
      ]);
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1');

      expect(gitSync.syncWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: 'token',
          authData: { token: 'old-token' },
        }),
      );

      // Second call: workspace auth was rotated
      settingsService.getWorkspaces.mockResolvedValueOnce([
        testWorkspace({
          id: 'ws-1',
          gitUrl: 'https://github.com/openheaders/test',
          authType: 'token',
          authData: { token: 'new-token' },
        }),
      ]);
      await scheduler.performSync('ws-1');

      expect(gitSync.syncWorkspace).toHaveBeenLastCalledWith(
        expect.objectContaining({
          authData: { token: 'new-token' },
        }),
      );
    });
  });

  describe('onWorkspaceSwitch()', () => {
    it('stops sync for previous workspace', async () => {
      const stopSyncSpy = vi.spyOn(scheduler, 'stopSync');
      testable(scheduler).activeWorkspaceId = 'old-ws';

      settingsService.getWorkspaces.mockResolvedValue([testWorkspace({ id: 'new-ws', name: 'New', type: 'personal' })]);

      await scheduler.onWorkspaceSwitch('new-ws');
      expect(stopSyncSpy).toHaveBeenCalledWith('old-ws');
    });

    it('starts sync for git workspace with autoSync', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([testWorkspace({ id: 'git-ws', name: 'Team', autoSync: true })]);

      await scheduler.onWorkspaceSwitch('git-ws');
      expect(startSyncSpy).toHaveBeenCalledWith('git-ws', { skipInitialSync: undefined });
    });

    it('does not start sync for personal workspace', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'personal', name: 'Personal', type: 'personal' }),
      ]);

      await scheduler.onWorkspaceSwitch('personal');
      expect(startSyncSpy).not.toHaveBeenCalled();
    });

    it('does not start sync when autoSync is false', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([testWorkspace({ id: 'git-ws', name: 'Team', autoSync: false })]);

      await scheduler.onWorkspaceSwitch('git-ws');
      expect(startSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('onWorkspaceUpdated()', () => {
    it('restarts sync when autoSync is toggled on', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      testable(scheduler).activeWorkspaceId = 'ws-1';
      testable(scheduler).activeWorkspace = testWorkspace();

      await scheduler.onWorkspaceUpdated('ws-1', testWorkspace({ autoSync: true }));
      expect(startSyncSpy).toHaveBeenCalledWith('ws-1');
    });

    it('does not restart sync for non-active workspace', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      testable(scheduler).activeWorkspaceId = 'other-ws';

      await scheduler.onWorkspaceUpdated('ws-1', testWorkspace({ autoSync: true }));
      expect(startSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('manualSync()', () => {
    it('returns error for nonexistent workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([]);
      const result = await scheduler.manualSync('missing');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace not found');
    });

    it('returns error for non-git workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'personal', name: 'Personal', type: 'personal' }),
      ]);
      const result = await scheduler.manualSync('personal');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Only Git/Team workspaces can be synced');
    });

    it('performs sync for git workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'git-ws', name: 'Team', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      const result = await scheduler.manualSync('git-ws');
      expect(result.success).toBe(true);
    });

    it('returns error when network is offline', async () => {
      networkService.getState.mockReturnValue({ isOnline: false });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      const result = await scheduler.manualSync('ws-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network is offline');
    });

    it('allows manual sync for team workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'team-ws', name: 'Team', type: 'team', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      const result = await scheduler.manualSync('team-ws');
      expect(result.success).toBe(true);
    });
  });

  describe('getSyncStatus()', () => {
    it('returns empty status when no syncs scheduled', () => {
      const status = scheduler.getSyncStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });

    it('returns status for scheduled workspace', () => {
      scheduler.startSync('ws-1', { skipInitialSync: true });
      const status = scheduler.getSyncStatus();
      expect(status['ws-1']).toBeDefined();
      expect(status['ws-1'].scheduled).toBe(true);
      expect(status['ws-1'].syncing).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('clears all sync timers', async () => {
      scheduler.startSync('ws-1', { skipInitialSync: true });
      scheduler.startSync('ws-2', { skipInitialSync: true });

      await scheduler.shutdown();

      const status = scheduler.getSyncStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });
  });

  describe('checkGitConnectivity()', () => {
    it('caches connectivity results', async () => {
      gitSync.testConnection.mockResolvedValue({ success: true });
      const workspace = testWorkspace({ gitUrl: 'https://github.com/openheaders/test' });

      const result1 = await testable(scheduler).checkGitConnectivity('ws-1', workspace);
      const result2 = await testable(scheduler).checkGitConnectivity('ws-1', workspace);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // Should only call testConnection once due to caching
      expect(gitSync.testConnection).toHaveBeenCalledTimes(1);
    });

    it('returns false when connectivity check fails', async () => {
      gitSync.testConnection.mockRejectedValue(new Error('timeout'));
      const workspace = testWorkspace({ gitUrl: 'https://github.com/openheaders/test' });

      const result = await testable(scheduler).checkGitConnectivity('ws-1', workspace);
      expect(result).toBe(false);
    });
  });

  describe('setSyncStatusOwner()', () => {
    it('routes sync status updates to syncStatusOwner instead of WorkspaceSettingsService', async () => {
      const syncStatusOwner = { updateSyncStatus: vi.fn() };
      scheduler.setSyncStatusOwner(syncStatusOwner);

      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      await scheduler.performSync('ws-1');

      // syncStatusOwner should have received the status update
      expect(syncStatusOwner.updateSyncStatus).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          syncing: false,
        }),
      );

      // WorkspaceSettingsService should NOT have been called for sync status
      expect(settingsService.updateSyncStatus).not.toHaveBeenCalled();
    });

    it('falls back to WorkspaceSettingsService when no syncStatusOwner is set', async () => {
      // Don't call setSyncStatusOwner — should fall back
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      await scheduler.performSync('ws-1');

      expect(settingsService.updateSyncStatus).toHaveBeenCalled();
    });

    it('routes error sync status to syncStatusOwner', async () => {
      const syncStatusOwner = { updateSyncStatus: vi.fn() };
      scheduler.setSyncStatusOwner(syncStatusOwner);

      gitSync.syncWorkspace.mockRejectedValue(new Error('auth failed'));
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'ws-1', gitUrl: 'https://github.com/openheaders/test' }),
      ]);
      await scheduler.performSync('ws-1');

      expect(syncStatusOwner.updateSyncStatus).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          syncing: false,
          error: 'auth failed',
        }),
      );
    });
  });
});
