import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcInvokeEvent } from '../../../src/types/common';
import type { WorkspaceAuthData } from '../../../src/types/workspace';

// --- Mocks ---

const mockTestConnection = vi.fn().mockResolvedValue({ success: true });
const mockGetGitStatus = vi.fn().mockResolvedValue({ isInstalled: true, version: '2.43.0' });
const mockInstallGit = vi.fn().mockResolvedValue(true);
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockSyncWorkspace = vi.fn().mockResolvedValue({ success: true });
const mockCleanupRepository = vi.fn().mockResolvedValue(undefined);
const mockCommitConfiguration = vi.fn().mockResolvedValue({ success: true });
const mockCreateBranch = vi.fn().mockResolvedValue({ success: true });
const mockCheckWritePermissions = vi.fn().mockResolvedValue({ success: true });
const mockManualSync = vi.fn().mockResolvedValue({ success: true });
const mockGetWorkspaces = vi.fn().mockResolvedValue([]);

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (name: string) => `/tmp/open-headers-test/${name}`,
      getName: () => 'OpenHeaders',
      getVersion: () => '3.2.1-test',
      isPackaged: false,
      on: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      dock: { show: vi.fn().mockResolvedValue(undefined) },
    },
    BrowserWindow: Object.assign(vi.fn(), {
      getAllWindows: () => [],
      getFocusedWindow: () => null,
      fromWebContents: () => null,
    }),
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    Tray: vi.fn(),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
    shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
    screen: { getAllDisplays: () => [] },
    dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    systemPreferences: { getMediaAccessStatus: vi.fn() },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
  },
  app: {
    getPath: (name: string) => `/tmp/open-headers-test/${name}`,
    getName: () => 'OpenHeaders',
    getVersion: () => '3.2.1-test',
    on: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
    dock: { show: vi.fn().mockResolvedValue(undefined) },
  },
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: () => [],
    getFocusedWindow: () => null,
    fromWebContents: () => null,
  }),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ resize: vi.fn() })) },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  screen: { getAllDisplays: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  systemPreferences: { getMediaAccessStatus: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
}));

vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    getLogDirectory: () => '/tmp/logs',
  },
  setGlobalLogLevel: vi.fn(),
}));

vi.mock('../../../src/main/modules/app/lifecycle.js', () => ({
  default: {
    getGitSyncService: () => ({
      testConnection: mockTestConnection,
      getGitStatus: mockGetGitStatus,
      installGit: mockInstallGit,
      initialize: mockInitialize,
      syncWorkspace: mockSyncWorkspace,
      cleanupRepository: mockCleanupRepository,
      commitConfiguration: mockCommitConfiguration,
      createBranch: mockCreateBranch,
      checkWritePermissions: mockCheckWritePermissions,
    }),
    getWorkspaceSyncScheduler: () => ({
      manualSync: mockManualSync,
    }),
    getWorkspaceSettingsService: () => ({
      getWorkspaces: mockGetWorkspaces,
    }),
    getFileWatchers: () => new Map(),
  },
}));

vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
  default: { updateTray: vi.fn() },
}));

vi.mock('../../../src/services/websocket/ws-service.js', () => ({
  default: {
    broadcastVideoRecordingState: vi.fn(),
    broadcastRecordingHotkeyChange: vi.fn(),
  },
}));

vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue(null),
    readFile: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('auto-launch', () => {
  class MockAutoLaunch {
    enable = vi.fn().mockResolvedValue(undefined);
    disable = vi.fn().mockResolvedValue(undefined);
  }
  return { default: MockAutoLaunch };
});

import { GitHandlers } from '../../../src/main/modules/ipc/handlers/gitHandlers';

const mockEvent = {
  sender: {
    send: vi.fn(),
  },
} as unknown as IpcInvokeEvent;

describe('GitHandlers', () => {
  let handlers: GitHandlers;

  beforeEach(() => {
    handlers = new GitHandlers();
    vi.clearAllMocks();
  });

  describe('handleTestGitConnection', () => {
    it('tests connection with enterprise GitLab URL and token auth', async () => {
      const config = {
        url: 'https://gitlab.openheaders.io/platform/shared-headers.git',
        branch: 'workspace/production-env',
        authType: 'token' as const,
        authData: {
          token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
          tokenType: 'gitlab',
        },
      };

      mockTestConnection.mockResolvedValueOnce({
        success: true,
        message: 'Connection successful',
      });

      const result = await handlers.handleTestGitConnection(mockEvent, config);

      expect(result).toEqual({ success: true, message: 'Connection successful' });
      expect(mockTestConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://gitlab.openheaders.io/platform/shared-headers.git',
          branch: 'workspace/production-env',
          authType: 'token',
          onProgress: expect.any(Function),
        }),
      );
    });

    it('tests connection with SSH auth', async () => {
      const config = {
        url: 'git@github.com:openheaders/shared-config.git',
        branch: 'main',
        authType: 'ssh' as const,
        authData: {
          sshKeyPath: '/Users/jane.doe/.ssh/id_ed25519',
        },
      };

      mockTestConnection.mockResolvedValueOnce({ success: true });

      const result = await handlers.handleTestGitConnection(mockEvent, config);
      expect(result.success).toBe(true);
    });

    it('returns error when connection fails with auth error', async () => {
      mockTestConnection.mockResolvedValueOnce({
        success: false,
        error: 'Authentication failed: invalid token',
      });

      const result = await handlers.handleTestGitConnection(mockEvent, {
        url: 'https://gitlab.openheaders.io/private/repo.git',
        authType: 'token',
        authData: { token: 'expired-token' },
      });

      expect(result).toEqual({
        success: false,
        error: 'Authentication failed: invalid token',
      });
    });

    it('returns error when git sync service throws', async () => {
      mockTestConnection.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await handlers.handleTestGitConnection(mockEvent, {
        url: 'https://gitlab.openheaders.io/repo.git',
        authType: 'none',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('handleGetGitStatus', () => {
    it('returns installed status with version', async () => {
      mockGetGitStatus.mockResolvedValueOnce({
        isInstalled: true,
        version: '2.43.0',
        path: '/usr/bin/git',
      });

      const result = await handlers.handleGetGitStatus();
      expect(result).toEqual({
        isInstalled: true,
        version: '2.43.0',
        path: '/usr/bin/git',
      });
    });

    it('returns not installed status', async () => {
      mockGetGitStatus.mockResolvedValueOnce({
        isInstalled: false,
      });

      const result = await handlers.handleGetGitStatus();
      expect(result.isInstalled).toBe(false);
    });

    it('returns error status on exception', async () => {
      mockGetGitStatus.mockRejectedValueOnce(new Error('Command not found'));

      const result = await handlers.handleGetGitStatus();
      expect(result.isInstalled).toBe(false);
      expect(result.error).toContain('Command not found');
    });
  });

  describe('handleSyncGitWorkspace', () => {
    it('syncs via workspace sync scheduler when available', async () => {
      mockManualSync.mockResolvedValueOnce({
        success: true,
        hasChanges: true,
        commitInfo: { commitHash: 'abc123def456' },
      });

      const result = await handlers.handleSyncGitWorkspace(mockEvent, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      expect(result).toEqual({
        success: true,
        hasChanges: true,
        commitInfo: { commitHash: 'abc123def456' },
      });
      expect(mockManualSync).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('returns error on sync failure', async () => {
      mockManualSync.mockRejectedValueOnce(new Error('Merge conflict'));

      const result = await handlers.handleSyncGitWorkspace(mockEvent, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Merge conflict');
    });
  });

  describe('handleCleanupGitRepository', () => {
    it('cleans up repository and returns success', async () => {
      const result = await handlers.handleCleanupGitRepository(
        mockEvent,
        'https://gitlab.openheaders.io/platform/shared-headers.git',
      );

      expect(result).toEqual({ success: true });
      expect(mockCleanupRepository).toHaveBeenCalledWith('https://gitlab.openheaders.io/platform/shared-headers.git');
    });

    it('returns error on cleanup failure', async () => {
      mockCleanupRepository.mockRejectedValueOnce(new Error('Directory locked'));

      const result = await handlers.handleCleanupGitRepository(mockEvent, 'https://gitlab.openheaders.io/repo.git');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Directory locked');
    });
  });

  describe('handleCommitConfiguration', () => {
    it('commits configuration with enterprise data', async () => {
      const config = {
        url: 'https://gitlab.openheaders.io/platform/shared-headers.git',
        branch: 'workspace/production-env',
        path: 'config/open-headers.json',
        files: {
          'config/open-headers.json': '{"sources": [], "rules": {"header": []}}',
        },
        message: 'feat: add OAuth2 bearer token rule for api.partner-service.io',
        authType: 'token',
        authData: {
          token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
          tokenType: 'gitlab',
        } as WorkspaceAuthData,
      };

      mockCommitConfiguration.mockResolvedValueOnce({
        success: true,
        commitHash: 'a1b2c3d4e5f6789012345678',
      });

      const result = await handlers.handleCommitConfiguration(mockEvent, config);

      expect(result.success).toBe(true);
      expect(mockCommitConfiguration).toHaveBeenCalledWith(config);
    });

    it('returns error when commit fails', async () => {
      mockCommitConfiguration.mockResolvedValueOnce({
        success: false,
        error: 'Permission denied: push to protected branch',
      });

      const result = await handlers.handleCommitConfiguration(mockEvent, {
        url: 'https://gitlab.openheaders.io/repo.git',
        message: 'test commit',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('handleCreateBranch', () => {
    it('creates branch from base branch', async () => {
      mockCreateBranch.mockResolvedValueOnce({ success: true });

      const result = await handlers.handleCreateBranch(mockEvent, {
        repoDir: '/tmp/repos/shared-headers',
        branchName: 'workspace/staging-env',
        baseBranch: 'main',
      });

      expect(result).toEqual({ success: true });
      expect(mockCreateBranch).toHaveBeenCalledWith({
        repoDir: '/tmp/repos/shared-headers',
        branchName: 'workspace/staging-env',
        baseBranch: 'main',
      });
    });

    it('returns error on branch creation failure', async () => {
      mockCreateBranch.mockResolvedValueOnce({
        success: false,
        error: 'Branch already exists',
      });

      const result = await handlers.handleCreateBranch(mockEvent, {
        repoDir: '/tmp/repos/repo',
        branchName: 'existing-branch',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('handleCheckWritePermissions', () => {
    it('checks write permissions with token auth', async () => {
      mockCheckWritePermissions.mockResolvedValueOnce({
        success: true,
        canWrite: true,
      });

      const result = await handlers.handleCheckWritePermissions(mockEvent, {
        url: 'https://gitlab.openheaders.io/platform/shared-headers.git',
        branch: 'workspace/production-env',
        authType: 'token',
        authData: {
          token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
        },
      });

      expect(result.success).toBe(true);
    });

    it('returns error for read-only access', async () => {
      mockCheckWritePermissions.mockResolvedValueOnce({
        success: false,
        error: 'No write permissions on this repository',
      });

      const result = await handlers.handleCheckWritePermissions(mockEvent, {
        url: 'https://github.com/openheaders/public-repo.git',
        authType: 'token',
        authData: { token: 'read-only-token' },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('handleInstallGit', () => {
    it('returns success when Git installs successfully', async () => {
      mockInstallGit.mockResolvedValueOnce(true);

      const result = await handlers.handleInstallGit(mockEvent);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Git installed successfully');
    });

    it('returns error when Git installation fails', async () => {
      mockInstallGit.mockResolvedValueOnce(false);

      const result = await handlers.handleInstallGit(mockEvent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to install Git');
    });

    it('sends progress events to the renderer', async () => {
      mockInstallGit.mockImplementation(async (sendProgress: (msg: string) => void) => {
        sendProgress('Downloading Git...');
        sendProgress('Installing...');
        return true;
      });

      await handlers.handleInstallGit(mockEvent);

      expect(mockEvent.sender.send).toHaveBeenCalledWith('git-install-progress', {
        message: 'Checking system requirements...',
      });
    });
  });
});
