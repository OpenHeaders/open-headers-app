import { describe, it, expect, vi } from 'vitest';

// Mock CentralizedEnvironmentService (transitively imported via EnvironmentsHandler)
vi.mock('../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import { ExportService } from '../../../../src/renderer/services/export-import/core/ExportService';
import { FILE_FORMATS, DEFAULTS } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies } from '../../../../src/renderer/services/export-import/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    activeWorkspaceId: 'ws-1',
    environments: {},
    sources: [],
    generateEnvironmentSchema: vi.fn(() => ({
      environments: {},
      variableDefinitions: {},
    })),
    createEnvironment: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _validateExportOptions  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._validateExportOptions', () => {
  it('throws for null options', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions(null))
      .toThrow('Export options must be provided');
  });

  it('throws for non-object options', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions('str'))
      .toThrow('Export options must be provided');
  });

  it('throws when selectedItems is missing', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportOptions({}))
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
    expect(service._countExportItems({})).toBe(0);
  });

  it('counts sources array', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ sources: [1, 2, 3] })).toBe(3);
  });

  it('counts proxyRules array', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ proxyRules: [1, 2] })).toBe(2);
  });

  it('counts rules across types', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({
      rules: {
        header: [1, 2],
        payload: [3],
        url: [],
      },
    })).toBe(3);
  });

  it('counts environment variables', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({
      environments: {
        dev: { A: 1, B: 2 },
        staging: { C: 3 },
      },
    })).toBe(3);
  });

  it('counts workspace as 1', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ workspace: { name: 'ws' } })).toBe(1);
  });

  it('counts all types combined', () => {
    const service = new ExportService(makeDeps());
    const count = service._countExportItems({
      sources: [1],
      proxyRules: [2, 3],
      rules: { header: [4] },
      environments: { dev: { A: 5 } },
      workspace: { name: 'ws' },
    });
    expect(count).toBe(6); // 1 + 2 + 1 + 1 + 1
  });

  it('skips non-array sources', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ sources: 'not-array' })).toBe(0);
  });

  it('skips non-array proxyRules', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ proxyRules: 'not-array' })).toBe(0);
  });

  it('skips non-object rules', () => {
    const service = new ExportService(makeDeps());
    expect(service._countExportItems({ rules: 'not-object' })).toBe(0);
  });

  it('handles array values in environments gracefully', () => {
    const service = new ExportService(makeDeps());
    // Arrays inside environments should not be counted
    expect(service._countExportItems({
      environments: { dev: [1, 2] },
    })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _calculateExportSize  (pure)
// ---------------------------------------------------------------------------
describe('ExportService._calculateExportSize', () => {
  it('returns size string for small data', () => {
    const service = new ExportService(makeDeps());
    const size = service._calculateExportSize({ a: 1 });
    expect(size).toContain('bytes');
  });

  it('returns KB for medium data', () => {
    const service = new ExportService(makeDeps());
    const largeObj: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      largeObj[`key${i}`] = 'x'.repeat(10);
    }
    const size = service._calculateExportSize(largeObj);
    expect(size).toContain('KB');
  });

  it('returns "unknown size" on error', () => {
    const service = new ExportService(makeDeps());
    // Circular reference causes JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const size = service._calculateExportSize(circular);
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
        authData: { token: 'secret' },
      },
    });
    expect(result.currentWorkspace.authData).toBeUndefined();
    expect(result.currentWorkspace.name).toBe('WS');
    expect(result.fileFormat).toBe('single');
  });

  it('does not modify options without authData', () => {
    const service = new ExportService(makeDeps());
    const result = service._sanitizeOptionsForLogging({
      fileFormat: 'single',
      currentWorkspace: { name: 'WS' },
    });
    expect(result.currentWorkspace.authData).toBeUndefined();
  });

  it('handles options without currentWorkspace', () => {
    const service = new ExportService(makeDeps());
    const result = service._sanitizeOptionsForLogging({ fileFormat: 'single' });
    expect(result.fileFormat).toBe('single');
  });
});

// ---------------------------------------------------------------------------
// getExportStatistics  (orchestration of pure handlers)
// ---------------------------------------------------------------------------
describe('ExportService.getExportStatistics', () => {
  it('returns version and totalItems', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({ version: '3.0.0' });
    expect(stats.version).toBe('3.0.0');
    expect(stats.totalItems).toBe(0);
    expect(stats.dataTypes).toEqual({});
  });

  it('includes sources statistics when present', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      sources: [{ sourceType: 'file', sourceId: 's1', sourcePath: '/a' }],
    });
    expect(stats.dataTypes.sources).toBeDefined();
    expect(stats.dataTypes.sources.total).toBe(1);
  });

  it('includes proxy rules statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      proxyRules: [{ pattern: 'a.com', headers: [] }],
    });
    expect(stats.dataTypes.proxyRules).toBeDefined();
    expect(stats.dataTypes.proxyRules.total).toBe(1);
  });

  it('includes rules statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      rules: { header: [{ id: '1' }] },
      rulesMetadata: { lastUpdated: 'now' },
    });
    expect(stats.dataTypes.rules).toBeDefined();
    expect(stats.dataTypes.rules.total).toBe(1);
  });

  it('includes environment statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      environments: { dev: { A: 'val' } },
    });
    expect(stats.dataTypes.environments).toBeDefined();
    expect(stats.dataTypes.environments.environments).toBe(1);
  });

  it('includes workspace statistics', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      workspace: { name: 'WS', type: 'git' },
    });
    expect(stats.dataTypes.workspace).toBeDefined();
    expect(stats.dataTypes.workspace.hasWorkspace).toBe(true);
    expect(stats.dataTypes.workspace.name).toBe('WS');
  });

  it('includes all data types together', () => {
    const service = new ExportService(makeDeps());
    const stats = service.getExportStatistics({
      version: '3.0.0',
      sources: [{ sourceType: 'file', sourceId: 's1', sourcePath: '/a' }],
      proxyRules: [{ pattern: 'x.com' }],
      rules: { header: [{ id: '1' }] },
      environments: { dev: { A: '1' } },
      workspace: { name: 'W', type: 'git' },
    });
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
      { version: '3.0.0' },
      { selectedItems: {} }
    )).not.toThrow();
  });

  it('throws when sources validation fails', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { sources: 'not-array' },
      { selectedItems: { sources: true } }
    )).toThrow('Sources validation failed');
  });

  it('throws when proxy rules validation fails', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { proxyRules: 'not-array' },
      { selectedItems: { proxyRules: true } }
    )).toThrow('Proxy rules validation failed');
  });

  it('throws when rules validation fails', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { rules: 'not-object' },
      { selectedItems: { rules: true } }
    )).toThrow('Rules validation failed');
  });

  it('throws when environment schema validation fails', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { environmentSchema: 'bad' },
      { selectedItems: {} }
    )).toThrow('Environments validation failed');
  });

  it('throws when workspace validation fails', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      { workspace: { type: 'git' } }, // missing name
      { selectedItems: {} }
    )).toThrow('Workspace validation failed');
  });

  it('does not throw for valid data', () => {
    const service = new ExportService(makeDeps());
    expect(() => service._validateExportData(
      {
        sources: [{ sourceId: 's1', sourceType: 'file', sourcePath: '/a' }],
        workspace: { name: 'WS', type: 'git' },
      },
      { selectedItems: { sources: true } }
    )).not.toThrow();
  });
});
