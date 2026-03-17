import { describe, it, expect, vi } from 'vitest';
import { SourcesHandler } from '../../../../src/renderer/services/export-import/handlers/SourcesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Record<string, any> = {}) {
  return {
    sources: [],
    exportSources: vi.fn(() => []),
    removeSource: vi.fn(),
    ...overrides,
  };
}

function validSource(overrides: Record<string, any> = {}) {
  return {
    sourceId: 's1',
    sourceType: 'file',
    sourcePath: '/tmp/data.json',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateSourcesForExport  (pure)
// ---------------------------------------------------------------------------
describe('SourcesHandler.validateSourcesForExport', () => {
  it('rejects non-array', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport('bad' as any);
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('accepts empty array', () => {
    const handler = new SourcesHandler(makeDeps());
    expect(handler.validateSourcesForExport([]).success).toBe(true);
  });

  it('rejects invalid sources within array', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([{ sourceType: 'file' }]); // missing required fields
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
  });

  it('accepts array of valid sources', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([validSource()]);
    expect(r.success).toBe(true);
  });

  it('aggregates multiple source errors', () => {
    const handler = new SourcesHandler(makeDeps());
    const r = handler.validateSourcesForExport([{}, {}]);
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
    const stats = handler.getSourcesStatistics('bad' as any);
    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it('returns zero for empty array', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([]);
    expect(stats.total).toBe(0);
  });

  it('counts sources by type', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([
      validSource({ sourceType: 'file' }),
      validSource({ sourceType: 'http', sourceId: 's2', sourcePath: 'https://x.com' }),
      validSource({ sourceType: 'file', sourceId: 's3' }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.byType.file).toBe(2);
    expect(stats.byType.http).toBe(1);
  });

  it('counts unknown type as "unknown"', () => {
    const handler = new SourcesHandler(makeDeps());
    const stats = handler.getSourcesStatistics([{ sourceId: 'x' }]);
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
    const handler = new SourcesHandler(
      makeDeps({ sources: [validSource(), { bad: true }] })
    );
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('s1');
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
    const stats = await handler.importSources(null as any, { importMode: IMPORT_MODES.MERGE, selectedItems: {} });
    expect(stats.imported).toBe(0);
  });

  it('calls _clearExistingSources in replace mode', async () => {
    const handler = new SourcesHandler(makeDeps({ exportSources: vi.fn(() => []) }));
    const clearSpy = vi.spyOn(handler as any, '_clearExistingSources').mockResolvedValue(undefined);
    vi.spyOn(handler as any, '_importSingleSource').mockResolvedValue({ imported: true });

    await handler.importSources(
      [validSource()],
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} }
    );

    expect(clearSpy).toHaveBeenCalled();
  });

  it('records errors for failed individual imports', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler as any, '_importSingleSource').mockRejectedValue(new Error('fail'));

    const stats = await handler.importSources(
      [validSource()],
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toBe('fail');
  });

  it('counts imported and skipped correctly', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler as any, '_importSingleSource')
      .mockResolvedValueOnce({ imported: true })
      .mockResolvedValueOnce({ skipped: true })
      .mockResolvedValueOnce({ imported: true });

    const stats = await handler.importSources(
      [validSource(), validSource({ sourceId: 's2' }), validSource({ sourceId: 's3' })],
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );
    expect(stats.imported).toBe(2);
    expect(stats.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// _getCurrentSources
// ---------------------------------------------------------------------------
describe('SourcesHandler._getCurrentSources', () => {
  it('returns result of exportSources dependency', () => {
    const sources = [validSource()];
    const handler = new SourcesHandler(makeDeps({ exportSources: () => sources }));
    expect((handler as any)._getCurrentSources()).toBe(sources);
  });

  it('returns empty array when exportSources throws', () => {
    const handler = new SourcesHandler(makeDeps({
      exportSources: () => { throw new Error('boom'); },
    }));
    expect((handler as any)._getCurrentSources()).toEqual([]);
  });

  it('returns empty array when exportSources is not defined', () => {
    const handler = new SourcesHandler(makeDeps({ exportSources: undefined }));
    expect((handler as any)._getCurrentSources()).toEqual([]);
  });
});
