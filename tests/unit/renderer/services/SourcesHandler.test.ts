import { describe, it, expect, vi } from 'vitest';
import { SourcesHandler } from '../../../../src/renderer/services/export-import/handlers/SourcesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies } from '../../../../src/renderer/services/export-import/core/types';
import type { Source } from '../../../../src/types/source';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    sources: [],
    exportSources: vi.fn(() => []),
    removeSource: vi.fn(),
    ...overrides,
  } as ExportImportDependencies;
}

function validSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 's1',
    sourceType: 'file',
    sourcePath: '/tmp/data.json',
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
    // Intentionally invalid source to test validation
    const r = handler.validateSourcesForExport([{ sourceType: 'file' } as Source]);
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
    // Intentionally invalid sources to test validation
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
    // Intentionally missing sourceType to test unknown type handling
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
    const handler = new SourcesHandler(
      // Intentionally invalid source to test filtering
      makeDeps({ sources: [validSource(), { bad: true } as unknown as Source] })
    );
    const result = await handler.exportSources({ selectedItems: { sources: true } });
    expect(result).toHaveLength(1);
    expect(result![0].sourceId).toBe('s1');
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

    await handler.importSources(
      [validSource()],
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} }
    );

    expect(clearSpy).toHaveBeenCalled();
  });

  it('records errors for failed individual imports', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler, '_importSingleSource').mockRejectedValue(new Error('fail'));

    const stats = await handler.importSources(
      [validSource()],
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toBe('fail');
  });

  it('counts imported and skipped correctly', async () => {
    const handler = new SourcesHandler(makeDeps());
    vi.spyOn(handler, '_importSingleSource')
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
    expect(handler._getCurrentSources()).toBe(sources);
  });

  it('returns empty array when exportSources throws', () => {
    const handler = new SourcesHandler(makeDeps({
      exportSources: () => { throw new Error('boom'); },
    }));
    expect(handler._getCurrentSources()).toEqual([]);
  });

  it('returns empty array when exportSources is not defined', () => {
    const handler = new SourcesHandler(makeDeps({ exportSources: undefined }));
    expect(handler._getCurrentSources()).toEqual([]);
  });
});
