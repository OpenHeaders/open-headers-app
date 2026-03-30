import type { HeaderRule, Source } from '@openheaders/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateContext } from '@/services/workspace/state/types';
import type { ProxyRule } from '@/types/proxy';

// Mock electron
vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/test' }, BrowserWindow: { getAllWindows: () => [] } },
}));

// Mock mainLogger
vi.mock('@/utils/mainLogger.js', () => ({
  default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

// Mock atomicFileWriter (used by StatePersistence which is imported transitively)
vi.mock('@/utils/atomicFileWriter.js', () => ({
  default: { writeJson: vi.fn().mockResolvedValue(undefined), readJson: vi.fn().mockResolvedValue(null) },
}));

vi.mock('@/config/version', () => ({ DATA_FORMAT_VERSION: '3.0.0' }));

import {
  addHeaderRule,
  addProxyRule,
  addSource,
  importSources,
  removeHeaderRule,
  removeProxyRule,
  removeSource,
  updateHeaderRule,
  updateSource,
  updateSourceFetchResult,
} from '@/services/workspace/state/SourceCrud';

function createCtx(overrides: Partial<StateContext> = {}): StateContext {
  return {
    state: {
      initialized: true,
      loading: false,
      error: null,
      workspaces: [],
      activeWorkspaceId: 'default-personal',
      isWorkspaceSwitching: false,
      syncStatus: {},
      sources: [],
      rules: { header: [], request: [], response: [] },
      proxyRules: [],
      environments: { Default: {} },
      activeEnvironment: 'Default',
    },
    dirty: { sources: false, rules: false, proxyRules: false, workspaces: false, environments: false },
    appDataPath: '/tmp/test',
    webSocketService: null,
    proxyService: null,
    envResolver: null,
    sourceRefreshService: null,
    syncScheduler: null,
    scheduleDebouncedSave: vi.fn(),
    saveAll: vi.fn().mockResolvedValue(undefined),
    saveSources: vi.fn().mockResolvedValue(undefined),
    saveEnvironments: vi.fn().mockResolvedValue(undefined),
    saveWorkspacesConfig: vi.fn().mockResolvedValue(undefined),
    loadWorkspaceData: vi.fn().mockResolvedValue(undefined),
    updateWorkspaceMetadataInMemory: vi.fn(),
    ...overrides,
  };
}

function httpSource(overrides: Partial<Source> = {}): Source {
  return { sourceId: '0', sourceType: 'http', sourcePath: 'https://api.openheaders.io/data', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addSource', () => {
  it('generates a new sourceId and adds to state', async () => {
    const ctx = createCtx();
    const result = await addSource(ctx, httpSource());
    expect(result.sourceId).toBe('1');
    expect(ctx.state.sources).toHaveLength(1);
    expect(ctx.dirty.sources).toBe(true);
  });

  it('increments sourceId from existing max', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '5' })];
    const result = await addSource(ctx, httpSource({ sourcePath: 'https://api.openheaders.io/other' }));
    expect(result.sourceId).toBe('6');
  });

  it('throws on duplicate source', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1', sourcePath: 'https://api.openheaders.io/data' })];
    await expect(addSource(ctx, httpSource({ sourcePath: 'https://api.openheaders.io/data' }))).rejects.toThrow(
      'Source already exists',
    );
  });

  it('registers HTTP source with refresh service', async () => {
    const updateSourceFn = vi.fn().mockResolvedValue(undefined);
    const ctx = createCtx({
      sourceRefreshService: {
        activeWorkspaceId: 'ws-test-1',
        updateSource: updateSourceFn,
        removeSourcesNotIn: vi.fn().mockResolvedValue(undefined),
        clearAllSources: vi.fn(),
        manualRefresh: vi.fn(),
        resetCircuitBreaker: vi.fn(),
      },
    });
    await addSource(ctx, httpSource());
    expect(updateSourceFn).toHaveBeenCalledOnce();
  });

  it('evaluates dependencies for HTTP sources', async () => {
    const ctx = createCtx({
      envResolver: {
        loadEnvironmentVariables: () => ({}),
        resolveTemplate: vi.fn(),
        setVariables: vi.fn(),
        clearVariableCache: vi.fn(),
      },
    });
    const result = await addSource(ctx, httpSource({ sourcePath: 'https://{{HOST}}/api' }));
    expect(result.activationState).toBe('waiting_for_deps');
    expect(result.missingDependencies).toEqual(['HOST']);
  });
});

describe('updateSource', () => {
  it('updates source fields and marks dirty', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1' })];
    const result = await updateSource(ctx, '1', { sourceName: 'Updated' });
    expect(result?.sourceName).toBe('Updated');
    expect(result?.updatedAt).toBeDefined();
    expect(ctx.dirty.sources).toBe(true);
  });

  it('merges refreshOptions shallowly', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1', refreshOptions: { enabled: true, interval: 60000 } })];
    const result = await updateSource(ctx, '1', { refreshOptions: { interval: 30000 } });
    expect(result?.refreshOptions?.enabled).toBe(true);
    expect(result?.refreshOptions?.interval).toBe(30000);
  });

  it('returns null when source not found', async () => {
    const ctx = createCtx();
    const result = await updateSource(ctx, 'nonexistent', { sourceName: 'X' });
    expect(result).toBeNull();
  });
});

describe('removeSource', () => {
  it('removes the source from state', async () => {
    const ctx = createCtx();
    ctx.state.sources = [
      httpSource({ sourceId: '1' }),
      httpSource({ sourceId: '2', sourcePath: 'https://api.openheaders.io/other' }),
    ];
    await removeSource(ctx, '1');
    expect(ctx.state.sources).toHaveLength(1);
    expect(ctx.state.sources[0].sourceId).toBe('2');
  });
});

describe('updateSourceFetchResult', () => {
  it('updates content and metadata fields', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1' })];
    await updateSourceFetchResult(ctx, '1', {
      content: '<html>Response</html>',
      originalResponse: '<html>Original</html>',
      headers: { 'content-type': 'text/html' },
      isFiltered: true,
      filteredWith: 'jsonPath',
    });
    const src = ctx.state.sources[0];
    expect(src.sourceContent).toBe('<html>Response</html>');
    expect(src.originalResponse).toBe('<html>Original</html>');
    expect(src.isFiltered).toBe(true);
    expect(src.needsInitialFetch).toBe(false);
  });
});

describe('importSources', () => {
  it('replaces sources when replace=true', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1' })];
    const newSources = [httpSource({ sourceId: '2', sourcePath: 'https://api.openheaders.io/new' })];
    await importSources(ctx, newSources, true);
    expect(ctx.state.sources).toHaveLength(1);
    expect(ctx.state.sources[0].sourceId).toBe('2');
  });

  it('appends sources when replace=false', async () => {
    const ctx = createCtx();
    ctx.state.sources = [httpSource({ sourceId: '1' })];
    await importSources(ctx, [httpSource({ sourceId: '2', sourcePath: 'https://api.openheaders.io/new' })], false);
    expect(ctx.state.sources).toHaveLength(2);
  });
});

describe('addHeaderRule', () => {
  it('adds a new rule and marks dirty', async () => {
    const ctx = createCtx();
    await addHeaderRule(ctx, { name: 'Test Rule', enabled: true } as Partial<HeaderRule>);
    expect(ctx.state.rules.header).toHaveLength(1);
    expect(ctx.state.rules.header[0].name).toBe('Test Rule');
    expect(ctx.dirty.rules).toBe(true);
  });
});

describe('updateHeaderRule', () => {
  it('updates matching rule', async () => {
    const ctx = createCtx();
    ctx.state.rules = { header: [{ id: 'r1', name: 'Old' } as HeaderRule], request: [], response: [] };
    await updateHeaderRule(ctx, 'r1', { name: 'New' });
    expect(ctx.state.rules.header[0].name).toBe('New');
  });
});

describe('removeHeaderRule', () => {
  it('removes the rule', async () => {
    const ctx = createCtx();
    ctx.state.rules = { header: [{ id: 'r1' } as HeaderRule, { id: 'r2' } as HeaderRule], request: [], response: [] };
    await removeHeaderRule(ctx, 'r1');
    expect(ctx.state.rules.header).toHaveLength(1);
    expect(ctx.state.rules.header[0].id).toBe('r2');
  });
});

describe('addProxyRule', () => {
  it('adds rule and marks dirty', async () => {
    const ctx = createCtx();
    await addProxyRule(ctx, { id: 'pr1' } as ProxyRule);
    expect(ctx.state.proxyRules).toHaveLength(1);
    expect(ctx.dirty.proxyRules).toBe(true);
  });
});

describe('removeProxyRule', () => {
  it('removes the proxy rule', async () => {
    const ctx = createCtx();
    ctx.state.proxyRules = [{ id: 'pr1' } as ProxyRule, { id: 'pr2' } as ProxyRule];
    await removeProxyRule(ctx, 'pr1');
    expect(ctx.state.proxyRules).toHaveLength(1);
  });
});
