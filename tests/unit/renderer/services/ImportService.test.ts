import { describe, it, expect, vi } from 'vitest';

// Mock CentralizedEnvironmentService (transitively imported via EnvironmentsHandler)
vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import { ImportService } from '../../../../src/renderer/services/export-import/core/ImportService';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies, ImportOptions } from '../../../../src/renderer/services/export-import/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}): ExportImportDependencies {
  return {
    appVersion: '3.2.0',
    activeWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    environments: {},
    sources: [],
    workspaces: [],
    exportSources: vi.fn(() => []),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    createWorkspace: vi.fn(async (ws) => ws),
    switchWorkspace: vi.fn(),
    setVariable: vi.fn(),
    generateEnvironmentSchema: vi.fn(() => ({
      environments: {},
      variableDefinitions: {},
    })),
    createEnvironment: vi.fn(),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as ExportImportDependencies;
}

/** Minimal valid import stats for _hasImportedData */
function makeStats(overrides: Record<string, unknown> = {}) {
  return {
    sourcesImported: 0,
    sourcesSkipped: 0,
    proxyRulesImported: 0,
    proxyRulesSkipped: 0,
    rulesImported: { total: 0 },
    rulesSkipped: { total: 0 },
    environmentsImported: 0,
    variablesCreated: 0,
    errors: [] as Array<{ error: string }>,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _validateImportOptions  (pure)
// ---------------------------------------------------------------------------
describe('ImportService._validateImportOptions', () => {
  it('throws for null options', () => {
    const service = new ImportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateImportOptions(null as unknown as ImportOptions))
      .toThrow('Import options must be provided');
  });

  it('throws for non-object options', () => {
    const service = new ImportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateImportOptions('str' as unknown as ImportOptions))
      .toThrow('Import options must be provided');
  });

  it('throws when fileContent is missing', () => {
    const service = new ImportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateImportOptions({
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.MERGE,
    } as unknown as ImportOptions)).toThrow('File content must be provided');
  });

  it('throws when fileContent is not a string', () => {
    const service = new ImportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateImportOptions({
      fileContent: 123,
      selectedItems: { sources: true },
    } as unknown as ImportOptions)).toThrow('File content must be provided as a string');
  });

  it('throws when selectedItems is missing', () => {
    const service = new ImportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateImportOptions({
      fileContent: '{}',
    } as unknown as ImportOptions)).toThrow('Selected items must be specified');
  });

  it('throws when no items are selected', () => {
    const service = new ImportService(makeDeps());
    expect(() => service._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: false, rules: false },
    })).toThrow('At least one data type');
  });

  it('throws for invalid import mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => service._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: 'invalid-mode',
    })).toThrow('Invalid import mode');
  });

  it('accepts valid merge mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => service._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.MERGE,
    })).not.toThrow();
  });

  it('accepts valid replace mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => service._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.REPLACE,
    })).not.toThrow();
  });

  it('accepts options without importMode (optional)', () => {
    const service = new ImportService(makeDeps());
    expect(() => service._validateImportOptions({
      fileContent: '{}',
      selectedItems: { rules: true },
    })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _hasImportedData  (pure)
// ---------------------------------------------------------------------------
describe('ImportService._hasImportedData', () => {
  it('returns false when nothing was imported', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats())).toBe(false);
  });

  it('returns true when sources were imported', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats({ sourcesImported: 1 }))).toBe(true);
  });

  it('returns true when proxy rules were imported', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats({ proxyRulesImported: 3 }))).toBe(true);
  });

  it('returns true when rules were imported', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats({ rulesImported: { total: 5 } }))).toBe(true);
  });

  it('returns true when environments were imported', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats({ environmentsImported: 2 }))).toBe(true);
  });

  it('returns true when a workspace was created', () => {
    const service = new ImportService(makeDeps());
    expect(service._hasImportedData(makeStats({ createdWorkspace: { name: 'WS' } }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getImportStatistics  (pure)
// ---------------------------------------------------------------------------
describe('ImportService.getImportStatistics', () => {
  it('returns zeros for empty stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats());
    expect(stats.totalImported).toBe(0);
    expect(stats.totalSkipped).toBe(0);
    expect(stats.totalErrors).toBe(0);
  });

  it('aggregates sources stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      sourcesImported: 3,
      sourcesSkipped: 1,
    }));
    expect(stats.totalImported).toBe(3);
    expect(stats.totalSkipped).toBe(1);
    expect(stats.dataTypes.sources).toEqual({ imported: 3, skipped: 1 });
  });

  it('aggregates proxy rules stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      proxyRulesImported: 5,
      proxyRulesSkipped: 2,
    }));
    expect(stats.totalImported).toBe(5);
    expect(stats.totalSkipped).toBe(2);
    expect(stats.dataTypes.proxyRules).toEqual({ imported: 5, skipped: 2 });
  });

  it('aggregates rules stats with byType', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      rulesImported: { total: 4, header: 2, payload: 2 },
      rulesSkipped: { total: 1 },
    }));
    expect(stats.totalImported).toBe(4);
    expect(stats.totalSkipped).toBe(1);
    expect(stats.dataTypes.rules!.imported).toBe(4);
    expect(stats.dataTypes.rules!.skipped).toBe(1);
    // byType should not have 'total' key
    expect(stats.dataTypes.rules!.byType.total).toBeUndefined();
    expect(stats.dataTypes.rules!.byType.header).toBe(2);
  });

  it('aggregates environment stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      environmentsImported: 2,
      variablesCreated: 10,
    }));
    expect(stats.dataTypes.environments).toEqual({
      environmentsImported: 2,
      variablesCreated: 10,
    });
  });

  it('aggregates workspace stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      createdWorkspace: { name: 'WS', type: 'git' },
    }));
    expect(stats.dataTypes.workspace).toEqual({
      created: true,
      name: 'WS',
      type: 'git',
    });
  });

  it('counts errors', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      errors: [{ error: 'e1' }, { error: 'e2' }],
    }));
    expect(stats.totalErrors).toBe(2);
  });

  it('handles missing errors array', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({ errors: undefined }));
    expect(stats.totalErrors).toBe(0);
  });

  it('handles combined import with all data types', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics(makeStats({
      sourcesImported: 2,
      sourcesSkipped: 0,
      proxyRulesImported: 3,
      proxyRulesSkipped: 1,
      rulesImported: { total: 5, header: 3, payload: 2 },
      rulesSkipped: { total: 0 },
      environmentsImported: 1,
      variablesCreated: 4,
      createdWorkspace: { name: 'WS', type: 'git' },
      errors: [{ error: 'minor' }],
    }));

    expect(stats.totalImported).toBe(10); // 2+3+5
    expect(stats.totalSkipped).toBe(1); // 0+1+0
    expect(stats.totalErrors).toBe(1);
    expect(Object.keys(stats.dataTypes)).toEqual(
      expect.arrayContaining(['sources', 'proxyRules', 'rules', 'environments', 'workspace'])
    );
  });
});

// ---------------------------------------------------------------------------
// _parseImportFiles  (integration-ish, tests merging logic)
// ---------------------------------------------------------------------------
describe('ImportService._parseImportFiles', () => {
  it('parses valid main file content', async () => {
    const service = new ImportService(makeDeps());
    const result = await service._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0', sources: [] }),
    } as ImportOptions);
    expect(result.importData.version).toBe('3.0.0');
    expect(result.envData).toBeNull();
  });

  it('throws for invalid main file JSON', async () => {
    const service = new ImportService(makeDeps());
    await expect(service._parseImportFiles({
      fileContent: 'not-json',
    } as ImportOptions)).rejects.toThrow('Main file parsing failed');
  });

  it('merges env file data into importData', async () => {
    const service = new ImportService(makeDeps());
    const result = await service._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environmentSchema: { environments: { dev: {} } },
        environments: { dev: { KEY: 'val' } },
      }),
    } as ImportOptions);
    expect(result.importData.environmentSchema).toBeDefined();
    expect(result.importData.environments).toBeDefined();
    expect(result.envData).toBeDefined();
  });

  it('throws for invalid env file JSON', async () => {
    const service = new ImportService(makeDeps());
    await expect(service._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: 'bad-json',
    } as ImportOptions)).rejects.toThrow('Environment file parsing failed');
  });

  it('handles env file with only environmentSchema', async () => {
    const service = new ImportService(makeDeps());
    const result = await service._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environmentSchema: { environments: { dev: {} } },
      }),
    } as ImportOptions);
    expect(result.importData.environmentSchema).toBeDefined();
    expect(result.importData.environments).toBeUndefined();
  });

  it('handles env file with only environments', async () => {
    const service = new ImportService(makeDeps());
    const result = await service._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environments: { dev: { KEY: 'val' } },
      }),
    } as ImportOptions);
    expect(result.importData.environmentSchema).toBeUndefined();
    expect(result.importData.environments).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// _handleWorkspaceImport  (delegation)
// ---------------------------------------------------------------------------
describe('ImportService._handleWorkspaceImport', () => {
  it('returns null workspace when no workspace data', async () => {
    const service = new ImportService(makeDeps());
    const stats = await service._handleWorkspaceImport({}, {} as ImportOptions);
    expect(stats.createdWorkspace).toBeNull();
  });

  it('uses workspaceInfo from options when present', async () => {
    const service = new ImportService(makeDeps());
    const importSpy = vi.spyOn(service.workspaceHandler, 'importWorkspace')
      .mockResolvedValue({ createdWorkspace: { name: 'WS', type: 'git' }, errors: [] });

    await service._handleWorkspaceImport(
      {},
      { workspaceInfo: { name: 'WS', type: 'git' } } as ImportOptions
    );

    expect(importSpy).toHaveBeenCalledWith(
      { name: 'WS', type: 'git' },
      expect.any(Object)
    );
  });

  it('falls back to importData.workspace', async () => {
    const service = new ImportService(makeDeps());
    const importSpy = vi.spyOn(service.workspaceHandler, 'importWorkspace')
      .mockResolvedValue({ createdWorkspace: { name: 'WS2', type: 'git' }, errors: [] });

    await service._handleWorkspaceImport(
      { workspace: { name: 'WS2', type: 'git' } },
      {} as ImportOptions
    );

    expect(importSpy).toHaveBeenCalledWith(
      { name: 'WS2', type: 'git' },
      expect.any(Object)
    );
  });
});
