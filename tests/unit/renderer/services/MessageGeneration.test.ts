import { describe, it, expect, vi } from 'vitest';

// Mock the version module before importing MessageGeneration
vi.mock('../../../../src/config/version.esm', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
  APP_VERSION: '3.1.8',
  SUPPORTED_DATA_VERSIONS: ['1.0.0', '2.0.0', '3.0.0'],
}));

import {
  generateExportSuccessMessage,
  generateImportSuccessMessage,
  generateImportSummary,
  generateImportWarnings,
  generateEnvironmentVariablesMessage,
  generateErrorMessage,
  generateProgressMessage,
} from '../../../../src/renderer/services/export-import/utilities/MessageGeneration';
import { SUCCESS_MESSAGES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// generateExportSuccessMessage
// ---------------------------------------------------------------------------
describe('generateExportSuccessMessage', () => {
  it('includes source count', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: { sources: true }, fileFormat: 'single', environmentOption: 'none', includeWorkspace: false },
      { sources: [{ id: 1 }, { id: 2 }] },
      ['/path/file.json'],
    );
    expect(msg).toContain('2 source(s)');
  });

  it('includes rules total count', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: { rules: true }, fileFormat: 'single', environmentOption: 'none', includeWorkspace: false },
      { rules: { request: [1, 2], response: [3] } },
      ['/path'],
    );
    expect(msg).toContain('3 rule(s)');
  });

  it('includes proxy rules count', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: { proxyRules: true }, fileFormat: 'single', environmentOption: 'none', includeWorkspace: false },
      { proxyRules: [1] },
      ['/path'],
    );
    expect(msg).toContain('1 proxy rule(s)');
  });

  it('includes environment schema description', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: {}, fileFormat: 'single', environmentOption: 'schema', includeWorkspace: false },
      {},
      ['/path'],
    );
    expect(msg).toContain('environment schema');
  });

  it('includes environment values description', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: {}, fileFormat: 'single', environmentOption: 'values', includeWorkspace: false },
      {},
      ['/path'],
    );
    expect(msg).toContain('environments with values');
  });

  it('includes workspace configuration', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: {}, fileFormat: 'single', environmentOption: 'none', includeWorkspace: true, includeCredentials: false },
      {},
      ['/path'],
    );
    expect(msg).toContain('workspace configuration');
    expect(msg).not.toContain('credentials');
  });

  it('includes workspace with credentials', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: {}, fileFormat: 'single', environmentOption: 'none', includeWorkspace: true, includeCredentials: true },
      {},
      ['/path'],
    );
    expect(msg).toContain('workspace configuration with credentials');
  });

  it('mentions file count for separate format', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: { sources: true }, fileFormat: 'separate', environmentOption: 'none', includeWorkspace: false },
      { sources: [1] },
      ['/a.json', '/b.json'],
    );
    expect(msg).toContain('2 files');
  });

  it('defaults to "configuration" when nothing selected', () => {
    const msg = generateExportSuccessMessage(
      { selectedItems: {}, fileFormat: 'single', environmentOption: 'none', includeWorkspace: false },
      {},
      ['/path'],
    );
    expect(msg).toContain('configuration');
  });
});

// ---------------------------------------------------------------------------
// generateImportSuccessMessage
// ---------------------------------------------------------------------------
describe('generateImportSuccessMessage', () => {
  it('returns no-data message for empty stats', () => {
    const msg = generateImportSuccessMessage({});
    expect(msg).toBe('No new data was imported');
  });

  it('lists imported sources', () => {
    const msg = generateImportSuccessMessage({ sourcesImported: 3 });
    expect(msg).toContain('3 source(s)');
    expect(msg).toContain(SUCCESS_MESSAGES.IMPORT_COMPLETE);
  });

  it('lists skipped sources', () => {
    const msg = generateImportSuccessMessage({ sourcesSkipped: 2 });
    expect(msg).toContain('2 duplicate source(s) skipped');
  });

  it('lists imported rules with details', () => {
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

  it('lists environments without variables', () => {
    const msg = generateImportSuccessMessage({ environmentsImported: 1 });
    expect(msg).toContain('1 environment(s)');
    expect(msg).not.toContain('variable');
  });

  it('lists created workspace', () => {
    const msg = generateImportSuccessMessage({ createdWorkspace: { name: 'MyWS' } });
    expect(msg).toContain('workspace "MyWS"');
  });

  it('uses git sync prefix when isGitSync is true', () => {
    const msg = generateImportSuccessMessage({ sourcesImported: 1 }, true);
    expect(msg).toContain(SUCCESS_MESSAGES.GIT_SYNC_COMPLETE);
  });
});

// ---------------------------------------------------------------------------
// generateImportSummary
// ---------------------------------------------------------------------------
describe('generateImportSummary', () => {
  it('returns a structured summary', () => {
    const summary = generateImportSummary({
      sourcesImported: 2,
      sourcesSkipped: 1,
      proxyRulesImported: 3,
      proxyRulesSkipped: 0,
      rulesImported: { total: 4 },
      rulesSkipped: { total: 1 },
      environmentsImported: 1,
      variablesCreated: 5,
      createdWorkspace: { name: 'WS' },
    });
    expect(summary).toContain('Import Summary');
    expect(summary).toContain('Sources: 2 imported, 1 skipped');
    expect(summary).toContain('Rules: 4 imported, 1 skipped');
    expect(summary).toContain('Proxy Rules: 3 imported, 0 skipped');
    expect(summary).toContain('Environments: 1 imported');
    expect(summary).toContain('Variables Created: 5');
    expect(summary).toContain('Workspace Created: WS');
  });

  it('shows None for no workspace', () => {
    const summary = generateImportSummary({});
    expect(summary).toContain('Workspace Created: None');
  });
});

// ---------------------------------------------------------------------------
// generateImportWarnings
// ---------------------------------------------------------------------------
describe('generateImportWarnings', () => {
  it('returns null for no warnings', () => {
    const result = generateImportWarnings({ version: '3.0.0' }, {});
    expect(result).toBeNull();
  });

  it('warns about version mismatch', () => {
    const result = generateImportWarnings({ version: '1.0.0' }, {});
    expect(result).toContain('version 1.0.0');
  });

  it('warns about large dataset', () => {
    const sources = Array.from({ length: 101 }, (_, i) => ({ id: i }));
    const result = generateImportWarnings({ sources }, {});
    expect(result).toContain('Large dataset');
  });

  it('warns about replace mode on large dataset', () => {
    const sources = Array.from({ length: 51 }, (_, i) => ({ id: i }));
    const result = generateImportWarnings({ sources }, { importMode: 'replace' });
    expect(result).toContain('Replace mode');
  });

  it('warns about workspace credentials', () => {
    const result = generateImportWarnings(
      { workspace: { authData: { token: 'x' } } },
      { includeCredentials: false },
    );
    expect(result).toContain('authentication data');
  });

  it('combines multiple warnings', () => {
    const sources = Array.from({ length: 110 }, (_, i) => ({ id: i }));
    const result = generateImportWarnings(
      { version: '1.0.0', sources },
      { importMode: 'replace' },
    );
    expect(result).toContain(';');
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
  });

  it('includes environment names', () => {
    const msg = generateEnvironmentVariablesMessage(2, ['dev', 'staging']);
    expect(msg).toContain('in dev, staging');
  });

  it('does not include environment names for empty array', () => {
    const msg = generateEnvironmentVariablesMessage(1, []);
    expect(msg).toContain('Created 1 environment variable(s).');
    // With an empty names array, the envDescription is '' so no " in dev, staging" etc.
    expect(msg).not.toMatch(/\bin dev\b/);
  });
});

// ---------------------------------------------------------------------------
// generateErrorMessage
// ---------------------------------------------------------------------------
describe('generateErrorMessage', () => {
  it('generates export error message', () => {
    const msg = generateErrorMessage(new Error('fail'), 'export');
    expect(msg).toContain('Error exporting data');
    expect(msg).toContain('fail');
  });

  it('generates import error message', () => {
    const msg = generateErrorMessage(new Error('bad'), 'import');
    expect(msg).toContain('Error importing data');
    expect(msg).toContain('bad');
  });

  it('includes context fields', () => {
    const msg = generateErrorMessage(
      new Error('err'),
      'import',
      { fileName: 'config.json', dataType: 'sources', step: 'parse' },
    );
    expect(msg).toContain('file: config.json');
    expect(msg).toContain('type: sources');
    expect(msg).toContain('step: parse');
  });

  it('omits context when empty', () => {
    const msg = generateErrorMessage(new Error('err'), 'export', {});
    expect(msg).not.toContain('(');
  });
});

// ---------------------------------------------------------------------------
// generateProgressMessage
// ---------------------------------------------------------------------------
describe('generateProgressMessage', () => {
  it('generates progress with percentage', () => {
    const msg = generateProgressMessage('Importing', 50, 100, 'sources');
    expect(msg).toBe('Importing sources: 50/100 (50%)');
  });

  it('handles zero total', () => {
    const msg = generateProgressMessage('Processing', 0, 0);
    expect(msg).toBe('Processing items: 0/0 (0%)');
  });

  it('rounds percentage', () => {
    const msg = generateProgressMessage('Loading', 1, 3);
    expect(msg).toBe('Loading items: 1/3 (33%)');
  });

  it('uses default itemType', () => {
    const msg = generateProgressMessage('Saving', 5, 10);
    expect(msg).toContain('items');
  });
});
