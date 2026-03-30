/**
 * Tests for WorkspaceStateService.onCliWorkspaceCreated
 *
 * Validates the full CLI workspace creation lifecycle:
 *  1. Saves pending data for current workspace
 *  2. Creates workspace entry in memory + on disk
 *  3. Imports synced data (sources, rules, proxy rules, environments)
 *  4. Loads env vars into envResolver + proxy
 *  5. Loads workspace data (evaluates source deps with populated envResolver)
 *  6. Starts auto-sync scheduler
 *  7. Broadcasts state to renderers
 */

import type fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncData } from '@/services/workspace/sync/types';
import type { Source } from '@/types/source';

vi.mock('electron', () => ({
  default: {
    app: { getPath: () => '/tmp/oh-cli-test' },
    BrowserWindow: { getAllWindows: () => [] },
  },
}));

vi.mock('../../../../src/utils/mainLogger.js', () => ({
  default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

const mockWriteJson = vi.fn().mockResolvedValue(undefined);
const mockReadJson = vi.fn().mockResolvedValue(null);
vi.mock('../../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (...args: unknown[]) => mockWriteJson(...args),
    readJson: (...args: unknown[]) => mockReadJson(...args),
  },
}));

vi.mock('../../../../src/config/version', () => ({ DATA_FORMAT_VERSION: '3.0.0' }));

// Mock fs.promises used by mkdir in crudCreateWorkspace
const mockMkdir = vi.fn().mockResolvedValue(undefined);
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        mkdir: (...args: unknown[]) => mockMkdir(...args),
      },
    },
    promises: {
      ...actual.promises,
      mkdir: (...args: unknown[]) => mockMkdir(...args),
    },
  };
});

import type {
  EnvironmentResolverLike,
  ProxyServiceLike,
  SourceRefreshServiceLike,
  WebSocketServiceLike,
  WorkspaceSyncSchedulerLike,
} from '@/services/workspace/state/types';
import { WorkspaceStateService } from '@/services/workspace/WorkspaceStateService';

// ── Helpers ──────────────────────────────────────────────────────────

function createEnvResolver(initialVars: Record<string, string> = {}): EnvironmentResolverLike {
  let vars = { ...initialVars };
  return {
    loadEnvironmentVariables: () => ({ ...vars }),
    resolveTemplate: vi.fn((template: string, variables: Record<string, string>) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`),
    ),
    setVariables: vi.fn((newVars: Record<string, string>) => {
      vars = { ...newVars };
    }),
    clearVariableCache: vi.fn(),
  };
}

function createRefreshService(): SourceRefreshServiceLike {
  return {
    activeWorkspaceId: 'ws-test-1',
    manualRefresh: vi.fn().mockResolvedValue({ success: true }),
    resetCircuitBreaker: vi.fn(),
    updateSource: vi.fn().mockResolvedValue(undefined),
    clearAllSources: vi.fn().mockResolvedValue(undefined),
    removeSourcesNotIn: vi.fn().mockResolvedValue(undefined),
  };
}

function createProxyService(): ProxyServiceLike {
  return {
    switchWorkspace: vi.fn().mockResolvedValue(undefined),
    updateSources: vi.fn(),
    updateHeaderRules: vi.fn(),
    updateProxyRules: vi.fn(),
    updateEnvironmentVariables: vi.fn(),
    clearRules: vi.fn(),
  };
}

function createSyncScheduler(): WorkspaceSyncSchedulerLike & {
  onWorkspaceSwitch: ReturnType<typeof vi.fn>;
  importSyncedData: ReturnType<typeof vi.fn>;
} {
  return {
    activateWorkspace: vi.fn().mockResolvedValue(undefined),
    onWorkspaceSwitch: vi.fn().mockResolvedValue(undefined),
    onWorkspaceUpdated: vi.fn().mockResolvedValue(undefined),
    importSyncedData: vi.fn().mockResolvedValue(undefined),
  };
}

function createWebSocketService(envResolver: EnvironmentResolverLike): WebSocketServiceLike {
  return {
    sources: [],
    rules: { header: [], request: [], response: [] },
    sourceHandler: { broadcastSources: vi.fn() },
    ruleHandler: { broadcastRules: vi.fn() },
    environmentHandler: envResolver,
  };
}

function createConfiguredService() {
  const envResolver = createEnvResolver();
  const refreshService = createRefreshService();
  const proxyService = createProxyService();
  const syncScheduler = createSyncScheduler();
  const wsService = createWebSocketService(envResolver);

  const service = new WorkspaceStateService();
  service.configure({
    webSocketService: wsService,
    proxyService,
    sourceRefreshService: refreshService,
    syncScheduler,
  });

  // Mark as initialized so saveAll doesn't fail
  const state = (service as unknown as { state: { initialized: boolean; workspaces: Array<{ id: string }> } }).state;
  state.initialized = true;
  state.workspaces = [{ id: 'default-personal' }] as typeof state.workspaces;

  return { service, envResolver, refreshService, proxyService, syncScheduler };
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: readJson returns null (file doesn't exist) — loadEnvironmentData uses fallback
  mockReadJson.mockResolvedValue(null);
});

describe('WorkspaceStateService.onCliWorkspaceCreated', () => {
  const workspaceId = 'team-abc123def456';
  const workspaceConfig = {
    name: 'Platform Team Workspace',
    type: 'git' as const,
    description: 'Invited by alice@openheaders.io',
    gitUrl: 'https://git.openheaders.io/team/config.git',
    gitBranch: 'main',
    gitPath: 'config/open-headers.json',
    authType: 'token' as const,
    authData: { token: 'ghp_testtoken123' },
    inviteMetadata: {
      invitedBy: 'alice@openheaders.io',
      inviteId: 'inv-001',
      joinedAt: '2026-03-25T12:00:00.000Z',
    },
  };

  const syncData: SyncData = {
    sources: [
      {
        sourceId: 'src-1',
        sourceType: 'http',
        sourcePath: 'https://{{API_HOST}}/token',
        activationState: 'active',
      },
    ] as Source[],
    rules: { header: [], request: [], response: [] },
    proxyRules: [],
  };

  it('adds workspace to in-memory state and sets it as active', async () => {
    const { service } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    const state = service.getState();
    expect(state.activeWorkspaceId).toBe(workspaceId);
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    expect(workspace).toBeDefined();
    expect(workspace!.name).toBe('Platform Team Workspace');
    expect(workspace!.type).toBe('git');
    expect(workspace!.gitUrl).toBe('https://git.openheaders.io/team/config.git');
    expect(workspace!.isTeam).toBe(true);
    expect(workspace!.inviteMetadata?.invitedBy).toBe('alice@openheaders.io');
  });

  it('creates workspace directory with empty data files', async () => {
    const { service } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(workspaceId), { recursive: true });
    // Should write 4 files: sources.json, rules.json, proxy-rules.json, environments.json
    const writePaths = mockWriteJson.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(writePaths.some((p: string) => p.includes('sources.json'))).toBe(true);
    expect(writePaths.some((p: string) => p.includes('rules.json'))).toBe(true);
    expect(writePaths.some((p: string) => p.includes('proxy-rules.json'))).toBe(true);
    expect(writePaths.some((p: string) => p.includes('environments.json'))).toBe(true);
  });

  it('imports synced data via syncScheduler.importSyncedData', async () => {
    const { service, syncScheduler } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    expect(syncScheduler.importSyncedData).toHaveBeenCalledWith(workspaceId, syncData, {
      broadcastToExtensions: false,
    });
  });

  it('skips import when syncData is null', async () => {
    const { service, syncScheduler } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData: null });

    expect(syncScheduler.importSyncedData).not.toHaveBeenCalled();
  });

  it('loads env vars into envResolver before loading workspace data', async () => {
    const { service, envResolver } = createConfiguredService();

    // Simulate environments.json existing with populated values via atomicWriter.readJson
    mockReadJson.mockImplementation(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('environments.json')) {
        return {
          environments: {
            Default: {
              API_HOST: { value: 'api.openheaders.io', isSecret: false },
              API_KEY: { value: 'secret123', isSecret: true },
            },
          },
          activeEnvironment: 'Default',
        };
      }
      return null;
    });

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    // envResolver.setVariables should have been called with resolved vars
    expect(envResolver.setVariables).toHaveBeenCalledWith(
      expect.objectContaining({
        API_HOST: 'api.openheaders.io',
        API_KEY: 'secret123',
      }),
    );
  });

  it('starts auto-sync with skipInitialSync: true', async () => {
    const { service, syncScheduler } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    expect(syncScheduler.onWorkspaceSwitch).toHaveBeenCalledWith(workspaceId, { skipInitialSync: true });
  });

  it('broadcasts sources, rules, proxyRules, workspaces to renderers', async () => {
    const { service, proxyService } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    // broadcastToServices pushes to proxy
    expect(proxyService.updateSources).toHaveBeenCalled();
    expect(proxyService.updateHeaderRules).toHaveBeenCalled();
    expect(proxyService.updateProxyRules).toHaveBeenCalled();
  });

  it('persists workspaces config to disk', async () => {
    const { service } = createConfiguredService();

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    // workspaces.json should be written (via saveWorkspacesConfig → persistWorkspacesConfig)
    const workspacesJsonWrite = mockWriteJson.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('workspaces.json'),
    );
    expect(workspacesJsonWrite).toBeDefined();
  });

  it('handles missing env file gracefully (applies empty vars)', async () => {
    const { service, envResolver, proxyService } = createConfiguredService();

    // readFile throws ENOENT (default mock)
    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    // Should apply empty vars without throwing
    expect(envResolver.setVariables).toHaveBeenCalledWith({});
    expect(proxyService.updateEnvironmentVariables).toHaveBeenCalledWith({});
  });

  it('processes complete flow in correct order', async () => {
    const callOrder: string[] = [];

    const { service, syncScheduler } = createConfiguredService();

    // Track call order
    syncScheduler.importSyncedData.mockImplementation(async () => {
      callOrder.push('importSyncedData');
    });
    syncScheduler.onWorkspaceSwitch.mockImplementation(async () => {
      callOrder.push('onWorkspaceSwitch');
    });

    await service.onCliWorkspaceCreated({ workspaceId, workspaceConfig, syncData });

    // importSyncedData must come before onWorkspaceSwitch
    expect(callOrder.indexOf('importSyncedData')).toBeLessThan(callOrder.indexOf('onWorkspaceSwitch'));
  });
});
