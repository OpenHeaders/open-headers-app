import { describe, it, expect, vi } from 'vitest';

// Mock CentralizedEnvironmentService (transitively imported via EnvironmentsHandler)
vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import { ExportService } from '../../../../src/renderer/services/export-import/core/ExportService';
import { FILE_FORMATS, DEFAULTS } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies, ExportOptions, ExportData, WorkspaceData } from '../../../../src/renderer/services/export-import/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}): ExportImportDependencies {
  return {
    appVersion: '3.0.0',
    activeWorkspaceId: 'ws-1',
    environments: {},
    sources: [],
    workspaces: [],
    exportSources: vi.fn(() => []),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    createWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    setVariable: vi.fn(),
    generateEnvironmentSchema: vi.fn(() => ({
      environments: {},
      variableDefinitions: {},
    })),
    createEnvironment: vi.fn(),
    ...overrides,
  } as ExportImportDependencies;
}

// ---------------------------------------------------------------------------
// _validateExportOptions  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._validateExportOptions', () => {
  it('throws for null options', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportOptions(null as unknown as ExportOptions))
      .toThrow('Export options must be provided');
  });

  it('throws for non-object options', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportOptions('str' as unknown as ExportOptions))
      .toThrow('Export options must be provided');
  });

  it('throws when selectedItems is missing', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportOptions({} as unknown as ExportOptions))
      .toThrow('Selected items must be specified');
  });

  it('throws when no items are selected', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({
      selectedItems: { sources: false, rules: false },
    })).toThrow('At least one data type');
  });

  it('throws for invalid file format', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({
      selectedItems: { sources: true },
      fileFormat: 'invalid-format',
    })).toThrow('Invalid file format');
  });

  it('accepts valid options with single format', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({
      selectedItems: { sources: true },
      fileFormat: FILE_FORMATS.SINGLE,
    })).not.toThrow();
  });

  it('accepts valid options with separate format', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({
      selectedItems: { sources: true },
      fileFormat: FILE_FORMATS.SEPARATE,
    })).not.toThrow();
  });

  it('accepts valid options without fileFormat (optional)', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({
      selectedItems: { rules: true },
    })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _countExportItems  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._countExportItems', () => {
  it('returns 0 for empty data', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({} as unknown as ExportData)).toBe(0);
  });

  it('counts sources array', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing numbers to test runtime counting logic
    expect(service._countExportItems({ sources: [1, 2, 3] } as unknown as ExportData)).toBe(3);
  });

  it('counts proxyRules array', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing numbers to test runtime counting logic
    expect(service._countExportItems({ proxyRules: [1, 2] } as unknown as ExportData)).toBe(2);
  });

  it('counts rules across types', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing numbers to test runtime counting logic
    expect(service._countExportItems({
      rules: {
        header: [1, 2],
        payload: [3],
        url: [],
      },
    } as unknown as ExportData)).toBe(3);
  });

  it('counts environment variables', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing numbers to test runtime counting logic
    expect(service._countExportItems({
      environments: {
        dev: { A: 1, B: 2 },
        staging: { C: 3 },
      },
    } as unknown as ExportData)).toBe(3);
  });

  it('counts workspace as 1', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ workspace: { name: 'ws', type: 'local' } } as unknown as ExportData)).toBe(1);
  });

  it('counts all types combined', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing numbers to test runtime counting logic
    const count = service._countExportItems({
      sources: [1],
      proxyRules: [2, 3],
      rules: { header: [4] },
      environments: { dev: { A: 5 } },
      workspace: { name: 'ws', type: 'local' },
    } as unknown as ExportData);
    expect(count).toBe(6); // 1 + 2 + 1 + 1 + 1
  });

  it('skips non-array sources', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(service._countExportItems({ sources: 'not-array' } as unknown as ExportData)).toBe(0);
  });

  it('skips non-array proxyRules', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(service._countExportItems({ proxyRules: 'not-array' } as unknown as ExportData)).toBe(0);
  });

  it('skips non-object rules', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(service._countExportItems({ rules: 'not-object' } as unknown as ExportData)).toBe(0);
  });

  it('handles array values in environments gracefully', () => {
    const service = new ExportService(makeDeps());
    // Arrays inside environments should not be counted
    // intentionally passing invalid input to test runtime validation
    expect(service._countExportItems({
      environments: { dev: [1, 2] },
    } as unknown as ExportData)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _calculateExportSize  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._calculateExportSize', () => {
  it('returns size string for small data', () => {
    const service = new ExportService(makeDeps());
    const size = service._calculateExportSize({ a: 1 } as unknown as ExportData);
    expect(size).toContain('bytes');
  });

  it('returns KB for medium data', () => {
    const service = new ExportService(makeDeps());
    const largeObj: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      largeObj[`key${i}`] = 'x'.repeat(10);
    }
    const size = service._calculateExportSize(largeObj as unknown as ExportData);
    expect(size).toContain('KB');
  });

  it('returns "unknown size" on error', () => {
    const service = new ExportService(makeDeps());
    // Circular reference causes JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const size = service._calculateExportSize(circular as unknown as ExportData);
    expect(size).toBe('unknown size');
  });
});

// ---------------------------------------------------------------------------
// _sanitizeOptionsForLogging  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._sanitizeOptionsForLogging', () => {
  it('redacts authData in workspace', () => {
    const service = new ExportService(makeDeps());
    const result = service._sanitizeOptionsForLogging({
      fileFormat: 'single',
      currentWorkspace: {
        name: 'WS',
        type: 'local',
        authData: { token: 'secret' },
      } as unknown as WorkspaceData,
    } as unknown as ExportOptions);
    expect(result.currentWorkspace!.authData).toBeUndefined();
    expect(result.currentWorkspace!.name).toBe('WS');
    expect(result.fileFormat).toBe('single');
  });

  it('does not modify options without authData', () => {
    const service = new ExportService(makeDeps());
    const result = service._sanitizeOptionsForLogging({
      fileFormat: 'single',
      currentWorkspace: { name: 'WS', type: 'local' },
    } as unknown as ExportOptions);
    expect(result.currentWorkspace!.authData).toBeUndefined();
  });

  it('handles options without currentWorkspace', () => {
    const service = new ExportService(makeDeps());
    const result = service._sanitizeOptionsForLogging({ fileFormat: 'single' } as unknown as ExportOptions);
    expect(result.fileFormat).toBe('single');
  });
});

// ---------------------------------------------------------------------------
// getExportStatistics  (orchestration of pure handlers)
// ---------------------------------------------------------------------------
describe('ExportService.getExportStatistics', () => {
  it('returns version and totalItems', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({ version: '3.0.0' } as ExportData);
    expect(stats.version).toBe('3.0.0');
    expect(stats.totalItems).toBe(0);
    expect(stats.dataTypes).toEqual({});
  });

  it('includes sources statistics when present', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      sources: [{ sourceType: 'file', sourceId: 's1', sourcePath: '/a' }],
    } as unknown as ExportData);
    expect(stats.dataTypes.sources).toBeDefined();
    expect(stats.dataTypes.sources!.total).toBe(1);
  });

  it('includes proxy rules statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      proxyRules: [{ id: 'pr1', enabled: true }],
    } as unknown as ExportData);
    expect(stats.dataTypes.proxyRules).toBeDefined();
    expect(stats.dataTypes.proxyRules!.total).toBe(1);
  });

  it('includes rules statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      rules: { header: [{ id: '1' }] },
      rulesMetadata: { totalRules: 1, lastUpdated: 'now' },
    } as unknown as ExportData);
    expect(stats.dataTypes.rules).toBeDefined();
    expect(stats.dataTypes.rules!.total).toBe(1);
  });

  it('includes environment statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      environments: { dev: { A: { value: 'val', isSecret: false } } },
    } as unknown as ExportData);
    expect(stats.dataTypes.environments).toBeDefined();
    expect(stats.dataTypes.environments!.environments).toBe(1);
  });

  it('includes workspace statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      workspace: { name: 'WS', type: 'git' },
    } as unknown as ExportData);
    expect(stats.dataTypes.workspace).toBeDefined();
    expect(stats.dataTypes.workspace!.hasWorkspace).toBe(true);
    expect(stats.dataTypes.workspace!.name).toBe('WS');
  });

  it('includes all data types together', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      sources: [{ sourceType: 'file', sourceId: 's1', sourcePath: '/a' }],
      proxyRules: [{ id: 'pr1' }],
      rules: { header: [{ id: '1' }] },
      environments: { dev: { A: { value: '1', isSecret: false } } },
      workspace: { name: 'W', type: 'git' },
    } as unknown as ExportData);
    expect(Object.keys(stats.dataTypes)).toEqual(
      expect.arrayContaining(['sources', 'proxyRules', 'rules', 'environments', 'workspace'])
    );
    expect(stats.totalItems).toBe(5); // 1+1+1+1+1
  });
});

// ---------------------------------------------------------------------------
// _validateExportData  (validation orchestration)
// ---------------------------------------------------------------------------
describe('ExportService._validateExportData', () => {
  it('does not throw for empty export data with no selections', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { version: '3.0.0' } as ExportData,
      { selectedItems: {} } as ExportOptions
    )).not.toThrow();
  });

  it('throws when sources validation fails', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportData(
      { sources: 'not-array' } as unknown as ExportData,
      { selectedItems: { sources: true } } as ExportOptions
    )).toThrow('Sources validation failed');
  });

  it('throws when proxy rules validation fails', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportData(
      { proxyRules: 'not-array' } as unknown as ExportData,
      { selectedItems: { proxyRules: true } } as ExportOptions
    )).toThrow('Proxy rules validation failed');
  });

  it('throws when rules validation fails', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportData(
      { rules: 'not-object' } as unknown as ExportData,
      { selectedItems: { rules: true } } as ExportOptions
    )).toThrow('Rules validation failed');
  });

  it('throws when environment schema validation fails', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation
    expect(() => service._validateExportData(
      { environmentSchema: 'bad' } as unknown as ExportData,
      { selectedItems: {} } as ExportOptions
    )).toThrow('Environments validation failed');
  });

  it('throws when workspace validation fails', () => {
    const service = new ExportService(makeDeps());
    // intentionally passing invalid input to test runtime validation — missing name
    expect(() => service._validateExportData(
      { workspace: { type: 'git' } } as unknown as ExportData,
      { selectedItems: {} } as ExportOptions
    )).toThrow('Workspace validation failed');
  });

  it('does not throw for valid data', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      {
        sources: [{ sourceId: 's1', sourceType: 'file', sourcePath: '/a' }],
        workspace: { name: 'WS', type: 'git' },
      } as unknown as ExportData,
      { selectedItems: { sources: true } } as ExportOptions
    )).not.toThrow();
  });
});
