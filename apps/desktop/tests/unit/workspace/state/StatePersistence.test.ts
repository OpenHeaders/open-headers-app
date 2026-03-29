import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/test' }, BrowserWindow: { getAllWindows: () => [] } },
}));

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger.js', () => ({
  default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

const mockWriteJson = vi.fn().mockResolvedValue(undefined);
const mockReadJson = vi.fn().mockResolvedValue(null);

// Mock atomicFileWriter
vi.mock('../../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    writeJson: (...args: unknown[]) => mockWriteJson(...args),
    readJson: (...args: unknown[]) => mockReadJson(...args),
  },
}));

// Mock config/version
vi.mock('../../../../src/config/version', () => ({ DATA_FORMAT_VERSION: '3.0.0' }));

import {
  loadProxyRules,
  loadRules,
  loadSources,
  loadWorkspacesConfig,
  saveAll,
  saveProxyRules,
  saveRules,
  saveSources,
  saveWorkspacesConfig,
  workspaceDir,
} from '../../../../src/services/workspace/state/StatePersistence';
import type { RulesCollection } from '../../../../src/types/rules';
import type { Source } from '../../../../src/types/source';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workspaceDir', () => {
  it('returns the correct workspace directory path', () => {
    expect(workspaceDir('/data', 'ws-123')).toBe('/data/workspaces/ws-123');
  });
});

describe('loadWorkspacesConfig', () => {
  it('returns config from disk when file exists', async () => {
    mockReadJson.mockResolvedValueOnce({
      workspaces: [{ id: 'team-abc', name: 'OpenHeaders Team' }],
      activeWorkspaceId: 'team-abc',
      syncStatus: { 'team-abc': { syncing: false } },
    });

    const config = await loadWorkspacesConfig('/data');
    expect(config.workspaces).toHaveLength(1);
    expect(config.activeWorkspaceId).toBe('team-abc');
    expect(config.syncStatus['team-abc']).toEqual({ syncing: false });
  });

  it('returns defaults and saves when no file exists', async () => {
    mockReadJson.mockResolvedValueOnce(null);

    const config = await loadWorkspacesConfig('/data');
    expect(config.activeWorkspaceId).toBe('default-personal');
    expect(config.workspaces).toHaveLength(1);
    expect(config.workspaces[0].id).toBe('default-personal');
    expect(mockWriteJson).toHaveBeenCalledOnce();
  });

  it('fills missing fields with defaults', async () => {
    mockReadJson.mockResolvedValueOnce({ workspaces: [{ id: 'ws-1' }] });

    const config = await loadWorkspacesConfig('/data');
    expect(config.activeWorkspaceId).toBe('default-personal');
    expect(config.syncStatus).toEqual({});
  });
});

describe('saveWorkspacesConfig', () => {
  it('writes config with pretty formatting', async () => {
    const config = { workspaces: [], activeWorkspaceId: 'default-personal', syncStatus: {} };
    await saveWorkspacesConfig('/data', config);
    expect(mockWriteJson).toHaveBeenCalledWith('/data/workspaces.json', config, { pretty: true });
  });
});

describe('loadSources', () => {
  it('returns sources from disk', async () => {
    const sources: Source[] = [{ sourceId: '1', sourceType: 'http', sourcePath: 'https://api.openheaders.io/data' }];
    mockReadJson.mockResolvedValueOnce(sources);

    const result = await loadSources('/data', 'ws-1');
    expect(result).toEqual(sources);
  });

  it('returns empty array when file missing', async () => {
    mockReadJson.mockResolvedValueOnce(null);
    const result = await loadSources('/data', 'ws-1');
    expect(result).toEqual([]);
  });
});

describe('loadRules', () => {
  it('returns rules from disk', async () => {
    const rules: RulesCollection = { header: [{ id: 'r1' }], request: [], response: [] } as unknown as RulesCollection;
    mockReadJson.mockResolvedValueOnce({ rules });

    const result = await loadRules('/data', 'ws-1');
    expect(result.header).toHaveLength(1);
  });

  it('returns empty rules when file missing', async () => {
    mockReadJson.mockResolvedValueOnce(null);
    const result = await loadRules('/data', 'ws-1');
    expect(result).toEqual({ header: [], request: [], response: [] });
  });

  it('returns empty rules on read error', async () => {
    mockReadJson.mockRejectedValueOnce(new Error('ENOENT'));
    const result = await loadRules('/data', 'ws-1');
    expect(result).toEqual({ header: [], request: [], response: [] });
  });
});

describe('loadProxyRules', () => {
  it('returns empty array when file missing', async () => {
    mockReadJson.mockResolvedValueOnce(null);
    const result = await loadProxyRules('/data', 'ws-1');
    expect(result).toEqual([]);
  });
});

describe('saveSources', () => {
  it('writes sources to correct path', async () => {
    const sources: Source[] = [{ sourceId: '1', sourceType: 'http' }];
    await saveSources('/data', 'ws-1', sources);
    expect(mockWriteJson).toHaveBeenCalledWith('/data/workspaces/ws-1/sources.json', sources);
  });
});

describe('saveRules', () => {
  it('wraps rules in storage format with metadata', async () => {
    const rules: RulesCollection = { header: [{ id: 'r1' }], request: [], response: [] } as unknown as RulesCollection;
    await saveRules('/data', 'ws-1', rules);
    expect(mockWriteJson).toHaveBeenCalledWith(
      '/data/workspaces/ws-1/rules.json',
      expect.objectContaining({
        version: '3.0.0',
        rules,
        metadata: expect.objectContaining({ totalRules: 1 }),
      }),
      { pretty: true },
    );
  });
});

describe('saveProxyRules', () => {
  it('writes proxy rules to correct path', async () => {
    await saveProxyRules('/data', 'ws-1', []);
    expect(mockWriteJson).toHaveBeenCalledWith('/data/workspaces/ws-1/proxy-rules.json', []);
  });
});

describe('saveAll', () => {
  it('saves only dirty data types', async () => {
    const dirty = { sources: true, rules: false, proxyRules: false, workspaces: true };
    const data = {
      sources: [],
      rules: { header: [], request: [], response: [] } as RulesCollection,
      proxyRules: [],
      workspacesConfig: { workspaces: [], activeWorkspaceId: 'default-personal', syncStatus: {} },
    };
    const count = await saveAll('/data', 'ws-1', dirty, data);
    expect(count).toBe(2);
    expect(mockWriteJson).toHaveBeenCalledTimes(2);
  });

  it('returns 0 when nothing is dirty', async () => {
    const dirty = { sources: false, rules: false, proxyRules: false, workspaces: false, environments: false };
    const data = {
      sources: [],
      rules: { header: [], request: [], response: [] } as RulesCollection,
      proxyRules: [],
      workspacesConfig: { workspaces: [], activeWorkspaceId: 'default-personal', syncStatus: {} },
    };
    const count = await saveAll('/data', 'ws-1', dirty, data);
    expect(count).toBe(0);
    expect(mockWriteJson).not.toHaveBeenCalled();
  });
});
