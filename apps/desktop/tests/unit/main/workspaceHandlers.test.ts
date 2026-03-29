import { beforeEach, describe, expect, it, vi } from 'vitest';
import zlib from 'zlib';
import { DATA_FORMAT_VERSION } from '../../../src/config/version';
import type { IpcInvokeEvent } from '../../../src/types/common';
import type { EnvironmentSchema } from '../../../src/types/environment';
import type { Workspace } from '../../../src/types/workspace';

// --- Mocks ---

const mockFsAccess = vi.fn();
const mockFsRm = vi.fn().mockResolvedValue(undefined);
const mockFsReadFile = vi.fn();
const mockFsMkdir = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (name: string) => `/tmp/open-headers-test/${name}`,
      getName: () => 'OpenHeaders',
      getVersion: () => '3.2.1-test',
      isPackaged: false,
      dock: { show: vi.fn().mockResolvedValue(undefined) },
      on: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(''),
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
    screen: { getAllDisplays: () => [] },
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({}),
      showSaveDialog: vi.fn().mockResolvedValue({}),
    },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
    globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
  },
  app: {
    getPath: (name: string) => `/tmp/open-headers-test/${name}`,
    getName: () => 'OpenHeaders',
    getVersion: () => '3.2.1-test',
    dock: { show: vi.fn().mockResolvedValue(undefined) },
    on: vi.fn(),
    setAsDefaultProtocolClient: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
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
  screen: { getAllDisplays: () => [] },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({}),
    showSaveDialog: vi.fn().mockResolvedValue({}),
  },
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), isRegistered: vi.fn() },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    promises: {
      access: (...args: unknown[]) => mockFsAccess(...args),
      rm: (...args: unknown[]) => mockFsRm(...args),
      readFile: (...args: unknown[]) => mockFsReadFile(...args),
      mkdir: (...args: unknown[]) => mockFsMkdir(...args),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  promises: {
    access: (...args: unknown[]) => mockFsAccess(...args),
    rm: (...args: unknown[]) => mockFsRm(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
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

vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: vi.fn().mockResolvedValue(undefined),
    readJson: vi.fn().mockResolvedValue(null),
    readFile: vi.fn().mockResolvedValue(null),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/main/modules/tray/trayManager.js', () => ({
  default: { updateTray: vi.fn() },
}));

const mockManualSync = vi.fn().mockResolvedValue({ success: true });
const mockGetSyncStatus = vi.fn().mockResolvedValue({});
const mockOnWorkspaceSwitch = vi.fn().mockResolvedValue(undefined);
const mockOnWorkspaceUpdated = vi.fn().mockResolvedValue(undefined);
const mockGetWorkspaces = vi.fn().mockResolvedValue([]);
const mockGetGitStatus = vi.fn().mockResolvedValue({ isInstalled: true });
const mockSyncWorkspace = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../../src/main/modules/app/lifecycle.js', () => ({
  default: {
    getGitSyncService: () => ({
      getGitStatus: mockGetGitStatus,
      syncWorkspace: mockSyncWorkspace,
      testConnection: vi.fn().mockResolvedValue({ success: true }),
    }),
    getWorkspaceSyncScheduler: () => ({
      manualSync: mockManualSync,
      getSyncStatus: mockGetSyncStatus,
      onWorkspaceSwitch: mockOnWorkspaceSwitch,
      onWorkspaceUpdated: mockOnWorkspaceUpdated,
    }),
    getWorkspaceSettingsService: () => ({
      getWorkspaces: mockGetWorkspaces,
    }),
    getFileWatchers: () => new Map(),
  },
}));

vi.mock('../../../src/services/websocket/ws-service.js', () => ({
  default: {
    broadcastVideoRecordingState: vi.fn(),
    broadcastRecordingHotkeyChange: vi.fn(),
    getConnectionStatus: vi.fn(() => ({
      totalConnections: 0,
      browserCounts: {},
      clients: [],
      wsServerRunning: false,
      wsPort: 59210,
    })),
    onWorkspaceSwitch: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/proxy/ProxyService.js', () => ({
  default: {
    getStatus: vi.fn().mockResolvedValue({ isRunning: false }),
    switchWorkspace: vi.fn().mockResolvedValue(undefined),
    updateEnvironmentVariables: vi.fn(),
    updateSources: vi.fn(),
    updateHeaderRules: vi.fn(),
  },
}));

vi.mock('../../../src/services/network/NetworkService.js', () => ({
  default: {
    getState: () => ({ isOnline: true, networkQuality: 'good' }),
  },
}));

vi.mock('../../../src/services/core/ServiceRegistry.js', () => ({
  default: {
    getStatus: () => ({}),
  },
}));

vi.mock('../../../src/main/modules/ipc/handlers/settingsHandlers.js', () => ({
  default: {
    handleGetSettings: vi.fn().mockResolvedValue({
      autoSyncWorkspaces: true,
    }),
  },
}));

vi.mock('auto-launch', () => {
  class MockAutoLaunch {
    enable = vi.fn().mockResolvedValue(undefined);
    disable = vi.fn().mockResolvedValue(undefined);
  }
  return { default: MockAutoLaunch };
});

import { WorkspaceHandlers } from '../../../src/main/modules/ipc/handlers/workspaceHandlers';

const mockEvent = {
  sender: { send: vi.fn() },
} as unknown as IpcInvokeEvent;

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'OpenHeaders — Production Configuration',
    type: 'git',
    gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
    gitBranch: 'workspace/production-env',
    gitPath: 'config/open-headers.json',
    authType: 'token',
    authData: {
      token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
      tokenType: 'gitlab',
    },
    description: 'Production header configuration managed by the platform team',
    createdAt: '2025-11-15T09:30:00.000Z',
    updatedAt: '2026-01-20T14:45:12.345Z',
    ...overrides,
  };
}

describe('WorkspaceHandlers', () => {
  let handlers: WorkspaceHandlers;

  beforeEach(() => {
    handlers = new WorkspaceHandlers();
    vi.clearAllMocks();
  });

  describe('generateInviteId()', () => {
    it('produces a 16-char hex string', () => {
      const id = handlers.generateInviteId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set(Array.from({ length: 20 }, () => handlers.generateInviteId()));
      expect(ids.size).toBe(20);
    });
  });

  describe('getUserName()', () => {
    it('returns a non-empty string', async () => {
      const name = await handlers.getUserName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  describe('handleDeleteWorkspaceFolder', () => {
    it('returns success when folder does not exist', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await handlers.handleDeleteWorkspaceFolder(mockEvent, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toEqual({ success: true });
    });

    it('deletes existing folder and returns success', async () => {
      mockFsAccess.mockResolvedValueOnce(undefined);
      mockFsRm.mockResolvedValueOnce(undefined);

      const result = await handlers.handleDeleteWorkspaceFolder(mockEvent, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toEqual({ success: true });
      expect(mockFsRm).toHaveBeenCalledWith(expect.stringContaining('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), {
        recursive: true,
        force: true,
      });
    });
  });

  describe('handleWorkspaceSync', () => {
    it('delegates to workspaceSyncScheduler.manualSync', async () => {
      mockManualSync.mockResolvedValueOnce({ success: true, hasChanges: true });

      const result = await handlers.handleWorkspaceSync(mockEvent, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toEqual({ success: true, hasChanges: true });
      expect(mockManualSync).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  describe('handleWorkspaceSyncAll', () => {
    it('returns not-yet-supported error', async () => {
      const result = await handlers.handleWorkspaceSyncAll();
      expect(result).toEqual({ success: false, error: 'Sync all workspaces not yet supported' });
    });
  });

  describe('handleWorkspaceGetSyncStatus', () => {
    it('returns sync status from scheduler', async () => {
      const status = {
        'ws-1': { syncing: false, lastSync: '2026-01-20T14:45:12.345Z' },
      };
      mockGetSyncStatus.mockResolvedValueOnce(status);

      const result = await handlers.handleWorkspaceGetSyncStatus();
      expect(result).toEqual(status);
    });
  });

  describe('handleWorkspaceAutoSyncEnabled', () => {
    it('returns true by default', async () => {
      const result = await handlers.handleWorkspaceAutoSyncEnabled();
      expect(result).toBe(true);
    });
  });

  describe('handleGenerateTeamWorkspaceInvite', () => {
    it('generates invite with all fields populated', async () => {
      const workspace = makeWorkspace({ includeAuthData: false } as Partial<Workspace>);

      const result = await handlers.handleGenerateTeamWorkspaceInvite(
        mockEvent,
        workspace as Workspace & { includeAuthData?: boolean },
      );

      expect(result.success).toBe(true);
      expect(result.inviteData).toBeDefined();
      expect(result.inviteData!.version).toBe(DATA_FORMAT_VERSION);
      expect(result.inviteData!.workspaceName).toBe('OpenHeaders — Production Configuration');
      expect(result.inviteData!.repoUrl).toBe('https://gitlab.openheaders.io/platform/shared-headers.git');
      expect(result.inviteData!.branch).toBe('workspace/production-env');
      expect(result.inviteData!.configPath).toBe('config/open-headers.json');
      expect(result.inviteData!.authType).toBe('token');
      expect(result.inviteData!.inviterName).toBeDefined();
      expect(result.inviteData!.inviteId).toMatch(/^[0-9a-f]{16}$/);
      expect(result.inviteData!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes authData when includeAuthData is true', async () => {
      const workspace = makeWorkspace();

      const result = await handlers.handleGenerateTeamWorkspaceInvite(mockEvent, {
        ...workspace,
        includeAuthData: true,
      });

      expect(result.success).toBe(true);
      expect(result.inviteData!.authData).toEqual({
        token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
        tokenType: 'gitlab',
      });
    });

    it('omits authData when includeAuthData is false', async () => {
      const workspace = makeWorkspace();

      const result = await handlers.handleGenerateTeamWorkspaceInvite(mockEvent, {
        ...workspace,
        includeAuthData: false,
      });

      expect(result.success).toBe(true);
      expect(result.inviteData!.authData).toBeUndefined();
    });

    it('generates both app and web links with compressed payload', async () => {
      const workspace = makeWorkspace();

      const result = await handlers.handleGenerateTeamWorkspaceInvite(mockEvent, {
        ...workspace,
        includeAuthData: false,
      });

      expect(result.links).toBeDefined();
      expect(result.links!.appLink).toMatch(/^openheaders:\/\/open\?payload=/);
      expect(result.links!.webLink).toMatch(/^https:\/\/openheaders\.io\/join\?payload=/);
    });

    it('payload is decompressible back to original data', async () => {
      const workspace = makeWorkspace();

      const result = await handlers.handleGenerateTeamWorkspaceInvite(mockEvent, {
        ...workspace,
        includeAuthData: false,
      });

      const encoded = result.links!.appLink.split('payload=')[1];
      const decompressed = zlib.gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8');
      const parsed = JSON.parse(decompressed);

      expect(parsed.action).toBe('team-invite');
      expect(parsed.version).toBe(DATA_FORMAT_VERSION);
      expect(parsed.data.workspaceName).toBe('OpenHeaders — Production Configuration');
    });

    it('defaults branch and configPath when not specified', async () => {
      const workspace = makeWorkspace({
        gitBranch: undefined,
        gitPath: undefined,
      });

      const result = await handlers.handleGenerateTeamWorkspaceInvite(mockEvent, {
        ...workspace,
        includeAuthData: false,
      });

      expect(result.inviteData!.branch).toBe('main');
      expect(result.inviteData!.configPath).toBe('config/open-headers.json');
    });
  });

  describe('handleGenerateEnvironmentConfigLink', () => {
    it('generates link with environmentSchema only', async () => {
      const schema: EnvironmentSchema = {
        environments: {
          production: {
            variables: [
              { name: 'API_KEY', isSecret: true },
              { name: 'BASE_URL', isSecret: false },
            ],
          },
          staging: {
            variables: [
              { name: 'API_KEY', isSecret: true },
              { name: 'BASE_URL', isSecret: false },
            ],
          },
        },
      };

      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, { environmentSchema: schema });

      expect(result.success).toBe(true);
      expect(result.envConfigData).toBeDefined();
      expect(result.envConfigData!.version).toBe(DATA_FORMAT_VERSION);
      expect(result.envConfigData!.environmentSchema).toEqual(schema);
      expect(result.links).toBeDefined();
      expect(result.links!.appLink).toMatch(/^openheaders:\/\/open\?payload=/);
      expect(result.links!.webLink).toMatch(/^https:\/\/openheaders\.io\/open\?payload=/);
    });

    it('includes values when includeValues is true', async () => {
      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, {
        includeValues: true,
        environments: {
          production: {
            API_KEY: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true },
            BASE_URL: { value: 'https://api.openheaders.io/v2', isSecret: false },
          },
        },
      });

      expect(result.success).toBe(true);
      const envs = result.envConfigData!.environments;
      expect(envs).toBeDefined();
      expect(envs!.production.API_KEY).toEqual({
        value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        isSecret: true,
      });
      expect(envs!.production.BASE_URL).toEqual({
        value: 'https://api.openheaders.io/v2',
        isSecret: false,
      });
    });

    it('extracts schema when includeValues is false', async () => {
      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, {
        includeValues: false,
        environments: {
          staging: {
            DB_HOST: { value: 'db.staging.openheaders.io', isSecret: false },
            DB_PASSWORD: { value: 'staging-pass-123', isSecret: true },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.envConfigData!.environments).toBeUndefined();
      const schema = result.envConfigData!.environmentSchema;
      expect(schema).toBeDefined();
      expect(schema!.environments.staging.variables).toEqual([
        { name: 'DB_HOST', isSecret: false },
        { name: 'DB_PASSWORD', isSecret: true },
      ]);
    });

    it('does not duplicate variables when merging with existing schema', async () => {
      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, {
        includeValues: false,
        environmentSchema: {
          environments: {
            development: { variables: [{ name: 'EXISTING_VAR', isSecret: false }] },
          },
        },
        environments: {
          development: {
            EXISTING_VAR: { value: 'val', isSecret: false },
            NEW_VAR: { value: 'new-val', isSecret: true },
          },
        },
      });

      expect(result.success).toBe(true);
      const devVars = result.envConfigData!.environmentSchema!.environments.development.variables;
      expect(devVars).toHaveLength(2);
      const existingCount = devVars.filter((v) => v.name === 'EXISTING_VAR').length;
      expect(existingCount).toBe(1);
    });

    it('compressed payload is decompressible', async () => {
      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, {
        environmentSchema: {
          environments: {
            production: { variables: [{ name: 'TOKEN', isSecret: true }] },
          },
        },
      });

      const encoded = result.links!.appLink.split('payload=')[1];
      const decompressed = zlib.gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8');
      const parsed = JSON.parse(decompressed);

      expect(parsed.action).toBe('environment-import');
      expect(parsed.version).toBe(DATA_FORMAT_VERSION);
    });

    it('reports dataSize in links', async () => {
      const result = await handlers.handleGenerateEnvironmentConfigLink(mockEvent, {
        environmentSchema: {
          environments: {
            production: { variables: [{ name: 'API_KEY', isSecret: true }] },
          },
        },
      });

      expect(result.links!.dataSize).toBeGreaterThan(0);
      expect(typeof result.links!.dataSize).toBe('number');
    });
  });

  describe('handleServicesHealthCheck', () => {
    it('returns health status for all services', async () => {
      const result = await handlers.handleServicesHealthCheck();

      expect(result).toHaveProperty('gitSync');
      expect(result).toHaveProperty('workspaceSyncScheduler');
      expect(result).toHaveProperty('networkService');
      expect(result).toHaveProperty('proxyService');
      expect(result).toHaveProperty('webSocketService');
      expect(result).toHaveProperty('serviceRegistry');
    });
  });

  describe('handleWsGetConnectionStatus', () => {
    it('returns WebSocket connection status', async () => {
      const result = await handlers.handleWsGetConnectionStatus();

      expect(result).toHaveProperty('totalConnections');
      expect(result).toHaveProperty('browserCounts');
      expect(result).toHaveProperty('clients');
      expect(result).toHaveProperty('wsServerRunning');
      expect(result).toHaveProperty('wsPort');
    });
  });
});
