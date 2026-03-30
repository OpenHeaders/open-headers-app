import type { Source } from '@openheaders/core';
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_MODES } from '@/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies } from '@/renderer/services/export-import/core/types';
import { SourcesHandler } from '@/renderer/services/export-import/handlers/SourcesHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    appVersion: '3.2.0',
    activeWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sources: [],
    environments: {},
    workspaces: [],
    exportSources: vi.fn(() => []),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    createWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    setVariable: vi.fn(),
    generateEnvironmentSchema: vi.fn(() => ({ environments: {}, variableDefinitions: {} })),
    createEnvironment: vi.fn(),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as ExportImportDependencies;
}

function validSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceType: 'http',
    sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    sourceName: 'Production API Gateway Token',
    sourceContent: null,
    ...overrides,
  } as Source;
}

function makeFileSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    sourceType: 'file',
    sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
    sourceName: 'Staging Token File',
    sourceContent: null,
    ...overrides,
  } as Source;
}

function makeEnvSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    sourceType: 'env',
    sourcePath: 'OAUTH2_ACCESS_TOKEN',
    sourceName: 'OAuth2 Access Token (env)',
    sourceContent: null,
    ...overrides,
  } as Source;
}

// ---------------------------------------------------------------------------
// validateSourcesForExport  (pure)
// ---------------------------------------------------------------------------
describe('SourcesHandler.validateSourcesForExport', () => {
  it('rejects undefined', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport(undefined);
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('accepts empty array', () => {
    const handler = new SourcesHandler(makeDeps());
    expect(handler.validateSourcesForExport([]).success).toBe(true);
  });

  it('rejects invalid sources within array', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([{ sourceType: 'file' } as Source]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
  });

  it('accepts array of valid sources', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([validSource()]);
    expect(r.success).toBe(true);
  });

  it('accepts mixed enterprise source types', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([validSource(), makeFileSource(), makeEnvSource()]);
    expect(r.success).toBe(true);
  });

  it('aggregates multiple source errors', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([{} as Source, {} as Source]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
    expect(r.error).toContain('Source 2');
  });
});

// ---------------------------------------------------------------------------
// getSourcesStatistics  (pure)
// ---------------------------------------------------------------------------
describe('SourcesHandler.getSourcesStatistics', () => {
  it('returns zero for non-array', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics(undefined);
    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it('returns zero for empty array', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([]);
    expect(stats.total).toBe(0);
  });

  it('counts enterprise sources by type', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([
      validSource(),
      makeFileSource(),
      makeEnvSource(),
      validSource({
        sourceId: 'd4e5f6a7-b890-1234-abcd-567890123456',
        sourcePath: 'https://api.openheaders.io:8443/v2/config',
      }),
    ]);
    expect(stats).toEqual({
      total: 4,
      byType: { http: 2, file: 1, env: 1 },
    });
  });

  it('counts unknown type as "unknown"', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([{ sourceId: 'x' } as Source]);
    expect(stats.byType.unknown).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// exportSources  (async, filters invalid sources)
// ---------------------------------------------------------------------------
describe('SourcesHandler.exportSources', () => {
  it('returns null when sources not selected', async () => {
    const handler = new SourcesHandler(makeDeps({ sources: [validSource()] }));
    const result = await handler.exportSources({ selectedItems: { sources: false } });
    expect(result).toBeNull();
  });

  it('returns valid sources, filtering invalid ones', async () => {
    const handler = new SourcesHandler(makeDeps({ sources: [validSource(), { bad: true } as unknown as Source] }));
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toHaveLength(1);
    expect(result![0].sourceId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result![0].sourceType).toBe('http');
    expect(result![0].sourcePath).toBe('https://auth.openheaders.internal:8443/oauth2/token');
  });

  it('returns empty array when no sources exist', async () => {
    const handler = new SourcesHandler(makeDeps({ sources: [] }));
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toEqual([]);
  });

  it('handles undefined sources gracefully', async () => {
    const handler = new SourcesHandler(makeDeps({ sources: undefined }));
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// importSources  (async orchestration)
// ---------------------------------------------------------------------------
describe('SourcesHandler.importSources', () => {
  it('returns empty stats for empty array', async () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = await handler.importSources([], { importMode: IMPORT_MODES.MERGE, selectedItems: {} });
    expect(stats.imported).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  it('returns empty stats for non-array', async () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = await handler.importSources(undefined, { importMode: IMPORT_MODES.MERGE, selectedItems: {} });
    expect(stats.imported).toBe(0);
  });

  it('calls _clearExistingSources in replace mode', async () => {
    const handler = new SourcesHandler(makeDeps({ exportSources: vi.fn(() => []) }));
    const clearSpy = vi.spyOn(handler, '_clearExistingSources').mockResolvedValue(undefined);
    vi.spyOn(handler, '_importSingleSource').mockResolvedValue({ imported: true });

    await handler.importSources([validSource()], { importMode: IMPORT_MODES.REPLACE, selectedItems: {} });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('records errors for failed individual imports', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler, '_importSingleSource').mockRejectedValue(new Error('fail'));

    const stats = await handler.importSources([validSource()], { importMode: IMPORT_MODES.MERGE, selectedItems: {} });
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toBe('fail');
  });

  it('counts imported and skipped correctly', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler, '_importSingleSource')
      .mockResolvedValueOnce({ imported: true })
      .mockResolvedValueOnce({ skipped: true })
      .mockResolvedValueOnce({ imported: true });

    const stats = await handler.importSources([validSource(), makeFileSource(), makeEnvSource()], {
      importMode: IMPORT_MODES.MERGE,
      selectedItems: {},
    });
    expect(stats).toEqual({
      imported: 2,
      skipped: 1,
      errors: [],
    });
  });

  it('imports enterprise sources in replace mode clearing existing first', async () => {
    const existingSources = [validSource(), makeFileSource()];
    const removeSource = vi.fn().mockResolvedValue(true);
    const handler = new SourcesHandler(
      makeDeps({
        exportSources: () => existingSources,
        removeSource,
      }),
    );
    vi.spyOn(handler, '_importSingleSource').mockResolvedValue({ imported: true });

    const stats = await handler.importSources([makeEnvSource()], {
      importMode: IMPORT_MODES.REPLACE,
      selectedItems: {},
    });

    expect(removeSource).toHaveBeenCalledTimes(2);
    expect(removeSource).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(removeSource).toHaveBeenCalledWith('b2c3d4e5-f6a7-8901-bcde-f12345678901');
    expect(stats.imported).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// _getCurrentSources
// ---------------------------------------------------------------------------
describe('SourcesHandler._getCurrentSources', () => {
  it('returns result of exportSources dependency', () => {
    const sources = [validSource()];
    const handler = new SourcesHandler(makeDeps({ exportSources: () => sources }));
    expect(handler._getCurrentSources()).toBe(sources);
  });

  it('returns empty array when exportSources throws', () => {
    const handler = new SourcesHandler(
      makeDeps({
        exportSources: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(handler._getCurrentSources()).toEqual([]);
  });

  it('returns empty array when exportSources is not defined', () => {
    const handler = new SourcesHandler(makeDeps({ exportSources: undefined }));
    expect(handler._getCurrentSources()).toEqual([]);
  });
});
