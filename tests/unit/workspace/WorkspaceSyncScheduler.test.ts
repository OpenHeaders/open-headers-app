import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Workspace } from '../../../src/types/workspace';

// Mock electron
vi.mock('electron', () => ({
  default: {
    app: { getPath: () => '/tmp/test' },
    BrowserWindow: { getAllWindows: () => [] }
  },
  app: { getPath: () => '/tmp/test' },
  BrowserWindow: { getAllWindows: () => [] }
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })
  }
}));

// Mock atomicFileWriter
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue(null)
  }
}));

// Mock config/version
vi.mock('../../../src/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0'
}));

// Mock EnvironmentSyncUtils
vi.mock('../../../src/services/workspace/git/utils/EnvironmentSyncUtils.js', () => ({
  countNonEmptyEnvValues: vi.fn().mockReturnValue(0),
  readFileWithAtomicWriter: vi.fn().mockResolvedValue({ exists: false, content: null }),
  createBackupIfNeeded: vi.fn().mockResolvedValue(undefined),
  cleanupOldBackups: vi.fn().mockResolvedValue(undefined),
  extractVarData: vi.fn().mockReturnValue({ value: '', isSecret: false, hasNonEmptyValue: false }),
  validateEnvironmentWrite: vi.fn().mockReturnValue({ safe: true, shouldBackup: false, shouldBlock: false, lossPercentage: 0 }),
  ENV_FILE_READ_MAX_RETRIES: 3
}));

import { WorkspaceSyncScheduler } from '../../../src/services/workspace/WorkspaceSyncScheduler';
import type {
  GitSyncServiceLike as GitSyncService,
  WorkspaceSettingsServiceLike as WorkspaceSettingsServiceInterface,
  NetworkServiceLike as NetworkService,
} from '../../../src/services/workspace/sync/types';

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
    testConnection: vi.fn().mockResolvedValue({ success: true })
  };
}

function createMockWorkspaceSettingsService() {
  return {
    getWorkspaces: vi.fn().mockResolvedValue([]),
    updateWorkspace: vi.fn().mockResolvedValue(undefined),
    updateSyncStatus: vi.fn().mockResolvedValue(undefined)
  };
}

interface NetworkStateChange {
  newState: { isOnline: boolean };
  oldState: { isOnline: boolean };
}

function createMockNetworkService(isOnline = true) {
  const listeners = new Map<string, ((event: NetworkStateChange) => void)[]>();
  return {
    on: vi.fn((event: string, handler: (event: NetworkStateChange) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    getState: vi.fn().mockReturnValue({ isOnline }),
    _emit(event: string, data: NetworkStateChange) {
      (listeners.get(event) || []).forEach(fn => fn(data));
    }
  } satisfies NetworkService & { _emit: (event: string, data: NetworkStateChange) => void };
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
      { broadcaster } as ConstructorParameters<typeof WorkspaceSyncScheduler>[3]
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize()', () => {
    it('registers network state change listener', async () => {
      await scheduler.initialize();
      expect(networkService.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));
    });
  });

  describe('startSync()', () => {
    it('does not start sync when network is offline', () => {
      networkService.getState.mockReturnValue({ isOnline: false });
      scheduler.startSync('ws-1', testWorkspace());
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('does not schedule duplicate syncs for same workspace', () => {
      const workspace = testWorkspace();
      scheduler.startSync('ws-1', workspace);
      scheduler.startSync('ws-1', workspace);
      // Second call should not create a new timer (idempotent)
    });
  });

  describe('stopSync()', () => {
    it('clears sync timer for workspace', () => {
      const workspace = testWorkspace();
      scheduler.startSync('ws-1', workspace);
      scheduler.stopSync('ws-1');
      // Should be able to start again after stopping without error
      scheduler.startSync('ws-1', workspace);
    });

    it('does nothing for workspace with no timer', () => {
      // Should not throw
      expect(() => scheduler.stopSync('nonexistent')).not.toThrow();
    });
  });

  describe('performSync()', () => {
    it('skips when sync already in progress', async () => {
      // Manually set sync in progress
      testable(scheduler).syncInProgress.set('ws-1', true);
      await scheduler.performSync('ws-1', testWorkspace());
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('skips when network is offline', async () => {
      networkService.getState.mockReturnValue({ isOnline: false });
      await scheduler.performSync('ws-1', testWorkspace());
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('skips when git is not installed', async () => {
      gitSync.getGitStatus.mockResolvedValue({ isInstalled: false });
      await scheduler.performSync('ws-1', testWorkspace());
      expect(gitSync.syncWorkspace).not.toHaveBeenCalled();
    });

    it('calls syncWorkspace with correct config', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1', testWorkspace({
        name: 'My Team',
        gitUrl: 'https://github.com/test/repo',
        gitBranch: 'develop',
        gitPath: 'custom/path.json',
        authType: 'token',
        authData: { token: 'abc' }
      }));

      expect(gitSync.syncWorkspace).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        workspaceName: 'My Team',
        url: 'https://github.com/test/repo',
        branch: 'develop',
        path: 'custom/path.json',
        authType: 'token',
        authData: { token: 'abc' }
      });
    });

    it('uses default values for missing config fields', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1', testWorkspace({
        gitUrl: 'https://github.com/test/repo'
      }));

      expect(gitSync.syncWorkspace).toHaveBeenCalledWith(expect.objectContaining({
        branch: 'main',
        path: 'config/open-headers.json',
        authType: 'none',
        authData: {}
      }));
    });

    it('broadcasts sync error on failure', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: false, error: 'auth failed' });
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'url' }));

      expect(broadcaster).toHaveBeenCalledWith('workspace-sync-completed', expect.objectContaining({
        workspaceId: 'ws-1',
        success: false,
        error: 'auth failed'
      }));
    });

    it('clears syncInProgress flag after completion', async () => {
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'url' }));
      expect(testable(scheduler).syncInProgress.get('ws-1')).toBe(false);
    });

    it('clears syncInProgress flag even on error', async () => {
      gitSync.syncWorkspace.mockRejectedValue(new Error('network error'));
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'url' }));
      expect(testable(scheduler).syncInProgress.get('ws-1')).toBe(false);
    });
  });

  describe('onWorkspaceSwitch()', () => {
    it('stops sync for previous workspace', async () => {
      const stopSyncSpy = vi.spyOn(scheduler, 'stopSync');
      testable(scheduler).activeWorkspaceId = 'old-ws';

      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'new-ws', name: 'New', type: 'personal' })
      ]);

      await scheduler.onWorkspaceSwitch('new-ws');
      expect(stopSyncSpy).toHaveBeenCalledWith('old-ws');
    });

    it('starts sync for git workspace with autoSync', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'git-ws', name: 'Team', autoSync: true })
      ]);

      await scheduler.onWorkspaceSwitch('git-ws');
      expect(startSyncSpy).toHaveBeenCalledWith('git-ws', expect.objectContaining({ type: 'git' }), { skipInitialSync: undefined });
    });

    it('does not start sync for personal workspace', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'personal', name: 'Personal', type: 'personal' })
      ]);

      await scheduler.onWorkspaceSwitch('personal');
      expect(startSyncSpy).not.toHaveBeenCalled();
    });

    it('does not start sync when autoSync is false', async () => {
      const startSyncSpy = vi.spyOn(scheduler, 'startSync');
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'git-ws', name: 'Team', autoSync: false })
      ]);

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
      expect(startSyncSpy).toHaveBeenCalledWith('ws-1', expect.objectContaining({ autoSync: true }));
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
      expect(result.error).toContain('not found');
    });

    it('returns error for non-git workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'personal', name: 'Personal', type: 'personal' })
      ]);
      const result = await scheduler.manualSync('personal');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Only Git/Team');
    });

    it('performs sync for git workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'git-ws', name: 'Team', gitUrl: 'url' })
      ]);
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      const result = await scheduler.manualSync('git-ws');
      expect(result.success).toBe(true);
    });

    it('allows manual sync for team workspace', async () => {
      settingsService.getWorkspaces.mockResolvedValue([
        testWorkspace({ id: 'team-ws', name: 'Team', type: 'team', gitUrl: 'url' })
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
      scheduler.startSync('ws-1', testWorkspace());
      const status = scheduler.getSyncStatus();
      expect(status['ws-1']).toBeDefined();
      expect(status['ws-1'].scheduled).toBe(true);
      expect(status['ws-1'].syncing).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('clears all sync timers', async () => {
      scheduler.startSync('ws-1', testWorkspace({ name: 'Test1' }));
      scheduler.startSync('ws-2', testWorkspace({ name: 'Test2' }));

      await scheduler.shutdown();

      const status = scheduler.getSyncStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });
  });

  describe('checkGitConnectivity()', () => {
    it('caches connectivity results', async () => {
      gitSync.testConnection.mockResolvedValue({ success: true });
      const workspace = testWorkspace({ gitUrl: 'https://github.com/test' });

      const result1 = await testable(scheduler).checkGitConnectivity('ws-1', workspace);
      const result2 = await testable(scheduler).checkGitConnectivity('ws-1', workspace);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // Should only call testConnection once due to caching
      expect(gitSync.testConnection).toHaveBeenCalledTimes(1);
    });

    it('returns false when connectivity check fails', async () => {
      gitSync.testConnection.mockRejectedValue(new Error('timeout'));
      const workspace = testWorkspace({ gitUrl: 'https://github.com/test' });

      const result = await testable(scheduler).checkGitConnectivity('ws-1', workspace);
      expect(result).toBe(false);
    });
  });

  describe('setSyncStatusOwner()', () => {
    it('routes sync status updates to syncStatusOwner instead of WorkspaceSettingsService', async () => {
      const syncStatusOwner = { updateSyncStatus: vi.fn() };
      scheduler.setSyncStatusOwner(syncStatusOwner);

      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'https://github.com/openheaders/test' }));

      // syncStatusOwner should have received the status update
      expect(syncStatusOwner.updateSyncStatus).toHaveBeenCalledWith('ws-1', expect.objectContaining({
        syncing: false
      }));

      // WorkspaceSettingsService should NOT have been called for sync status
      expect(settingsService.updateSyncStatus).not.toHaveBeenCalled();
    });

    it('falls back to WorkspaceSettingsService when no syncStatusOwner is set', async () => {
      // Don't call setSyncStatusOwner — should fall back
      gitSync.syncWorkspace.mockResolvedValue({ success: true });
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'https://github.com/openheaders/test' }));

      expect(settingsService.updateSyncStatus).toHaveBeenCalled();
    });

    it('routes error sync status to syncStatusOwner', async () => {
      const syncStatusOwner = { updateSyncStatus: vi.fn() };
      scheduler.setSyncStatusOwner(syncStatusOwner);

      gitSync.syncWorkspace.mockRejectedValue(new Error('auth failed'));
      await scheduler.performSync('ws-1', testWorkspace({ gitUrl: 'https://github.com/openheaders/test' }));

      expect(syncStatusOwner.updateSyncStatus).toHaveBeenCalledWith('ws-1', expect.objectContaining({
        syncing: false,
        error: 'auth failed'
      }));
    });
  });
});
