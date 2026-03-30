import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSettings } from '@/services/workspace/WorkspaceSettingsService';
import type { Workspace } from '@/types/workspace';

// Mock electron
vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/test-userData' } },
  app: { getPath: () => '/tmp/test-userData' },
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
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
const mockWriteJson = vi.fn().mockResolvedValue(undefined);
const mockReadJson = vi.fn().mockResolvedValue(null);
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (filePath: string, data: object) => mockWriteJson(filePath, data),
    readJson: (filePath: string) => mockReadJson(filePath),
  },
}));

// Mock config/version
vi.mock('../../../src/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      rm: vi.fn().mockResolvedValue(undefined),
    },
  },
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

import { WorkspaceSettingsService } from '@/services/workspace/WorkspaceSettingsService';

describe('WorkspaceSettingsService', () => {
  let service: WorkspaceSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkspaceSettingsService();
  });

  describe('constructor', () => {
    it('sets correct default settings', () => {
      expect(service.defaultSettings.activeWorkspaceId).toBe('default-personal');
      expect(service.defaultSettings.workspaces).toHaveLength(1);
      expect(service.defaultSettings.workspaces[0].id).toBe('default-personal');
      expect(service.defaultSettings.workspaces[0].type).toBe('personal');
      expect(service.defaultSettings.workspaces[0].isDefault).toBe(true);
    });

    it('sets settings path under userData', () => {
      expect(service.settingsPath).toContain('workspaces.json');
    });

    it('sets workspaces directory under userData', () => {
      expect(service.workspacesDir).toContain('workspaces');
    });
  });

  describe('getSettings()', () => {
    it('returns default settings when file does not exist', async () => {
      mockReadJson.mockResolvedValueOnce(null);
      const settings = await service.getSettings();
      expect(settings.activeWorkspaceId).toBe('default-personal');
      expect(settings.workspaces).toHaveLength(1);
    });

    it('returns stored settings when file exists', async () => {
      const storedSettings = {
        version: '3.0.0',
        activeWorkspaceId: 'ws-staging-env',
        workspaces: [
          { id: 'default-personal', name: 'Personal', type: 'personal', isDefault: true },
          {
            id: 'ws-staging-env',
            name: 'OpenHeaders Staging',
            type: 'git',
            gitUrl: 'https://github.com/OpenHeaders/open-headers-app.git',
          },
        ],
      };
      mockReadJson.mockResolvedValueOnce(storedSettings);
      const settings = await service.getSettings();
      expect(settings.activeWorkspaceId).toBe('ws-staging-env');
      expect(settings.workspaces).toHaveLength(2);
    });

    it('returns default settings when read throws (corrupted file)', async () => {
      mockReadJson.mockRejectedValueOnce(new Error('corrupted'));
      const settings = await service.getSettings();
      expect(settings.activeWorkspaceId).toBe('default-personal');
    });
  });

  describe('saveSettings()', () => {
    it('ensures default workspace is never removed', async () => {
      const settings: WorkspaceSettings = {
        version: '3.0.0',
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: 'Team', type: 'git' }],
      };
      await service.saveSettings(settings);
      // The first call arg should have default workspace prepended
      const savedSettings = mockWriteJson.mock.calls[0][1];
      expect(savedSettings.workspaces.some((w: Workspace) => w.id === 'default-personal')).toBe(true);
    });

    it('does not duplicate default workspace if already present', async () => {
      const settings: WorkspaceSettings = {
        version: '3.0.0',
        activeWorkspaceId: 'default-personal',
        workspaces: [{ id: 'default-personal', name: 'Personal', type: 'personal', isDefault: true }],
      };
      await service.saveSettings(settings);
      const savedSettings = mockWriteJson.mock.calls[0][1];
      const defaultCount = savedSettings.workspaces.filter((w: Workspace) => w.id === 'default-personal').length;
      expect(defaultCount).toBe(1);
    });
  });

  describe('removeWorkspace()', () => {
    it('prevents deletion of default workspace', async () => {
      await expect(service.removeWorkspace('default-personal')).rejects.toThrow(
        'Cannot delete the default personal workspace',
      );
    });

    it('switches active workspace to default when removing active workspace', async () => {
      mockReadJson.mockResolvedValueOnce({
        version: '3.0.0',
        activeWorkspaceId: 'ws-to-remove',
        workspaces: [
          { id: 'default-personal', name: 'Personal', type: 'personal', isDefault: true },
          { id: 'ws-to-remove', name: 'Team', type: 'git' },
        ],
      });
      await service.removeWorkspace('ws-to-remove');
      const savedSettings = mockWriteJson.mock.calls[0][1];
      expect(savedSettings.activeWorkspaceId).toBe('default-personal');
      expect(savedSettings.workspaces.some((w: Workspace) => w.id === 'ws-to-remove')).toBe(false);
    });
  });

  describe('addWorkspace()', () => {
    it('rejects duplicate workspace IDs', async () => {
      mockReadJson.mockResolvedValueOnce({
        version: '3.0.0',
        activeWorkspaceId: 'default-personal',
        workspaces: [
          { id: 'default-personal', name: 'Personal', type: 'personal', isDefault: true },
          { id: 'existing-ws', name: 'Existing', type: 'git' },
        ],
      });
      await expect(
        service.addWorkspace({
          id: 'existing-ws',
          name: 'Dup',
          type: 'git',
        }),
      ).rejects.toThrow('already exists');
    });
  });

  describe('getWorkspacePath()', () => {
    it('returns path under workspaces directory', () => {
      const wsPath = service.getWorkspacePath('my-workspace');
      expect(wsPath).toContain('workspaces');
      expect(wsPath).toContain('my-workspace');
    });
  });

  describe('updateWorkspace()', () => {
    it('throws when workspace not found', async () => {
      mockReadJson.mockResolvedValueOnce({
        version: '3.0.0',
        activeWorkspaceId: 'default-personal',
        workspaces: [{ id: 'default-personal', name: 'Personal', type: 'personal', isDefault: true }],
      });
      await expect(service.updateWorkspace('nonexistent', { name: 'New Name' })).rejects.toThrow('not found');
    });
  });

  describe('loadWorkspacesData()', () => {
    it('returns workspaces data with sync status', async () => {
      mockReadJson.mockResolvedValueOnce({
        version: '3.0.0',
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-a1b2c3d4', name: 'OpenHeaders Staging', type: 'git' }],
        syncStatus: { 'ws-1': { syncing: false } },
      });
      const data = await service.loadWorkspacesData();
      expect(data.activeWorkspaceId).toBe('ws-1');
      expect(data.syncStatus).toHaveProperty('ws-1');
    });

    it('returns defaults on error', async () => {
      mockReadJson.mockRejectedValueOnce(new Error('read error'));
      const data = await service.loadWorkspacesData();
      expect(data.activeWorkspaceId).toBe('default-personal');
    });
  });
});
