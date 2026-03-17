import { describe, it, expect, vi } from 'vitest';
import { ProxyRulesHandler } from '../../../../src/renderer/services/export-import/handlers/ProxyRulesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Record<string, any> = {}) {
  return {
    ...overrides,
  };
}

function validStaticProxyRule(overrides: Record<string, any> = {}) {
  return {
    id: 'pr-1',
    isDynamic: false,
    domains: ['example.com'],
    headerName: 'X-Custom',
    headerValue: 'val',
    pattern: 'example.com',
    headers: [{ name: 'X-Custom', isDynamic: false, value: 'val' }],
    ...overrides,
  };
}

function validDynamicProxyRule(overrides: Record<string, any> = {}) {
  return {
    id: 'pr-2',
    isDynamic: true,
    headerRuleId: 'rule-1',
    pattern: '*.api.com',
    headers: [{ name: 'Auth', isDynamic: true, sourceId: 'src-1' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateProxyRulesForExport  (pure)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.validateProxyRulesForExport', () => {
  it('rejects non-array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport('bad' as any);
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('accepts empty array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    expect(handler.validateProxyRulesForExport([]).success).toBe(true);
  });

  it('rejects invalid proxy rules in array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport([{}]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Proxy rule 1');
  });

  it('accepts valid static proxy rules', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport([validStaticProxyRule()]);
    expect(r.success).toBe(true);
  });

  it('accepts valid dynamic proxy rules', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport([validDynamicProxyRule()]);
    expect(r.success).toBe(true);
  });

  it('aggregates multiple errors', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport([{}, {}]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Proxy rule 1');
    expect(r.error).toContain('Proxy rule 2');
  });
});

// ---------------------------------------------------------------------------
// getProxyRulesStatistics  (pure)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.getProxyRulesStatistics', () => {
  it('returns zeros for non-array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics('bad' as any);
    expect(stats.total).toBe(0);
    expect(stats.withHeaders).toBe(0);
    expect(stats.patterns).toEqual([]);
    expect(stats.averageHeadersPerRule).toBe(0);
  });

  it('returns zeros for empty array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([]);
    expect(stats.total).toBe(0);
  });

  it('counts total, patterns, and headers', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      validStaticProxyRule(),
      validDynamicProxyRule(),
    ]);
    expect(stats.total).toBe(2);
    expect(stats.patterns).toEqual(['example.com', '*.api.com']);
    expect(stats.withHeaders).toBe(2);
    expect(stats.totalHeaders).toBe(2);
    expect(stats.averageHeadersPerRule).toBe(1);
  });

  it('handles rules without headers', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      { pattern: 'a.com' },
      { pattern: 'b.com', headers: [] },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.withHeaders).toBe(0);
    expect(stats.averageHeadersPerRule).toBe(0);
  });

  it('calculates average headers correctly', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      { pattern: 'a.com', headers: [{ name: 'H1' }, { name: 'H2' }, { name: 'H3' }] },
      { pattern: 'b.com', headers: [{ name: 'H4' }] },
    ]);
    expect(stats.withHeaders).toBe(2);
    expect(stats.totalHeaders).toBe(4);
    expect(stats.averageHeadersPerRule).toBe(2);
  });

  it('handles rules without pattern', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([{ headers: [] }]);
    expect(stats.patterns).toEqual([]);
    expect(stats.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeProxyRules  (pure)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.analyzeProxyRules', () => {
  it('returns empty arrays for non-array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules('bad' as any);
    expect(result.warnings).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty arrays for empty array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([]);
    expect(result.warnings).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('detects duplicate patterns', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { pattern: 'api.com', headers: [{ name: 'X' }] },
      { pattern: 'api.com', headers: [{ name: 'Y' }] },
    ]);
    expect(result.warnings.some(w => w.includes('api.com'))).toBe(true);
    expect(result.suggestions.some(s => s.includes('consolidating'))).toBe(true);
  });

  it('warns about very broad patterns (* and **)', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { pattern: '*', headers: [{ name: 'X' }] },
    ]);
    expect(result.warnings.some(w => w.includes('very broad'))).toBe(true);
  });

  it('warns about ** pattern', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { pattern: '**', headers: [{ name: 'X' }] },
    ]);
    expect(result.warnings.some(w => w.includes('very broad'))).toBe(true);
  });

  it('warns about rules without headers', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { pattern: 'a.com' },
      { pattern: 'b.com', headers: [] },
    ]);
    expect(result.warnings.some(w => w.includes('no headers'))).toBe(true);
    expect(result.suggestions.some(s => s.includes('without headers'))).toBe(true);
  });

  it('does not warn when all rules have headers', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { pattern: 'a.com', headers: [{ name: 'X' }] },
    ]);
    expect(result.warnings.some(w => w.includes('no headers'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportProxyRules  (async, needs window.electronAPI)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.exportProxyRules', () => {
  it('returns null when proxyRules not selected', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = await handler.exportProxyRules({ selectedItems: { proxyRules: false } });
    expect(result).toBeNull();
  });

  it('fetches and filters proxy rules via electronAPI', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        proxyGetRules: vi.fn().mockResolvedValue([
          validStaticProxyRule(),
          { bad: true }, // invalid, will be filtered
        ]),
      },
      dispatchEvent: vi.fn(),
    });

    const handler = new ProxyRulesHandler(makeDeps());
    const result = await handler.exportProxyRules({ selectedItems: { proxyRules: true } });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr-1');

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// importProxyRules  (async orchestration)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.importProxyRules', () => {
  it('returns empty stats for empty array', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = await handler.importProxyRules([], { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.errors).toEqual([]);
  });

  it('returns empty stats for non-array', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = await handler.importProxyRules(null as any, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(0);
  });

  it('clears existing rules in replace mode and imports new ones', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const clearSpy = vi.spyOn(handler as any, '_clearExistingProxyRules').mockResolvedValue(undefined);
    vi.spyOn(handler as any, '_importSingleProxyRule').mockResolvedValue({ imported: true });

    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const stats = await handler.importProxyRules(
      [validStaticProxyRule()],
      { importMode: IMPORT_MODES.REPLACE }
    );

    expect(clearSpy).toHaveBeenCalled();
    expect(stats.imported).toBe(1);
    vi.unstubAllGlobals();
  });

  it('records errors for failed imports', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    vi.spyOn(handler as any, '_importSingleProxyRule').mockRejectedValue(new Error('save fail'));

    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const stats = await handler.importProxyRules(
      [validStaticProxyRule()],
      { importMode: IMPORT_MODES.MERGE }
    );

    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toBe('save fail');
    vi.unstubAllGlobals();
  });
});
