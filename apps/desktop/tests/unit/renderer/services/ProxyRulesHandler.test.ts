import { describe, it, expect, vi } from 'vitest';
import { ProxyRulesHandler } from '../../../../src/renderer/services/export-import/handlers/ProxyRulesHandler';
import { IMPORT_MODES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import type { ExportImportDependencies } from '../../../../src/renderer/services/export-import/core/types';
import type { ProxyRule } from '../../../../src/types/proxy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    appVersion: '3.2.0',
    activeWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sources: [],
    environments: {},
    workspaces: [],
    exportSources: vi.fn(() => []),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    createWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    setVariable: vi.fn(),
    generateEnvironmentSchema: vi.fn(() => ({ environments: {}, variableDefinitions: {} })),
    createEnvironment: vi.fn(),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as ExportImportDependencies;
}

function validStaticProxyRule(overrides: Partial<ProxyRule> = {}): ProxyRule {
  return {
    id: 'pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    isDynamic: false,
    domains: ['*.openheaders.io', 'api.partner-service.io:8443'],
    headerName: 'Authorization',
    headerValue: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
    ...overrides,
  } as ProxyRule;
}

function validDynamicProxyRule(overrides: Record<string, string | boolean | string[]> = {}) {
  return {
    id: 'pr-b2c3d4e5-f6a7-8901-bcde-f12345678901',
    isDynamic: true,
    headerRuleId: 'rule-c3d4e5f6-a7b8-9012-cdef-123456789012',
    headerName: 'X-API-Key',
    domains: ['*.openheaders.io'],
    sourceId: 'src-d4e5f6a7-b890-1234-abcd-567890123456',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateProxyRulesForExport  (pure)
// ---------------------------------------------------------------------------
describe('ProxyRulesHandler.validateProxyRulesForExport', () => {
  it('rejects non-array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const r = handler.validateProxyRulesForExport(undefined);
    expect(r.success).toBe(false);
    expect(r.error).toContain('must be an array');
  });

  it('accepts empty array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    expect(handler.validateProxyRulesForExport([]).success).toBe(true);
  });

  it('rejects invalid proxy rules in array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    // Intentionally invalid rule to test validation
    const r = handler.validateProxyRulesForExport([{} as ProxyRule]);
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
    // Intentionally invalid rules to test validation
    const r = handler.validateProxyRulesForExport([{} as ProxyRule, {} as ProxyRule]);
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
    const stats = handler.getProxyRulesStatistics(undefined);
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

  it('counts total, domains, and headers', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      validStaticProxyRule(),
      validDynamicProxyRule(),
    ]);
    expect(stats.total).toBe(2);
    expect(stats.patterns).toEqual([
      '*.openheaders.io, api.partner-service.io:8443',
      '*.openheaders.io',
    ]);
    expect(stats.withHeaders).toBe(2);
    expect(stats.totalHeaders).toBe(2);
    expect(stats.averageHeadersPerRule).toBe(1);
  });

  it('handles rules without headerName', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      { id: '1', domains: ['a.com'] },
      { id: '2', domains: ['b.com'] },
    ]);
    expect(stats.total).toBe(2);
    expect(stats.withHeaders).toBe(0);
    expect(stats.averageHeadersPerRule).toBe(0);
  });

  it('calculates average headers correctly', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([
      { id: '1', domains: ['a.com'], headerName: 'H1' },
      { id: '2', domains: ['b.com'], headerName: 'H4' },
    ]);
    expect(stats.withHeaders).toBe(2);
    expect(stats.totalHeaders).toBe(2);
    expect(stats.averageHeadersPerRule).toBe(1);
  });

  it('handles rules without domains', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const stats = handler.getProxyRulesStatistics([{ id: '1' }]);
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
    const result = handler.analyzeProxyRules(undefined);
    expect(result.warnings).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty arrays for empty array', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([]);
    expect(result.warnings).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('detects duplicate domain patterns', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { id: '1', domains: ['api.com'], headerName: 'X' },
      { id: '2', domains: ['api.com'], headerName: 'Y' },
    ]);
    expect(result.warnings.some(w => w.includes('api.com'))).toBe(true);
    expect(result.suggestions.some(s => s.includes('consolidating'))).toBe(true);
  });

  it('warns about rules without domain restrictions', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { id: '1', headerName: 'X' },
    ]);
    expect(result.warnings.some(w => w.includes('no domain restrictions'))).toBe(true);
  });

  it('warns about rules without header names', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { id: '1', domains: ['a.com'] },
      { id: '2', domains: ['b.com'] },
    ]);
    expect(result.warnings.some(w => w.includes('no header name'))).toBe(true);
  });

  it('does not warn when all rules have header names', () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const result = handler.analyzeProxyRules([
      { id: '1', domains: ['a.com'], headerName: 'X' },
    ]);
    expect(result.warnings.some(w => w.includes('no header name'))).toBe(false);
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
    expect(result![0].id).toBe('pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result![0].headerName).toBe('Authorization');
    expect(result![0].domains).toEqual(['*.openheaders.io', 'api.partner-service.io:8443']);

    vi.unstubAllGlobals();
  });

  it('exports all valid enterprise rules when multiple exist', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        proxyGetRules: vi.fn().mockResolvedValue([
          validStaticProxyRule(),
          validDynamicProxyRule(),
        ]),
      },
      dispatchEvent: vi.fn(),
    });

    const handler = new ProxyRulesHandler(makeDeps());
    const result = await handler.exportProxyRules({ selectedItems: { proxyRules: true } });
    expect(result).toHaveLength(2);

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
    const stats = await handler.importProxyRules(null, { importMode: IMPORT_MODES.MERGE });
    expect(stats.imported).toBe(0);
  });

  it('clears existing rules in replace mode and imports new ones', async () => {
    const handler = new ProxyRulesHandler(makeDeps());
    const clearSpy = vi.spyOn(handler, '_clearExistingProxyRules').mockResolvedValue(undefined);
    vi.spyOn(handler, '_importSingleProxyRule').mockResolvedValue({ imported: true });

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
    vi.spyOn(handler, '_importSingleProxyRule').mockRejectedValue(new Error('save fail'));

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
