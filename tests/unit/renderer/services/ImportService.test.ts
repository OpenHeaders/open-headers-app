import { describe, it, expect, vi } from 'vitest';

// Mock CentralizedEnvironmentService (transitively imported via EnvironmentsHandler)
vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import { ImportService } from '../../../../src/renderer/services/export-import/core/ImportService';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Record<string, any> = {}) {
  return {
    activeWorkspaceId: 'ws-1',
    environments: {},
    sources: [],
    workspaces: [],
    generateEnvironmentSchema: vi.fn(() => ({
      environments: {},
      variableDefinitions: {},
    })),
    createEnvironment: vi.fn(),
    createWorkspace: vi.fn(async (ws) => ws),
    switchWorkspace: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _validateImportOptions  (pure)
// ---------------------------------------------------------------------------
describe('ImportService._validateImportOptions', () => {
  it('throws for null options', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions(null))
      .toThrow('Import options must be provided');
  });

  it('throws for non-object options', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions('str'))
      .toThrow('Import options must be provided');
  });

  it('throws when fileContent is missing', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.MERGE,
    })).toThrow('File content must be provided');
  });

  it('throws when fileContent is not a string', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: 123,
      selectedItems: { sources: true },
    })).toThrow('File content must be provided as a string');
  });

  it('throws when selectedItems is missing', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: '{}',
    })).toThrow('Selected items must be specified');
  });

  it('throws when no items are selected', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: false, rules: false },
    })).toThrow('At least one data type');
  });

  it('throws for invalid import mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: 'invalid-mode',
    })).toThrow('Invalid import mode');
  });

  it('accepts valid merge mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.MERGE,
    })).not.toThrow();
  });

  it('accepts valid replace mode', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
      fileContent: '{}',
      selectedItems: { sources: true },
      importMode: IMPORT_MODES.REPLACE,
    })).not.toThrow();
  });

  it('accepts options without importMode (optional)', () => {
    const service = new ImportService(makeDeps());
    expect(() => (service as any)._validateImportOptions({
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
    expect((service as any)._hasImportedData({
      sourcesImported: 0,
      proxyRulesImported: 0,
      rulesImported: { total: 0 },
      environmentsImported: 0,
    })).toBe(false);
  });

  it('returns true when sources were imported', () => {
    const service = new ImportService(makeDeps());
    expect((service as any)._hasImportedData({
      sourcesImported: 1,
      proxyRulesImported: 0,
      rulesImported: { total: 0 },
      environmentsImported: 0,
    })).toBe(true);
  });

  it('returns true when proxy rules were imported', () => {
    const service = new ImportService(makeDeps());
    expect((service as any)._hasImportedData({
      sourcesImported: 0,
      proxyRulesImported: 3,
      rulesImported: { total: 0 },
      environmentsImported: 0,
    })).toBe(true);
  });

  it('returns true when rules were imported', () => {
    const service = new ImportService(makeDeps());
    expect((service as any)._hasImportedData({
      sourcesImported: 0,
      proxyRulesImported: 0,
      rulesImported: { total: 5 },
      environmentsImported: 0,
    })).toBe(true);
  });

  it('returns true when environments were imported', () => {
    const service = new ImportService(makeDeps());
    expect((service as any)._hasImportedData({
      sourcesImported: 0,
      proxyRulesImported: 0,
      rulesImported: { total: 0 },
      environmentsImported: 2,
    })).toBe(true);
  });

  it('returns true when a workspace was created', () => {
    const service = new ImportService(makeDeps());
    expect((service as any)._hasImportedData({
      sourcesImported: 0,
      proxyRulesImported: 0,
      rulesImported: { total: 0 },
      environmentsImported: 0,
      createdWorkspace: { name: 'WS' },
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getImportStatistics  (pure)
// ---------------------------------------------------------------------------
describe('ImportService.getImportStatistics', () => {
  it('returns zeros for empty stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      sourcesImported: 0,
      sourcesSkipped: 0,
      proxyRulesImported: 0,
      proxyRulesSkipped: 0,
      rulesImported: { total: 0 },
      rulesSkipped: { total: 0 },
      environmentsImported: 0,
      variablesCreated: 0,
      errors: [],
    });
    expect(stats.totalImported).toBe(0);
    expect(stats.totalSkipped).toBe(0);
    expect(stats.totalErrors).toBe(0);
  });

  it('aggregates sources stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      sourcesImported: 3,
      sourcesSkipped: 1,
      errors: [],
    });
    expect(stats.totalImported).toBe(3);
    expect(stats.totalSkipped).toBe(1);
    expect(stats.dataTypes.sources).toEqual({ imported: 3, skipped: 1 });
  });

  it('aggregates proxy rules stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      proxyRulesImported: 5,
      proxyRulesSkipped: 2,
      errors: [],
    });
    expect(stats.totalImported).toBe(5);
    expect(stats.totalSkipped).toBe(2);
    expect(stats.dataTypes.proxyRules).toEqual({ imported: 5, skipped: 2 });
  });

  it('aggregates rules stats with byType', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      rulesImported: { total: 4, header: 2, payload: 2 },
      rulesSkipped: { total: 1 },
      errors: [],
    });
    expect(stats.totalImported).toBe(4);
    expect(stats.totalSkipped).toBe(1);
    expect(stats.dataTypes.rules.imported).toBe(4);
    expect(stats.dataTypes.rules.skipped).toBe(1);
    // byType should not have 'total' key
    expect(stats.dataTypes.rules.byType.total).toBeUndefined();
    expect(stats.dataTypes.rules.byType.header).toBe(2);
  });

  it('aggregates environment stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      environmentsImported: 2,
      variablesCreated: 10,
      errors: [],
    });
    expect(stats.dataTypes.environments).toEqual({
      environmentsImported: 2,
      variablesCreated: 10,
    });
  });

  it('aggregates workspace stats', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      createdWorkspace: { name: 'WS', type: 'git' },
      errors: [],
    });
    expect(stats.dataTypes.workspace).toEqual({
      created: true,
      name: 'WS',
      type: 'git',
    });
  });

  it('counts errors', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
      errors: [{ error: 'e1' }, { error: 'e2' }],
    });
    expect(stats.totalErrors).toBe(2);
  });

  it('handles missing errors array', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({});
    expect(stats.totalErrors).toBe(0);
  });

  it('handles combined import with all data types', () => {
    const service = new ImportService(makeDeps());
    const stats = service.getImportStatistics({
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
    });

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
    const result = await (service as any)._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0', sources: [] }),
    });
    expect(result.importData.version).toBe('3.0.0');
    expect(result.envData).toBeNull();
  });

  it('throws for invalid main file JSON', async () => {
    const service = new ImportService(makeDeps());
    await expect((service as any)._parseImportFiles({
      fileContent: 'not-json',
    })).rejects.toThrow('Main file parsing failed');
  });

  it('merges env file data into importData', async () => {
    const service = new ImportService(makeDeps());
    const result = await (service as any)._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environmentSchema: { environments: { dev: {} } },
        environments: { dev: { KEY: 'val' } },
      }),
    });
    expect(result.importData.environmentSchema).toBeDefined();
    expect(result.importData.environments).toBeDefined();
    expect(result.envData).toBeDefined();
  });

  it('throws for invalid env file JSON', async () => {
    const service = new ImportService(makeDeps());
    await expect((service as any)._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: 'bad-json',
    })).rejects.toThrow('Environment file parsing failed');
  });

  it('handles env file with only environmentSchema', async () => {
    const service = new ImportService(makeDeps());
    const result = await (service as any)._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environmentSchema: { environments: { dev: {} } },
      }),
    });
    expect(result.importData.environmentSchema).toBeDefined();
    expect(result.importData.environments).toBeUndefined();
  });

  it('handles env file with only environments', async () => {
    const service = new ImportService(makeDeps());
    const result = await (service as any)._parseImportFiles({
      fileContent: JSON.stringify({ version: '3.0.0' }),
      envFileContent: JSON.stringify({
        environments: { dev: { KEY: 'val' } },
      }),
    });
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
    const stats = await (service as any)._handleWorkspaceImport({}, {});
    expect(stats.createdWorkspace).toBeNull();
  });

  it('uses workspaceInfo from options when present', async () => {
    const service = new ImportService(makeDeps());
    const importSpy = vi.spyOn(service.workspaceHandler, 'importWorkspace')
      .mockResolvedValue({ createdWorkspace: { name: 'WS' }, errors: [] });

    await (service as any)._handleWorkspaceImport(
      {},
      { workspaceInfo: { name: 'WS', type: 'git' } }
    );

    expect(importSpy).toHaveBeenCalledWith(
      { name: 'WS', type: 'git' },
      expect.any(Object)
    );
  });

  it('falls back to importData.workspace', async () => {
    const service = new ImportService(makeDeps());
    const importSpy = vi.spyOn(service.workspaceHandler, 'importWorkspace')
      .mockResolvedValue({ createdWorkspace: { name: 'WS2' }, errors: [] });

    await (service as any)._handleWorkspaceImport(
      { workspace: { name: 'WS2', type: 'git' } },
      {}
    );

    expect(importSpy).toHaveBeenCalledWith(
      { name: 'WS2', type: 'git' },
      expect.any(Object)
    );
  });
});
