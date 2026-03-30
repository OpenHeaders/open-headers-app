import { describe, expect, it, vi } from 'vitest';

// Mock the version module before importing MessageGeneration
vi.mock('@/config/version.esm', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
  APP_VERSION: '3.1.8',
  SUPPORTED_DATA_VERSIONS: ['1.0.0', '2.0.0', '3.0.0'],
}));

import { SUCCESS_MESSAGES } from '@/renderer/services/export-import/core/ExportImportConfig';
import type {
  ExportData,
  ExportOptions,
  ImportData,
  ImportOptions,
} from '@/renderer/services/export-import/core/types';
import {
  generateEnvironmentVariablesMessage,
  generateErrorMessage,
  generateExportSuccessMessage,
  generateImportSuccessMessage,
  generateImportSummary,
  generateImportWarnings,
  generateProgressMessage,
} from '@/renderer/services/export-import/utilities/MessageGeneration';

function makeExportData(overrides: Record<string, unknown> = {}): ExportData {
  return { version: '3.0.0', ...overrides } as ExportData;
}

function makeExportOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    selectedItems: {},
    fileFormat: 'single',
    environmentOption: 'none',
    includeWorkspace: false,
    ...overrides,
  } as ExportOptions;
}

function makeImportData(overrides: Record<string, unknown> = {}): ImportData {
  return { version: '3.0.0', ...overrides } as ImportData;
}

function makeImportOptions(overrides: Record<string, unknown> = {}): ImportOptions {
  return { mode: 'merge', ...overrides } as unknown as ImportOptions;
}

// ---------------------------------------------------------------------------
// generateExportSuccessMessage
// ---------------------------------------------------------------------------
describe('generateExportSuccessMessage', () => {
  it('includes source count in message', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ selectedItems: { sources: true } }),
      makeExportData({
        sources: [
          { sourceId: 'a1b2c3d4', sourceType: 'http' },
          { sourceId: 'b2c3d4e5', sourceType: 'file' },
        ],
      }),
      ['/Users/jane.doe/Documents/OpenHeaders/export.json'],
    );
    expect(msg).toContain('2 source(s)');
    expect(msg).toContain(SUCCESS_MESSAGES.EXPORT_COMPLETE);
  });

  it('includes rules total count aggregated across types', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ selectedItems: { rules: true } }),
      makeExportData({ rules: { header: [], request: [{}, {}], response: [{}] } }),
      ['/path'],
    );
    expect(msg).toContain('3 rule(s)');
  });

  it('includes proxy rules count', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ selectedItems: { proxyRules: true } }),
      makeExportData({ proxyRules: [{ id: 'pr-1' }] }),
      ['/path'],
    );
    expect(msg).toContain('1 proxy rule(s)');
  });

  it('includes environment schema description', () => {
    const msg = generateExportSuccessMessage(makeExportOptions({ environmentOption: 'schema' }), makeExportData(), [
      '/path',
    ]);
    expect(msg).toContain('environment schema');
  });

  it('includes environment values description', () => {
    const msg = generateExportSuccessMessage(makeExportOptions({ environmentOption: 'values' }), makeExportData(), [
      '/path',
    ]);
    expect(msg).toContain('environments with values');
  });

  it('includes workspace configuration without credentials', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ includeWorkspace: true, includeCredentials: false }),
      makeExportData(),
      ['/path'],
    );
    expect(msg).toContain('workspace configuration');
    expect(msg).not.toContain('credentials');
  });

  it('includes workspace with credentials', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ includeWorkspace: true, includeCredentials: true }),
      makeExportData(),
      ['/path'],
    );
    expect(msg).toContain('workspace configuration with credentials');
  });

  it('mentions file count for separate format with multiple files', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({ selectedItems: { sources: true }, fileFormat: 'separate' }),
      makeExportData({ sources: [{}] }),
      ['/export/sources.json', '/export/rules.json'],
    );
    expect(msg).toContain('2 files');
  });

  it('defaults to "configuration" when nothing selected', () => {
    const msg = generateExportSuccessMessage(makeExportOptions(), makeExportData(), ['/path']);
    expect(msg).toContain('configuration');
  });

  it('combines multiple export items', () => {
    const msg = generateExportSuccessMessage(
      makeExportOptions({
        selectedItems: { sources: true, rules: true, proxyRules: true },
        environmentOption: 'schema',
        includeWorkspace: true,
      }),
      makeExportData({
        sources: [{}, {}],
        rules: { header: [{}] },
        proxyRules: [{}, {}, {}],
      }),
      ['/path/export.json'],
    );
    expect(msg).toContain('2 source(s)');
    expect(msg).toContain('1 rule(s)');
    expect(msg).toContain('3 proxy rule(s)');
    expect(msg).toContain('environment schema');
    expect(msg).toContain('workspace configuration');
  });
});

// ---------------------------------------------------------------------------
// generateImportSuccessMessage
// ---------------------------------------------------------------------------
describe('generateImportSuccessMessage', () => {
  it('returns no-data message for empty stats', () => {
    expect(generateImportSuccessMessage({})).toBe('No new data was imported');
  });

  it('lists imported sources with prefix', () => {
    const msg = generateImportSuccessMessage({ sourcesImported: 3 });
    expect(msg).toContain('3 source(s)');
    expect(msg).toContain(SUCCESS_MESSAGES.IMPORT_COMPLETE);
  });

  it('lists skipped sources', () => {
    const msg = generateImportSuccessMessage({ sourcesSkipped: 2 });
    expect(msg).toContain('2 duplicate source(s) skipped');
  });

  it('lists imported rules with type details', () => {
    const msg = generateImportSuccessMessage({
      rulesImported: { total: 5, request: 3, response: 2 },
    });
    expect(msg).toContain('5 rule(s)');
    expect(msg).toContain('3 request');
    expect(msg).toContain('2 response');
  });

  it('lists skipped rules', () => {
    const msg = generateImportSuccessMessage({ rulesSkipped: { total: 1 } });
    expect(msg).toContain('1 duplicate rule(s) skipped');
  });

  it('lists proxy rules', () => {
    const msg = generateImportSuccessMessage({ proxyRulesImported: 2 });
    expect(msg).toContain('2 proxy rule(s)');
  });

  it('lists skipped proxy rules', () => {
    const msg = generateImportSuccessMessage({ proxyRulesSkipped: 1 });
    expect(msg).toContain('1 duplicate proxy rule(s) skipped');
  });

  it('lists environments with variable count', () => {
    const msg = generateImportSuccessMessage({
      environmentsImported: 2,
      variablesCreated: 5,
    });
    expect(msg).toContain('2 environment(s) with 5 variable(s)');
  });

  it('lists environments without variables when count is 0', () => {
    const msg = generateImportSuccessMessage({ environmentsImported: 1 });
    expect(msg).toContain('1 environment(s)');
    expect(msg).not.toContain('variable');
  });

  it('lists created workspace name', () => {
    const msg = generateImportSuccessMessage({ createdWorkspace: { name: 'OpenHeaders — Production' } });
    expect(msg).toContain('workspace "OpenHeaders — Production"');
  });

  it('uses git sync prefix when isGitSync is true', () => {
    const msg = generateImportSuccessMessage({ sourcesImported: 1 }, true);
    expect(msg).toContain(SUCCESS_MESSAGES.GIT_SYNC_COMPLETE);
  });

  it('combines all import stats into single message', () => {
    const msg = generateImportSuccessMessage({
      sourcesImported: 5,
      sourcesSkipped: 2,
      rulesImported: { total: 3, header: 2, request: 1 },
      proxyRulesImported: 4,
      environmentsImported: 3,
      variablesCreated: 15,
      createdWorkspace: { name: 'OpenHeaders — Staging' },
    });
    expect(msg).toContain('5 source(s)');
    expect(msg).toContain('2 duplicate source(s) skipped');
    expect(msg).toContain('3 rule(s)');
    expect(msg).toContain('4 proxy rule(s)');
    expect(msg).toContain('3 environment(s) with 15 variable(s)');
    expect(msg).toContain('workspace "OpenHeaders — Staging"');
  });
});

// ---------------------------------------------------------------------------
// generateImportSummary
// ---------------------------------------------------------------------------
describe('generateImportSummary', () => {
  it('returns a structured summary with all sections', () => {
    const summary = generateImportSummary({
      sourcesImported: 2,
      sourcesSkipped: 1,
      proxyRulesImported: 3,
      proxyRulesSkipped: 0,
      rulesImported: { total: 4 },
      rulesSkipped: { total: 1 },
      environmentsImported: 1,
      variablesCreated: 5,
      createdWorkspace: { name: 'OpenHeaders — Production' },
    });
    expect(summary).toContain('Import Summary');
    expect(summary).toContain('Sources: 2 imported, 1 skipped');
    expect(summary).toContain('Rules: 4 imported, 1 skipped');
    expect(summary).toContain('Proxy Rules: 3 imported, 0 skipped');
    expect(summary).toContain('Environments: 1 imported');
    expect(summary).toContain('Variables Created: 5');
    expect(summary).toContain('Workspace Created: OpenHeaders — Production');
  });

  it('shows None for no workspace', () => {
    const summary = generateImportSummary({});
    expect(summary).toContain('Workspace Created: None');
  });

  it('uses default zero values for missing stats', () => {
    const summary = generateImportSummary({});
    expect(summary).toContain('Sources: 0 imported, 0 skipped');
    expect(summary).toContain('Rules: 0 imported, 0 skipped');
    expect(summary).toContain('Proxy Rules: 0 imported, 0 skipped');
    expect(summary).toContain('Variables Created: 0');
  });
});

// ---------------------------------------------------------------------------
// generateImportWarnings
// ---------------------------------------------------------------------------
describe('generateImportWarnings', () => {
  it('returns null for no warnings', () => {
    expect(generateImportWarnings(makeImportData(), makeImportOptions())).toBeNull();
  });

  it('warns about version mismatch', () => {
    const result = generateImportWarnings(makeImportData({ version: '1.0.0' }), makeImportOptions());
    expect(result).toContain('version 1.0.0');
    expect(result).toContain('may not work correctly');
  });

  it('warns about large dataset (>100 items)', () => {
    const sources = Array.from({ length: 101 }, () => ({}));
    const result = generateImportWarnings(makeImportData({ sources }), makeImportOptions());
    expect(result).toContain('Large dataset');
    expect(result).toContain('101 items');
  });

  it('does not warn for dataset of exactly 100 items', () => {
    const sources = Array.from({ length: 100 }, () => ({}));
    const result = generateImportWarnings(makeImportData({ sources }), makeImportOptions());
    // 100 items should not trigger the >100 warning
    expect(result).toBeNull();
  });

  it('warns about replace mode on large dataset (>50)', () => {
    const sources = Array.from({ length: 51 }, () => ({}));
    const result = generateImportWarnings(makeImportData({ sources }), makeImportOptions({ importMode: 'replace' }));
    expect(result).toContain('Replace mode');
    expect(result).toContain('delete all existing');
  });

  it('warns about workspace credentials', () => {
    const result = generateImportWarnings(
      makeImportData({ workspace: { authData: { token: 'ghp_xxxxxxxxxxxx' } } }),
      makeImportOptions({ includeCredentials: false }),
    );
    expect(result).toContain('authentication data');
  });

  it('combines multiple warnings with semicolons', () => {
    const sources = Array.from({ length: 110 }, () => ({}));
    const result = generateImportWarnings(
      makeImportData({ version: '1.0.0', sources }),
      makeImportOptions({ importMode: 'replace' }),
    );
    expect(result).toContain(';');
    // Should have version + large dataset + replace mode warnings
    expect(result!.split(';')).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// generateEnvironmentVariablesMessage
// ---------------------------------------------------------------------------
describe('generateEnvironmentVariablesMessage', () => {
  it('returns null for zero count', () => {
    expect(generateEnvironmentVariablesMessage(0)).toBeNull();
  });

  it('returns message for created variables', () => {
    const msg = generateEnvironmentVariablesMessage(3);
    expect(msg).toContain('Created 3 environment variable(s)');
    expect(msg).toContain(SUCCESS_MESSAGES.ENVIRONMENT_VARIABLES_CREATED);
  });

  it('includes environment names', () => {
    const msg = generateEnvironmentVariablesMessage(2, ['Development', 'Staging']);
    expect(msg).toContain('in Development, Staging');
  });

  it('does not include environment names for empty array', () => {
    const msg = generateEnvironmentVariablesMessage(1, []);
    expect(msg).toContain('Created 1 environment variable(s).');
    // With empty names array, the " in env1, env2" segment should not appear
    expect(msg).not.toContain(' in Development');
  });

  it('returns null for zero count even with environment names', () => {
    expect(generateEnvironmentVariablesMessage(0, ['Production'])).toBeNull();
  });

  it('handles many environment names', () => {
    const envs = ['Development', 'Staging', 'QA', 'Pre-production', 'Production'];
    const msg = generateEnvironmentVariablesMessage(25, envs);
    expect(msg).toContain('Created 25 environment variable(s)');
    expect(msg).toContain('Development, Staging, QA, Pre-production, Production');
  });
});

// ---------------------------------------------------------------------------
// generateErrorMessage
// ---------------------------------------------------------------------------
describe('generateErrorMessage', () => {
  it('generates export error message', () => {
    const msg = generateErrorMessage(new Error('Connection refused'), 'export');
    expect(msg).toBe('Error exporting data: Connection refused');
  });

  it('generates import error message', () => {
    const msg = generateErrorMessage(new Error('Invalid format'), 'import');
    expect(msg).toBe('Error importing data: Invalid format');
  });

  it('includes all context fields', () => {
    const msg = generateErrorMessage(new Error('Parse failed'), 'import', {
      fileName: 'openheaders-config.json',
      dataType: 'sources',
      step: 'parse',
    });
    expect(msg).toBe('Error importing data (file: openheaders-config.json, type: sources, step: parse): Parse failed');
  });

  it('includes partial context fields', () => {
    const msg = generateErrorMessage(new Error('err'), 'export', { fileName: 'config.json' });
    expect(msg).toContain('file: config.json');
    expect(msg).not.toContain('type:');
    expect(msg).not.toContain('step:');
  });

  it('omits context parentheses when context is empty', () => {
    const msg = generateErrorMessage(new Error('err'), 'export', {});
    expect(msg).toBe('Error exporting data: err');
  });
});

// ---------------------------------------------------------------------------
// generateProgressMessage
// ---------------------------------------------------------------------------
describe('generateProgressMessage', () => {
  it('generates progress with percentage', () => {
    expect(generateProgressMessage('Importing', 50, 100, 'sources')).toBe('Importing sources: 50/100 (50%)');
  });

  it('handles zero total (0%)', () => {
    expect(generateProgressMessage('Processing', 0, 0)).toBe('Processing items: 0/0 (0%)');
  });

  it('rounds percentage down', () => {
    expect(generateProgressMessage('Loading', 1, 3)).toBe('Loading items: 1/3 (33%)');
  });

  it('uses default itemType of items', () => {
    expect(generateProgressMessage('Saving', 5, 10)).toBe('Saving items: 5/10 (50%)');
  });

  it('shows 100% at completion', () => {
    expect(generateProgressMessage('Importing', 50, 50, 'sources')).toBe('Importing sources: 50/50 (100%)');
  });

  it('handles enterprise-scale numbers', () => {
    expect(generateProgressMessage('Syncing', 75, 150, 'proxy rules')).toBe('Syncing proxy rules: 75/150 (50%)');
  });
});
