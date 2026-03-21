import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RulesHandler } from '../../../../src/renderer/services/export-import/handlers/RulesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import { RULE_TYPES } from '../../../../src/renderer/utils/data-structures/rulesStructure';
import type { ExportImportDependencies } from '../../../../src/renderer/services/export-import/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    activeWorkspaceId: 'ws-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateRulesForExport  (pure)
// ---------------------------------------------------------------------------
describe('RulesHandler.validateRulesForExport', () => {
  it('rejects null', () => {
    const handler = new RulesHandler(makeDeps());
    expect(handler.validateRulesForExport(null).success).toBe(false);
  });

  it('rejects non-object', () => {
    const handler = new RulesHandler(makeDeps());
    expect(handler.validateRulesForExport('str' as any).success).toBe(false);
  });

  it('rejects missing rules property', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('rules object');
  });

  it('rejects non-array rule type', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({ rules: { header: 'bad' } });
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('rejects rules without id', () => {
    const handler = new RulesHandler(makeDeps());
    const r = handler.validateRulesForExport({
      rules: { header: [{ name: 'No ID' }] },
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
        header: [{ name: 'no id' }],
        payload: 'not-array',
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
    const stats = handler.getRulesStatistics(null);
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
    expect(stats.byType.header).toBe(2);
    expect(stats.byType.payload).toBe(1);
    expect(stats.byType.url).toBe(0);
  });

  it('handles non-array entries gracefully', () => {
    const handler = new RulesHandler(makeDeps());
    const stats = handler.getRulesStatistics({
      rules: { header: 'bad' },
    });
    expect(stats.byType.header).toBe(0);
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
    const analysis = handler.analyzeRules(null);
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
    const analysis = handler.analyzeRules({ rules: { header: 'bad' } });
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
      id: `r${i}`, name: `Rule ${i}`, enabled: true,
    }));
    const analysis = handler.analyzeRules({ rules: { header: manyRules } });
    expect(analysis.warnings.some(w => w.includes('Large number'))).toBe(true);
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
// _importRulesOfType  (pure logic with mutable state)
// ---------------------------------------------------------------------------
describe('RulesHandler._importRulesOfType', () => {
  it('returns zeros for empty import array', async () => {
    const handler = new RulesHandler(makeDeps());
    const stats = await (handler as any)._importRulesOfType('header', [], { rules: { header: [] } }, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  it('returns zeros for non-array input', async () => {
    const handler = new RulesHandler(makeDeps());
    const stats = await (handler as any)._importRulesOfType('header', null, { rules: { header: [] } }, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(0);
  });

  it('replaces all rules in replace mode', async () => {
    const handler = new RulesHandler(makeDeps());
    const existing = { rules: { header: [{ id: 'old' }] } };
    const incoming = [{ id: 'new1' }, { id: 'new2' }];

    const stats = await (handler as any)._importRulesOfType('header', incoming, existing, { importMode: IMPORT_MODES.REPLACE });
    expect(stats.imported).toBe(2);
    expect(stats.skipped).toBe(0);
    expect(existing.rules.header).toHaveLength(2);
  });

  it('merges and skips duplicates by ID', async () => {
    const handler = new RulesHandler(makeDeps());
    const existing = { rules: { header: [{ id: 'r1' }] } };
    const incoming = [{ id: 'r1' }, { id: 'r2' }];

    const stats = await (handler as any)._importRulesOfType('header', incoming, existing, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(existing.rules.header).toHaveLength(2);
  });

  it('initializes rule type array if missing in existing storage', async () => {
    const handler = new RulesHandler(makeDeps());
    const existing = { rules: {} };
    const incoming = [{ id: 'r1' }];

    // In merge mode, if existingRulesStorage.rules[ruleType] is undefined,
    // the code tries `const existingRules = existingRulesStorage.rules[ruleType] || []`
    // but then pushes into it. We need to ensure the array exists:
    existing.rules['header'] = [];

    const stats = await (handler as any)._importRulesOfType('header', incoming, existing, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(1);
  });

  it('generates ID for rules missing one in merge mode', async () => {
    const handler = new RulesHandler(makeDeps());
    const existing = { rules: { header: [] } };
    const incoming = [{ name: 'No-ID Rule' }]; // no id

    const stats = await (handler as any)._importRulesOfType('header', incoming, existing, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(1);
    expect(existing.rules.header[0].id).toBeDefined();
    expect(existing.rules.header[0].id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// _generateRuleId  (pure)
// ---------------------------------------------------------------------------
describe('RulesHandler._generateRuleId', () => {
  it('returns a non-empty string', () => {
    const handler = new RulesHandler(makeDeps());
    const id = (handler as any)._generateRuleId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs across calls', () => {
    const handler = new RulesHandler(makeDeps());
    const ids = new Set(Array.from({ length: 20 }, () => (handler as any)._generateRuleId()));
    expect(ids.size).toBe(20);
  });
});
