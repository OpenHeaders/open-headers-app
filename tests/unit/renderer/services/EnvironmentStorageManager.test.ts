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

const EnvironmentStorageManager = (
  await import('../../../../src/renderer/services/environment/EnvironmentStorageManager')
).default;

describe('EnvironmentStorageManager', () => {
  let manager: InstanceType<typeof EnvironmentStorageManager>;
  let mockStorageAPI: { loadFromStorage: ReturnType<typeof vi.fn>; saveToStorage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockStorageAPI = {
      loadFromStorage: vi.fn(),
      saveToStorage: vi.fn(),
    };
    manager = new EnvironmentStorageManager(mockStorageAPI);
  });

  // ========================================================================
  // loadActiveWorkspaceId
  // ========================================================================
  describe('loadActiveWorkspaceId', () => {
    it('returns activeWorkspaceId from stored config', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(
        JSON.stringify({ activeWorkspaceId: 'ws-custom' })
      );
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('ws-custom');
    });

    it('returns default-personal when no activeWorkspaceId', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({}));
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('returns default-personal when no data', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('returns default-personal on error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('loads from workspaces.json', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadActiveWorkspaceId();
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith('workspaces.json');
    });
  });

  // ========================================================================
  // loadEnvironments
  // ========================================================================
  describe('loadEnvironments', () => {
    it('returns parsed environments from storage', async () => {
      const stored = {
        environments: {
          Default: { KEY: { value: 'val' } },
          Staging: {},
        },
        activeEnvironment: 'Staging',
      };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadEnvironments('ws-1');
      expect(result.environments).toEqual(stored.environments);
      expect(result.activeEnvironment).toBe('Staging');
    });

    it('returns defaults when no data exists', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadEnvironments('ws-1');
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
    });

    it('returns defaults when environments object is empty', async () => {
      const stored = { environments: {}, activeEnvironment: 'Default' };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadEnvironments('ws-1');
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
    });

    it('defaults activeEnvironment to Default when not set', async () => {
      const stored = {
        environments: { Production: { KEY: { value: 'val' } } },
      };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadEnvironments('ws-1');
      expect(result.activeEnvironment).toBe('Default');
    });

    it('returns defaults when data has no environments key', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({ other: 'data' }));
      const result = await manager.loadEnvironments('ws-1');
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
    });

    it('throws on storage error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('read fail'));
      await expect(manager.loadEnvironments('ws-1')).rejects.toThrow('read fail');
    });

    it('loads from correct workspace path', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadEnvironments('my-workspace');
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith(
        'workspaces/my-workspace/environments.json'
      );
    });
  });

  // ========================================================================
  // saveEnvironments
  // ========================================================================
  describe('saveEnvironments', () => {
    it('saves environments to correct path', async () => {
      const environments = { Default: { KEY: { value: 'val' } } };
      await manager.saveEnvironments('ws-1', environments, 'Default');

      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/ws-1/environments.json',
        expect.any(String)
      );

      const saved = JSON.parse(mockStorageAPI.saveToStorage.mock.calls[0][1]);
      expect(saved.environments).toEqual(environments);
      expect(saved.activeEnvironment).toBe('Default');
    });

    it('returns true on success', async () => {
      const result = await manager.saveEnvironments('ws-1', {}, 'Default');
      expect(result).toBe(true);
    });

    it('throws on storage error', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('write fail'));
      await expect(
        manager.saveEnvironments('ws-1', {}, 'Default')
      ).rejects.toThrow('write fail');
    });
  });

  // ========================================================================
  // initializeDefaultEnvironments
  // ========================================================================
  describe('initializeDefaultEnvironments', () => {
    it('saves default environments and returns them', async () => {
      const result = await manager.initializeDefaultEnvironments('ws-1');
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalled();
    });

    it('saves to correct workspace path', async () => {
      await manager.initializeDefaultEnvironments('my-workspace');
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/my-workspace/environments.json',
        expect.any(String)
      );
    });
  });
});
