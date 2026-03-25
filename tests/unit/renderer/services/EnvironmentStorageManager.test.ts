import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnvironmentMap, EnvironmentVariable } from '../../../../src/types/environment';

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

// ---------------------------------------------------------------------------
// Enterprise-realistic data
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const WORKSPACE_ID_TEAM = 'ws-team-openheaders-platform-staging';

function makeEnterpriseEnvironmentData() {
  return {
    environments: {
      Default: {
        OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false, updatedAt: '2025-11-15T09:30:00.000Z' },
        OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true, updatedAt: '2025-11-15T09:30:00.000Z' },
        API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2', isSecret: false, updatedAt: '2025-11-15T09:30:00.000Z' },
        DATABASE_CONNECTION_STRING: {
          value: 'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require',
          isSecret: true,
          updatedAt: '2026-01-20T14:45:12.345Z',
        },
      },
      'Staging — EU Region': {
        API_GATEWAY_URL: { value: 'https://staging-eu.openheaders.io:8443/v2', isSecret: false, updatedAt: '2025-12-01T08:00:00.000Z' },
      },
      Production: {
        REDIS_URL: { value: 'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0', isSecret: true, updatedAt: '2026-01-10T16:30:00.000Z' },
      },
    } as EnvironmentMap,
    activeEnvironment: 'Staging — EU Region',
  };
}

describe('EnvironmentStorageManager', () => {
  let manager: InstanceType<typeof EnvironmentStorageManager>;
  let mockStorageAPI: {
    loadFromStorage: ReturnType<typeof vi.fn<(filename: string) => Promise<string | null>>>;
    saveToStorage: ReturnType<typeof vi.fn<(filename: string, content: string) => Promise<void>>>;
  };

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
    it('returns activeWorkspaceId from stored workspaces config', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(
        JSON.stringify({ activeWorkspaceId: WORKSPACE_ID, workspaces: [{ id: WORKSPACE_ID }] })
      );
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe(WORKSPACE_ID);
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith('workspaces.json');
    });

    it('returns default-personal when no activeWorkspaceId field', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({ workspaces: [] }));
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('returns default-personal when storage returns null', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('returns default-personal on storage error (corrupted JSON)', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('ENOENT: no such file'));
      const result = await manager.loadActiveWorkspaceId();
      expect(result).toBe('default-personal');
    });

    it('loads from workspaces.json file path', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadActiveWorkspaceId();
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith('workspaces.json');
    });
  });

  // ========================================================================
  // loadEnvironments
  // ========================================================================
  describe('loadEnvironments', () => {
    it('returns full enterprise environments from storage', async () => {
      const stored = makeEnterpriseEnvironmentData();
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));

      const result = await manager.loadEnvironments(WORKSPACE_ID);
      expect(result.environments).toEqual(stored.environments);
      expect(result.activeEnvironment).toBe('Staging — EU Region');
    });

    it('loads from correct workspace path', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadEnvironments(WORKSPACE_ID);
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith(
        `workspaces/${WORKSPACE_ID}/environments.json`
      );
    });

    it('returns defaults when no data exists', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadEnvironments(WORKSPACE_ID);
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
        isNewlyCreated: true,
      });
    });

    it('returns defaults when environments object is empty', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(
        JSON.stringify({ environments: {}, activeEnvironment: 'Default' })
      );
      const result = await manager.loadEnvironments(WORKSPACE_ID);
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
        isNewlyCreated: true,
      });
    });

    it('defaults activeEnvironment to Default when not set in stored data', async () => {
      const stored = { environments: { Production: { KEY: { value: 'val', isSecret: false } } } };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadEnvironments(WORKSPACE_ID);
      expect(result.activeEnvironment).toBe('Default');
      expect(result.isNewlyCreated).toBe(false);
    });

    it('returns defaults when data has no environments key', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({ version: '3.0.0' }));
      const result = await manager.loadEnvironments(WORKSPACE_ID);
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
        isNewlyCreated: true,
      });
    });

    it('throws on storage read error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('disk read failed'));
      await expect(manager.loadEnvironments(WORKSPACE_ID)).rejects.toThrow('disk read failed');
    });

    it('handles team workspace path with hyphens and dots', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadEnvironments(WORKSPACE_ID_TEAM);
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith(
        `workspaces/${WORKSPACE_ID_TEAM}/environments.json`
      );
    });

    it('preserves variable metadata (updatedAt, isSecret) from stored data', async () => {
      const stored = makeEnterpriseEnvironmentData();
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));

      const result = await manager.loadEnvironments(WORKSPACE_ID);
      const dbConn = result.environments.Default.DATABASE_CONNECTION_STRING;
      expect(dbConn).toEqual({
        value: 'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/production?sslmode=require',
        isSecret: true,
        updatedAt: '2026-01-20T14:45:12.345Z',
      });
    });
  });

  // ========================================================================
  // saveEnvironments
  // ========================================================================
  describe('saveEnvironments', () => {
    it('saves enterprise environments to correct workspace path', async () => {
      const data = makeEnterpriseEnvironmentData();
      await manager.saveEnvironments(WORKSPACE_ID, data.environments, data.activeEnvironment);

      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        `workspaces/${WORKSPACE_ID}/environments.json`,
        expect.any(String)
      );

      const saved = JSON.parse(mockStorageAPI.saveToStorage.mock.calls[0][1]);
      expect(saved).toEqual({
        environments: data.environments,
        activeEnvironment: 'Staging — EU Region',
      });
    });

    it('returns true on success', async () => {
      const result = await manager.saveEnvironments(WORKSPACE_ID, { Default: {} }, 'Default');
      expect(result).toBe(true);
    });

    it('throws on storage write error', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('disk full'));
      await expect(
        manager.saveEnvironments(WORKSPACE_ID, { Default: {} }, 'Default')
      ).rejects.toThrow('disk full');
    });

    it('saves special characters in values without corruption', async () => {
      const envs: EnvironmentMap = {
        Default: {
          CONN: {
            value: 'postgresql://user:P@ss=w0rd&special!@host:5432/db?ssl=true',
            isSecret: true,
            updatedAt: '2026-01-20T14:45:12.345Z',
          },
        },
      };
      await manager.saveEnvironments(WORKSPACE_ID, envs, 'Default');

      const saved = JSON.parse(mockStorageAPI.saveToStorage.mock.calls[0][1]);
      expect(saved.environments.Default.CONN.value).toBe(
        'postgresql://user:P@ss=w0rd&special!@host:5432/db?ssl=true'
      );
    });
  });

  // ========================================================================
  // initializeDefaultEnvironments
  // ========================================================================
  describe('initializeDefaultEnvironments', () => {
    it('saves default environments and returns them', async () => {
      const result = await manager.initializeDefaultEnvironments(WORKSPACE_ID);
      expect(result).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledTimes(1);
    });

    it('saves to correct workspace path', async () => {
      await manager.initializeDefaultEnvironments(WORKSPACE_ID_TEAM);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        `workspaces/${WORKSPACE_ID_TEAM}/environments.json`,
        expect.any(String)
      );
      const saved = JSON.parse(mockStorageAPI.saveToStorage.mock.calls[0][1]);
      expect(saved).toEqual({
        environments: { Default: {} },
        activeEnvironment: 'Default',
      });
    });
  });
});
