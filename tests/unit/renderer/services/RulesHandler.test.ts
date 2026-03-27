import { describe, it, expect, vi } from 'vitest';
import { RulesHandler } from '../../../../src/renderer/services/export-import/handlers/RulesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies, RuleEntry } from '../../../../src/renderer/services/export-import/core/types';
import type { HeaderRule } from '../../../../src/types/rules';

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
    createWorkspace: vi.fn(),
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

function makeHeaderRule(overrides: Partial<HeaderRule> = {}): HeaderRule {
  return {
    id: 'rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    headerName: 'Authorization',
    headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
    isEnabled: true,
    isDynamic: false,
    isResponse: false,
    domains: ['*.openheaders.io'],
    sourceId: null,
    prefix: '',
    suffix: '',
    tag: '',
    hasEnvVars: false,
    envVars: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as HeaderRule;
}

// ---------------------------------------------------------------------------
// validateRulesForExport  (pure)
// ---------------------------------------------------------------------------
describe('RulesHandler.validateRulesForExport', () => {
  it('rejects undefined', () => {
    const handler = new RulesHandler(makeDeps());
    expect(handler.validateRulesForExport(undefined).success).toBe(false);
  });

  it('rejects missing rules property', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('rules object');
  });

  it('rejects non-array rule type', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({ rules: { header: 'bad' } } as unknown as { rules: Record<string, RuleEntry[]> });
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('rejects rules without id', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({
      rules: { header: [{ name: 'No ID' } as unknown as RuleEntry] },
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('missing an ID');
  });

  it('accepts valid rules data', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({
      rules: { header: [{ id: 'r1', name: 'Rule 1' }] },
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty rules arrays', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({ rules: { header: [], payload: [] } });
    expect(r.success).toBe(true);
  });

  it('aggregates multiple errors', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({
      rules: {
        header: [{ name: 'no id' } as unknown as RuleEntry],
        payload: 'not-array' as unknown as RuleEntry[],
      },
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain(';');
  });
});

// ---------------------------------------------------------------------------
// getRulesStatistics  (pure)
// ---------------------------------------------------------------------------
describe('RulesHandler.getRulesStatistics', () => {
  it('returns zero total for null input', () => {
    const handler = new RulesHandler(makeDeps());
    const stats = handler.getRulesStatistics(null as unknown as { rules?: Record<string, RuleEntry[]> });
    expect(stats.total).toBe(0);
    expect(stats.metadata).toBeNull();
  });

  it('returns zero total for missing rules', () => {
    const handler = new RulesHandler(makeDeps());
    const stats = handler.getRulesStatistics({});
    expect(stats.total).toBe(0);
  });

  it('counts rules by type', () => {
    const handler = new RulesHandler(makeDeps());
    const stats = handler.getRulesStatistics({
      rules: {
        header: [{ id: '1' }, { id: '2' }],
        payload: [{ id: '3' }],
        url: [],
      },
    });
    expect(stats.total).toBe(3);
    const byType = stats.byType as Record<string, number>;
    expect(byType.header).toBe(2);
    expect(byType.payload).toBe(1);
    expect(byType.url).toBe(0);
  });

  it('handles non-array entries gracefully', () => {
    const handler = new RulesHandler(makeDeps());
    const stats = handler.getRulesStatistics({
      rules: { header: 'bad' } as unknown as Record<string, RuleEntry[]>,
    });
    expect((stats.byType as Record<string, number>).header).toBe(0);
    expect(stats.total).toBe(0);
  });

  it('includes rulesMetadata when present', () => {
    const handler = new RulesHandler(makeDeps());
    const meta = { lastUpdated: '2025-01-01', totalRules: 5 };
    const stats = handler.getRulesStatistics({
      rules: { header: [] },
      rulesMetadata: meta,
    });
    expect(stats.metadata).toBe(meta);
  });

  it('falls back to metadata field', () => {
    const handler = new RulesHandler(makeDeps());
    const meta = { lastUpdated: '2025-01-01' };
    const stats = handler.getRulesStatistics({
      rules: { header: [] },
      metadata: meta,
    });
    expect(stats.metadata).toBe(meta);
  });
});

// ---------------------------------------------------------------------------
// analyzeRules  (pure)
// ---------------------------------------------------------------------------
describe('RulesHandler.analyzeRules', () => {
  it('returns empty arrays for null input', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules(null as unknown as { rules?: Record<string, RuleEntry[]> });
    expect(analysis.warnings).toEqual([]);
    expect(analysis.suggestions).toEqual([]);
  });

  it('returns empty arrays for missing rules', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({});
    expect(analysis.warnings).toEqual([]);
  });

  it('warns about non-array rule type', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({ rules: { header: 'bad' } } as unknown as { rules: Record<string, RuleEntry[]> });
    expect(analysis.warnings.some(w => w.includes('not an array'))).toBe(true);
  });

  it('detects duplicate IDs within a rule type', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({
      rules: {
        header: [
          { id: 'dup', name: 'A', enabled: true },
          { id: 'dup', name: 'B', enabled: true },
        ],
      },
    });
    expect(analysis.warnings.some(w => w.includes('Duplicate rule IDs'))).toBe(true);
    expect(analysis.suggestions.some(s => s.includes('Fix duplicate'))).toBe(true);
  });

  it('detects unnamed rules', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({
      rules: { header: [{ id: '1' }] },
    });
    expect(analysis.warnings.some(w => w.includes('unnamed'))).toBe(true);
  });

  it('warns about large rule sets (>100)', () => {
    const handler = new RulesHandler(makeDeps());
    const manyRules = Array.from({ length: 101 }, (_, i) => ({
      id: `rule-${String(i).padStart(8, '0')}-a1b2-c3d4-e5f6-789012345678`,
      name: `Add OAuth2 Bearer Token (${i})`,
      enabled: true,
    }));
    const analysis = handler.analyzeRules({ rules: { header: manyRules } });
    expect(analysis.warnings.some(w => w.includes('Large number'))).toBe(true);
    expect(analysis.suggestions.some(s => s.includes('organizing rules'))).toBe(true);
  });

  it('warns about disabled rules', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({
      rules: {
        header: [
          { id: '1', name: 'A', enabled: false },
          { id: '2', name: 'B', enabled: true },
        ],
      },
    });
    expect(analysis.warnings.some(w => w.includes('disabled'))).toBe(true);
  });

  it('does not warn when all rules are enabled', () => {
    const handler = new RulesHandler(makeDeps());
    const analysis = handler.analyzeRules({
      rules: { header: [{ id: '1', name: 'A', enabled: true }] },
    });
    expect(analysis.warnings.some(w => w.includes('disabled'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportRules — reads from dependencies.rules, not disk
// ---------------------------------------------------------------------------
describe('RulesHandler.exportRules', () => {
  it('returns null when rules not selected', async () => {
    const handler = new RulesHandler(makeDeps());
    const result = await handler.exportRules({ selectedItems: { rules: false } });
    expect(result).toBeNull();
  });

  it('exports rules from in-memory state', async () => {
    const deps = makeDeps({
      rules: {
        header: [makeHeaderRule()],
        request: [],
        response: [],
      },
    });
    const handler = new RulesHandler(deps);
    const result = await handler.exportRules({ selectedItems: { rules: true } });
    expect(result).not.toBeNull();
    expect(result!.rules.header).toHaveLength(1);
    expect(result!.rulesMetadata.totalRules).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// importRules — uses addHeaderRule/removeHeaderRule, not disk I/O
// ---------------------------------------------------------------------------
describe('RulesHandler.importRules', () => {
  it('returns zeros for empty import', async () => {
    const handler = new RulesHandler(makeDeps());
    const stats = await handler.importRules({}, { importMode: IMPORT_MODES.MERGE, selectedItems: {} });
    expect(stats.imported.total).toBe(0);
    expect(stats.skipped.total).toBe(0);
  });

  it('imports header rules via addHeaderRule in merge mode', async () => {
    const addHeaderRule = vi.fn(async () => true);
    const deps = makeDeps({ addHeaderRule });
    const handler = new RulesHandler(deps);

    const stats = await handler.importRules(
      { rules: { header: [{ id: 'r1', name: 'Rule 1' }, { id: 'r2', name: 'Rule 2' }] } },
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );

    expect(stats.imported.total).toBe(2);
    expect(addHeaderRule).toHaveBeenCalledTimes(2);
  });

  it('skips duplicates by ID in merge mode', async () => {
    const addHeaderRule = vi.fn(async () => true);
    const deps = makeDeps({
      addHeaderRule,
      rules: { header: [makeHeaderRule({ id: 'existing-rule' })], request: [], response: [] },
    });
    const handler = new RulesHandler(deps);

    const stats = await handler.importRules(
      { rules: { header: [{ id: 'existing-rule' }, { id: 'new-rule' }] } },
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );

    expect(stats.imported.total).toBe(1);
    expect(stats.skipped.total).toBe(1);
    expect(addHeaderRule).toHaveBeenCalledTimes(1);
  });

  it('clears existing rules in replace mode via removeHeaderRule', async () => {
    const removeHeaderRule = vi.fn(async () => true);
    const addHeaderRule = vi.fn(async () => true);
    const deps = makeDeps({
      removeHeaderRule,
      addHeaderRule,
      rules: {
        header: [makeHeaderRule({ id: 'old-1' }), makeHeaderRule({ id: 'old-2' })],
        request: [],
        response: [],
      },
    });
    const handler = new RulesHandler(deps);

    const stats = await handler.importRules(
      { rules: { header: [{ id: 'new-1' }] } },
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} }
    );

    expect(removeHeaderRule).toHaveBeenCalledTimes(2);
    expect(removeHeaderRule).toHaveBeenCalledWith('old-1');
    expect(removeHeaderRule).toHaveBeenCalledWith('old-2');
    expect(addHeaderRule).toHaveBeenCalledTimes(1);
    expect(stats.imported.total).toBe(1);
  });

  it('records errors when addHeaderRule fails', async () => {
    const addHeaderRule = vi.fn(async () => { throw new Error('save failed'); });
    const deps = makeDeps({ addHeaderRule });
    const handler = new RulesHandler(deps);

    const stats = await handler.importRules(
      { rules: { header: [{ id: 'r1' }] } },
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} }
    );

    expect(stats.imported.total).toBe(0);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('save failed');
  });
});
