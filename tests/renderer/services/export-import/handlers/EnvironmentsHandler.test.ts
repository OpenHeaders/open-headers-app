import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CentralizedEnvironmentService before importing EnvironmentsHandler
vi.mock('../../../../../src/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import { EnvironmentsHandler } from '../../../../../src/renderer/services/export-import/handlers/EnvironmentsHandler';
import { IMPORT_MODES, DEFAULTS } from '../../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal dependency bag, overridable per test. */
function makeDeps(overrides: Record<string, any> = {}) {
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
// _exportEnvironmentSchema  (pure data transform)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._exportEnvironmentSchema', () => {
  it('returns full schema when no environments are selected', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { dev: { a: 1 }, staging: { b: 2 } },
      variableDefinitions: { API_KEY: { type: 'string' } },
    };

    const result = (handler as any)._exportEnvironmentSchema(fullSchema, []);
    expect(result).toEqual({ environmentSchema: fullSchema });
  });

  it('returns full schema when selectedEnvironments is null', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { dev: {}, staging: {} },
      variableDefinitions: {},
    };

    const result = (handler as any)._exportEnvironmentSchema(fullSchema, null);
    expect(result).toEqual({ environmentSchema: fullSchema });
  });

  it('filters environments by selected names', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { dev: { a: 1 }, staging: { b: 2 }, prod: { c: 3 } },
      variableDefinitions: { KEY: {} },
    };

    const result = (handler as any)._exportEnvironmentSchema(fullSchema, ['dev', 'prod']);
    expect(Object.keys(result.environmentSchema.environments)).toEqual(['dev', 'prod']);
    expect(result.environmentSchema.variableDefinitions).toEqual({ KEY: {} });
  });

  it('ignores selected names that do not exist in schema', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { dev: {} },
      variableDefinitions: {},
    };

    const result = (handler as any)._exportEnvironmentSchema(fullSchema, ['nonexistent']);
    expect(Object.keys(result.environmentSchema.environments)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _exportFullEnvironments  (pure data transform)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._exportFullEnvironments', () => {
  it('returns all environments when no selection filter', () => {
    const envs = { dev: { A: 'val' }, staging: { B: 'val2' } };
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { dev: {}, staging: {} },
      variableDefinitions: {},
    };

    const result = (handler as any)._exportFullEnvironments(fullSchema, []);
    expect(result.environments).toBe(envs);
    expect(result.environmentSchema).toBe(fullSchema);
  });

  it('filters environments and schema by selected names', () => {
    const envs = { dev: { A: '1' }, staging: { B: '2' }, prod: { C: '3' } };
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { dev: {}, staging: {}, prod: {} },
      variableDefinitions: { VAR: {} },
    };

    const result = (handler as any)._exportFullEnvironments(fullSchema, ['dev']);
    expect(Object.keys(result.environments)).toEqual(['dev']);
    expect(Object.keys(result.environmentSchema.environments)).toEqual(['dev']);
    expect(result.environmentSchema.variableDefinitions).toEqual({ VAR: {} });
  });

  it('ignores selected names that do not exist', () => {
    const envs = { dev: { A: '1' } };
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { dev: {} },
      variableDefinitions: {},
    };

    const result = (handler as any)._exportFullEnvironments(fullSchema, ['missing']);
    expect(Object.keys(result.environments)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// exportEnvironments  (orchestration with async)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.exportEnvironments', () => {
  it('returns null when environmentOption is none', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = await handler.exportEnvironments({ environmentOption: 'none', selectedEnvironments: [] });
    expect(result).toBeNull();
  });

  it('delegates to _exportEnvironmentSchema for schema option', async () => {
    const fullSchema = { environments: { dev: {} }, variableDefinitions: {} };
    const handler = new EnvironmentsHandler(
      makeDeps({ generateEnvironmentSchema: vi.fn(() => fullSchema) })
    );

    const result = await handler.exportEnvironments({
      environmentOption: 'schema',
      selectedEnvironments: [],
    });

    expect(result).toEqual({ environmentSchema: fullSchema });
  });

  it('delegates to _exportFullEnvironments for full option', async () => {
    const envs = { dev: { A: '1' } };
    const fullSchema = { environments: { dev: {} }, variableDefinitions: {} };
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: envs, generateEnvironmentSchema: vi.fn(() => fullSchema) })
    );

    const result = await handler.exportEnvironments({
      environmentOption: 'full',
      selectedEnvironments: [],
    });

    expect(result).toHaveProperty('environments');
    expect(result).toHaveProperty('environmentSchema');
  });

  it('returns null for unknown environmentOption', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ generateEnvironmentSchema: vi.fn(() => ({ environments: {}, variableDefinitions: {} })) })
    );
    const result = await handler.exportEnvironments({
      environmentOption: 'unknown',
      selectedEnvironments: [],
    });
    expect(result).toBeNull();
  });

  it('throws wrapped error when generateEnvironmentSchema fails', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ generateEnvironmentSchema: vi.fn(() => { throw new Error('boom'); }) })
    );
    await expect(handler.exportEnvironments({
      environmentOption: 'schema',
      selectedEnvironments: [],
    })).rejects.toThrow('Failed to export environments: boom');
  });
});

// ---------------------------------------------------------------------------
// getEnvironmentStatistics  (pure)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.getEnvironmentStatistics', () => {
  it('returns zeros for empty data', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({});
    expect(stats.environments).toBe(0);
    expect(stats.totalVariables).toBe(0);
    expect(stats.secretVariables).toBe(0);
    expect(stats.emptyVariables).toBe(0);
    expect(stats.schemaVariables).toBe(0);
  });

  it('counts environments and variables correctly', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environments: {
        dev: { A: { value: 'x', isSecret: false }, B: { value: '', isSecret: true } },
        staging: { C: 'direct-val' },
      },
    });
    expect(stats.environments).toBe(2);
    expect(stats.totalVariables).toBe(3);
    expect(stats.secretVariables).toBe(1);
    expect(stats.emptyVariables).toBe(1); // B has empty value
  });

  it('counts empty string variables', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environments: {
        dev: { A: '' },
      },
    });
    expect(stats.emptyVariables).toBe(1);
  });

  it('counts schema variables from variableDefinitions', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environmentSchema: {
        variableDefinitions: { KEY1: {}, KEY2: {}, KEY3: {} },
      },
    });
    expect(stats.schemaVariables).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentsForExport  (pure)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.validateEnvironmentsForExport', () => {
  it('rejects null', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport(null);
    expect(result.success).toBe(false);
  });

  it('rejects non-object', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport('str' as any);
    expect(result.success).toBe(false);
  });

  it('accepts empty object', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({});
    expect(result.success).toBe(true);
  });

  it('reports invalid environment schema', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environmentSchema: 'not-an-object',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Schema validation failed');
  });

  it('reports invalid environment variables type', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environments: { dev: 'not-an-object' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('must be an object');
  });

  it('accepts valid environment data with environments and schema', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environmentSchema: { environments: {}, variableDefinitions: {} },
      environments: { dev: { API_KEY: { name: 'API_KEY', value: 'x' } } },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importEnvironments  (orchestration)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.importEnvironments', () => {
  it('returns empty stats when no environment data selected', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = await handler.importEnvironments(
      {},
      { selectedItems: { environments: false } }
    );
    expect(stats.environmentsImported).toBe(0);
    expect(stats.variablesCreated).toBe(0);
    expect(stats.errors).toEqual([]);
  });

  it('returns empty stats when selected but no data present', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = await handler.importEnvironments(
      {},
      { selectedItems: { environments: true } }
    );
    expect(stats.environmentsImported).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _importFullEnvironments  (async with deps)
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._importFullEnvironments', () => {
  it('creates new environments and batch-sets variables', async () => {
    const createEnvironment = vi.fn();

    const handler = new EnvironmentsHandler(
      makeDeps({ environments: {}, createEnvironment })
    );

    // Mock _batchCreateVariables to avoid the real service call
    (handler as any)._batchCreateVariables = vi.fn();

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { API_KEY: 'val123', SECRET: { value: 's', isSecret: true } } },
      { importMode: IMPORT_MODES.REPLACE }
    );

    expect(createEnvironment).toHaveBeenCalledWith('dev');
    expect(stats.environmentsImported).toBe(1);
    expect(stats.variablesCreated).toBe(2);
  });

  it('skips duplicate variables in merge mode', async () => {
    const existingEnvs = { dev: { API_KEY: { value: 'existing' } } };
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: existingEnvs, createEnvironment: vi.fn() })
    );
    (handler as any)._batchCreateVariables = vi.fn();

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { API_KEY: 'new-val', NEW_VAR: 'hello' } },
      { importMode: IMPORT_MODES.MERGE }
    );

    // API_KEY should be skipped (existing with non-empty value), NEW_VAR imported
    expect(stats.variablesCreated).toBe(1);
  });

  it('filters environments by selectedEnvironments', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: {}, createEnvironment: vi.fn() })
    );
    (handler as any)._batchCreateVariables = vi.fn();

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { A: '1' }, staging: { B: '2' }, prod: { C: '3' } },
      { importMode: IMPORT_MODES.REPLACE, selectedEnvironments: ['dev', 'prod'] }
    );

    expect(stats.environmentsImported).toBe(2);
  });

  it('handles old format (direct string values)', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: {}, createEnvironment: vi.fn() })
    );
    (handler as any)._batchCreateVariables = vi.fn();

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { KEY: 'plain-string-value' } },
      { importMode: IMPORT_MODES.REPLACE }
    );

    expect(stats.variablesCreated).toBe(1);
    const callArgs = (handler as any)._batchCreateVariables.mock.calls[0];
    expect(callArgs[1][0]).toEqual({ name: 'KEY', value: 'plain-string-value', isSecret: false });
  });

  it('handles new format (object with value/isSecret)', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: {}, createEnvironment: vi.fn() })
    );
    (handler as any)._batchCreateVariables = vi.fn();

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { TOKEN: { value: 'abc', isSecret: true } } },
      { importMode: IMPORT_MODES.REPLACE }
    );

    expect(stats.variablesCreated).toBe(1);
    const callArgs = (handler as any)._batchCreateVariables.mock.calls[0];
    expect(callArgs[1][0]).toEqual({ name: 'TOKEN', value: 'abc', isSecret: true });
  });

  it('records errors when batch create fails', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({ environments: {}, createEnvironment: vi.fn() })
    );
    (handler as any)._batchCreateVariables = vi.fn().mockRejectedValue(new Error('batch fail'));

    const stats = await (handler as any)._importFullEnvironments(
      { dev: { A: 'x' } },
      { importMode: IMPORT_MODES.REPLACE }
    );

    expect(stats.errors.length).toBe(1);
    expect(stats.errors[0].error).toContain('Batch import failed');
  });
});
