import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock version
vi.mock('../../../../src/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
}));

const WorkspaceManager = (
  await import('../../../../src/renderer/services/workspace/WorkspaceManager')
).default;

describe('WorkspaceManager', () => {
  let manager: InstanceType<typeof WorkspaceManager>;
  let mockStorageAPI: any;

  beforeEach(() => {
    mockStorageAPI = {
      loadFromStorage: vi.fn(),
      saveToStorage: vi.fn(),
      deleteDirectory: vi.fn(),
    };
    manager = new WorkspaceManager(mockStorageAPI);
  });

  // ========================================================================
  // createWorkspace - validation and creation logic (pure)
  // ========================================================================
  describe('createWorkspace', () => {
    const baseWorkspace = {
      id: 'test-ws',
      name: 'Test Workspace',
      type: 'personal' as const,
    };

    it('creates a workspace with proper defaults', async () => {
      const result = await manager.createWorkspace([], baseWorkspace);
      expect(result.id).toBe('test-ws');
      expect(result.name).toBe('Test Workspace');
      expect(result.isPersonal).toBe(true);
      expect(result.isTeam).toBe(false);
      expect(result.isDefault).toBe(false);
      expect(result.metadata.version).toBe('3.0.0');
      expect(result.metadata.sourceCount).toBe(0);
      expect(result.metadata.ruleCount).toBe(0);
      expect(result.updatedAt).toBeDefined();
    });

    it('sets isDefault true only for default-personal', async () => {
      const ws = { ...baseWorkspace, id: 'default-personal' };
      const result = await manager.createWorkspace([], ws);
      expect(result.isDefault).toBe(true);
    });

    it('sets isTeam true for team type', async () => {
      const ws = { ...baseWorkspace, type: 'team' };
      const result = await manager.createWorkspace([], ws);
      expect(result.isTeam).toBe(true);
      expect(result.isPersonal).toBe(false);
    });

    it('sets isTeam true for git type', async () => {
      const ws = {
        ...baseWorkspace,
        type: 'git',
        gitUrl: 'https://github.com/test/repo',
      };
      const result = await manager.createWorkspace([], ws);
      expect(result.isTeam).toBe(true);
    });

    it('throws on duplicate ID', async () => {
      const existing = [{ id: 'test-ws' }];
      await expect(
        manager.createWorkspace(existing, baseWorkspace)
      ).rejects.toThrow('already exists');
    });

    it('throws when name is missing', async () => {
      await expect(
        manager.createWorkspace([], { id: 'x', name: '', type: 'personal' })
      ).rejects.toThrow('must have name and type');
    });

    it('throws when type is missing', async () => {
      await expect(
        manager.createWorkspace([], { id: 'x', name: 'Y', type: '' })
      ).rejects.toThrow('must have name and type');
    });

    it('throws on invalid workspace type', async () => {
      await expect(
        manager.createWorkspace([], { id: 'x', name: 'Y', type: 'invalid' })
      ).rejects.toThrow('Invalid workspace type');
    });

    it('throws when name is too long (>100 chars)', async () => {
      const longName = 'a'.repeat(101);
      await expect(
        manager.createWorkspace([], { id: 'x', name: longName, type: 'personal' })
      ).rejects.toThrow('between 1 and 100');
    });

    it('allows name of exactly 100 characters', async () => {
      const name100 = 'a'.repeat(100);
      const result = await manager.createWorkspace([], { id: 'x', name: name100, type: 'personal' });
      expect(result.name).toBe(name100);
    });

    it('throws on invalid ID format (special chars)', async () => {
      await expect(
        manager.createWorkspace([], { id: 'bad id!', name: 'Y', type: 'personal' })
      ).rejects.toThrow('letters, numbers, hyphens, and underscores');
    });

    it('allows hyphens and underscores in ID', async () => {
      const result = await manager.createWorkspace([], {
        id: 'my-test_ws',
        name: 'Y',
        type: 'personal',
      });
      expect(result.id).toBe('my-test_ws');
    });

    it('throws when git workspace has no gitUrl', async () => {
      await expect(
        manager.createWorkspace([], { id: 'x', name: 'Y', type: 'git' })
      ).rejects.toThrow('must have a gitUrl');
    });

    it('throws on invalid git URL format', async () => {
      await expect(
        manager.createWorkspace([], {
          id: 'x',
          name: 'Y',
          type: 'git',
          gitUrl: 'ftp://example.com',
        })
      ).rejects.toThrow('Invalid git URL format');
    });

    it('accepts valid https git URL', async () => {
      const result = await manager.createWorkspace([], {
        id: 'x',
        name: 'Y',
        type: 'git',
        gitUrl: 'https://github.com/org/repo',
      });
      expect(result.id).toBe('x');
    });

    it('accepts valid ssh git URL', async () => {
      const result = await manager.createWorkspace([], {
        id: 'x',
        name: 'Y',
        type: 'git',
        gitUrl: 'git@github.com:org/repo.git',
      });
      expect(result.id).toBe('x');
    });

    it('accepts ssh:// git URL', async () => {
      const result = await manager.createWorkspace([], {
        id: 'x',
        name: 'Y',
        type: 'git',
        gitUrl: 'ssh://git@github.com/org/repo.git',
      });
      expect(result.id).toBe('x');
    });

    it('preserves provided createdAt', async () => {
      const timestamp = '2024-01-01T00:00:00.000Z';
      const result = await manager.createWorkspace([], {
        ...baseWorkspace,
        createdAt: timestamp,
      });
      expect(result.createdAt).toBe(timestamp);
    });
  });

  // ========================================================================
  // validateWorkspaceExists
  // ========================================================================
  describe('validateWorkspaceExists', () => {
    it('returns workspace when it exists', () => {
      const workspaces = [{ id: 'ws-1', name: 'One' }];
      const result = manager.validateWorkspaceExists(workspaces, 'ws-1');
      expect(result).toEqual({ id: 'ws-1', name: 'One' });
    });

    it('throws when workspace does not exist', () => {
      expect(() => manager.validateWorkspaceExists([], 'ws-1')).toThrow('not found');
    });
  });

  // ========================================================================
  // loadWorkspaces
  // ========================================================================
  describe('loadWorkspaces', () => {
    it('parses stored workspaces data', async () => {
      const stored = {
        workspaces: [{ id: 'ws-1', name: 'One' }],
        activeWorkspaceId: 'ws-1',
        syncStatus: { ws1: 'synced' },
      };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadWorkspaces();
      expect(result.workspaces).toEqual([{ id: 'ws-1', name: 'One' }]);
      expect(result.activeWorkspaceId).toBe('ws-1');
      expect(result.syncStatus).toEqual({ ws1: 'synced' });
    });

    it('returns default config when no data exists', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadWorkspaces();
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].id).toBe('default-personal');
      expect(result.activeWorkspaceId).toBe('default-personal');
      // Should also save the default config
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalled();
    });

    it('provides defaults for missing fields in parsed data', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({}));
      const result = await manager.loadWorkspaces();
      expect(result.workspaces).toEqual([]);
      expect(result.activeWorkspaceId).toBe('default-personal');
      expect(result.syncStatus).toEqual({});
    });

    it('throws on storage error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      await expect(manager.loadWorkspaces()).rejects.toThrow('fail');
    });
  });

  // ========================================================================
  // saveWorkspaces
  // ========================================================================
  describe('saveWorkspaces', () => {
    it('saves config to workspaces.json', async () => {
      const config = {
        workspaces: [{ id: 'ws-1' }],
        activeWorkspaceId: 'ws-1',
        syncStatus: {},
      };
      await manager.saveWorkspaces(config);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces.json',
        expect.any(String)
      );
      const saved = JSON.parse(mockStorageAPI.saveToStorage.mock.calls[0][1]);
      expect(saved.workspaces).toEqual([{ id: 'ws-1' }]);
      expect(saved.activeWorkspaceId).toBe('ws-1');
    });

    it('throws on storage error', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('write fail'));
      await expect(
        manager.saveWorkspaces({ workspaces: [], activeWorkspaceId: '', syncStatus: {} })
      ).rejects.toThrow('write fail');
    });
  });

  // ========================================================================
  // deleteWorkspaceData
  // ========================================================================
  describe('deleteWorkspaceData', () => {
    it('prevents deleting default workspace', async () => {
      await expect(
        manager.deleteWorkspaceData('default-personal')
      ).rejects.toThrow('Cannot delete default');
    });

    it('deletes the workspace directory', async () => {
      await manager.deleteWorkspaceData('ws-1');
      expect(mockStorageAPI.deleteDirectory).toHaveBeenCalledWith('workspaces/ws-1');
    });

    it('throws on storage error', async () => {
      mockStorageAPI.deleteDirectory.mockRejectedValue(new Error('perm'));
      await expect(manager.deleteWorkspaceData('ws-1')).rejects.toThrow('perm');
    });
  });

  // ========================================================================
  // copyWorkspaceData
  // ========================================================================
  describe('copyWorkspaceData', () => {
    it('copies all data files between workspaces', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue('{"data":true}');
      await manager.copyWorkspaceData('src-ws', 'dst-ws');

      const loadCalls = mockStorageAPI.loadFromStorage.mock.calls;
      const saveCalls = mockStorageAPI.saveToStorage.mock.calls;

      expect(loadCalls.some((c: string[]) => c[0].includes('sources.json'))).toBe(true);
      expect(loadCalls.some((c: string[]) => c[0].includes('rules.json'))).toBe(true);
      expect(loadCalls.some((c: string[]) => c[0].includes('proxy-rules.json'))).toBe(true);
      expect(loadCalls.some((c: string[]) => c[0].includes('environments.json'))).toBe(true);

      expect(saveCalls).toHaveLength(4);
      saveCalls.forEach((call: string[]) => {
        expect(call[0]).toContain('dst-ws');
      });
    });

    it('skips files that do not exist', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.copyWorkspaceData('src-ws', 'dst-ws');
      expect(mockStorageAPI.saveToStorage).not.toHaveBeenCalled();
    });

    it('continues on individual file errors', async () => {
      let callCount = 0;
      mockStorageAPI.loadFromStorage.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('not found');
        return Promise.resolve('{}');
      });
      await manager.copyWorkspaceData('src-ws', 'dst-ws');
      // Should still have saved the files that loaded successfully
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalled();
    });
  });
});
