import { describe, expect, it, vi } from 'vitest';

// Mock CentralizedEnvironmentService before importing EnvironmentsHandler
vi.mock('@/renderer/services/CentralizedEnvironmentService', () => ({
  getCentralizedEnvironmentService: () => ({
    batchSetVariablesInEnvironment: vi.fn(),
  }),
}));

import type { Mock } from 'vitest';
import { IMPORT_MODES } from '@/renderer/services/export-import/core/ExportImportConfig';
import type {
  EnvironmentSchema,
  EnvironmentVariable,
  ExportImportDependencies,
} from '@/renderer/services/export-import/core/types';
import { EnvironmentsHandler } from '@/renderer/services/export-import/handlers/EnvironmentsHandler';

// ---------------------------------------------------------------------------
// Enterprise-realistic helpers
// ---------------------------------------------------------------------------

function envVar(value: string, isSecret = false, updatedAt = '2026-01-10T16:30:00.000Z'): EnvironmentVariable {
  return { value, isSecret, updatedAt };
}

function makeEnterpriseEnvironments(): Record<string, Record<string, EnvironmentVariable>> {
  return {
    Default: {
      OAUTH2_CLIENT_ID: envVar('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
      OAUTH2_CLIENT_SECRET: envVar('ohk_live_4eC39HqLyjWDarjtT1zdp7dc', true),
      API_GATEWAY_URL: envVar('https://gateway.openheaders.io:8443/v2'),
      DATABASE_CONNECTION_STRING: envVar(
        'postgresql://admin:P@ss=w0rd&special@db.openheaders.internal:5432/prod?sslmode=require',
        true,
      ),
    },
    'Staging — EU Region': {
      OAUTH2_CLIENT_ID: envVar('oidc-client-staging-b2c3d4e5-f6a7-8901-bcde-f12345678901'),
      API_GATEWAY_URL: envVar('https://staging-eu.openheaders.io:8443/v2'),
    },
    Production: {
      OAUTH2_CLIENT_ID: envVar('oidc-client-prod-c3d4e5f6-a7b8-9012-cdef-123456789012'),
      OAUTH2_CLIENT_SECRET: envVar('sk_prod_9hF60KrOalZGdumwW4cgt0hi', true),
      REDIS_URL: envVar('rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0', true),
      BEARER_TOKEN: envVar(
        'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
        true,
      ),
    },
  };
}

function makeDeps(overrides: Partial<ExportImportDependencies> = {}): ExportImportDependencies {
  return {
    appVersion: '3.2.0',
    activeWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    environments: makeEnterpriseEnvironments(),
    sources: [],
    workspaces: [],
    exportSources: vi.fn(() => []),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    createWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    setVariable: vi.fn(),
    generateEnvironmentSchema: vi.fn(() => ({
      environments: {
        Default: {
          variables: [
            { name: 'OAUTH2_CLIENT_ID', isSecret: false },
            { name: 'OAUTH2_CLIENT_SECRET', isSecret: true },
          ],
        },
        'Staging — EU Region': { variables: [{ name: 'OAUTH2_CLIENT_ID', isSecret: false }] },
        Production: {
          variables: [
            { name: 'OAUTH2_CLIENT_ID', isSecret: false },
            { name: 'REDIS_URL', isSecret: true },
          ],
        },
      },
      variableDefinitions: {
        OAUTH2_CLIENT_ID: { isSecret: false, usedIn: ['src-gateway'] },
        OAUTH2_CLIENT_SECRET: { isSecret: true, usedIn: ['src-auth'] },
        REDIS_URL: { isSecret: true, usedIn: ['src-cache'] },
      },
    })),
    createEnvironment: vi.fn(),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as ExportImportDependencies;
}

// ---------------------------------------------------------------------------
// _exportEnvironmentSchema
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._exportEnvironmentSchema', () => {
  it('returns full schema when no environments are selected', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { Default: { variables: [] }, Production: { variables: [] } },
      variableDefinitions: { OAUTH2_CLIENT_ID: { isSecret: false } },
    } as unknown as EnvironmentSchema;

    const result = handler._exportEnvironmentSchema(fullSchema, []);
    expect(result).toEqual({ environmentSchema: fullSchema });
  });

  it('returns full schema when selectedEnvironments is null', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { Default: {}, Production: {} },
      variableDefinitions: {},
    } as unknown as EnvironmentSchema;

    const result = handler._exportEnvironmentSchema(fullSchema, null as unknown as undefined);
    expect(result).toEqual({ environmentSchema: fullSchema });
  });

  it('filters environments by selected names preserving variableDefinitions', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: {
        Default: { variables: [{ name: 'A' }] },
        'Staging — EU Region': { variables: [{ name: 'B' }] },
        Production: { variables: [{ name: 'C' }] },
      },
      variableDefinitions: { OAUTH2_CLIENT_ID: { isSecret: false } },
    } as unknown as EnvironmentSchema;

    const result = handler._exportEnvironmentSchema(fullSchema, ['Default', 'Production']);
    expect(Object.keys(result.environmentSchema.environments)).toEqual(['Default', 'Production']);
    expect(result.environmentSchema.variableDefinitions).toEqual({ OAUTH2_CLIENT_ID: { isSecret: false } });
  });

  it('ignores selected names that do not exist in schema', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const fullSchema = {
      environments: { Default: {} },
      variableDefinitions: {},
    } as unknown as EnvironmentSchema;

    const result = handler._exportEnvironmentSchema(fullSchema, ['NonExistent']);
    expect(Object.keys(result.environmentSchema.environments)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _exportFullEnvironments
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._exportFullEnvironments', () => {
  it('returns all enterprise environments when no selection filter', () => {
    const envs = makeEnterpriseEnvironments();
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { Default: {}, 'Staging — EU Region': {}, Production: {} },
      variableDefinitions: {},
    } as unknown as EnvironmentSchema;

    const result = handler._exportFullEnvironments(fullSchema, []);
    expect(result.environments).toBe(envs);
    expect(result.environmentSchema).toBe(fullSchema);
    expect(Object.keys(result.environments)).toHaveLength(3);
  });

  it('filters environments and schema by selected names', () => {
    const envs = makeEnterpriseEnvironments();
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { Default: {}, 'Staging — EU Region': {}, Production: {} },
      variableDefinitions: { OAUTH2_CLIENT_ID: { isSecret: false } },
    } as unknown as EnvironmentSchema;

    const result = handler._exportFullEnvironments(fullSchema, ['Default', 'Production']);
    expect(Object.keys(result.environments)).toEqual(['Default', 'Production']);
    expect(result.environments.Default.OAUTH2_CLIENT_ID.value).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.environments.Production.REDIS_URL.value).toBe(
      'rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0',
    );
    expect(Object.keys(result.environmentSchema.environments)).toEqual(['Default', 'Production']);
  });

  it('ignores selected names that do not exist', () => {
    const envs = makeEnterpriseEnvironments();
    const handler = new EnvironmentsHandler(makeDeps({ environments: envs }));
    const fullSchema = {
      environments: { Default: {} },
      variableDefinitions: {},
    } as unknown as EnvironmentSchema;

    const result = handler._exportFullEnvironments(fullSchema, ['NonExistent']);
    expect(Object.keys(result.environments)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// exportEnvironments
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.exportEnvironments', () => {
  it('returns null when environmentOption is none', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = await handler.exportEnvironments({ environmentOption: 'none', selectedEnvironments: [] });
    expect(result).toBeNull();
  });

  it('delegates to _exportEnvironmentSchema for schema option', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = await handler.exportEnvironments({
      environmentOption: 'schema',
      selectedEnvironments: [],
    });
    expect(result).toHaveProperty('environmentSchema');
    expect(result!.environmentSchema.variableDefinitions).toBeDefined();
  });

  it('delegates to _exportFullEnvironments for full option', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = await handler.exportEnvironments({
      environmentOption: 'full',
      selectedEnvironments: [],
    });
    expect(result).toHaveProperty('environments');
    expect(result).toHaveProperty('environmentSchema');
  });

  it('returns null for unknown environmentOption', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = await handler.exportEnvironments({
      environmentOption: 'unknown',
      selectedEnvironments: [],
    });
    expect(result).toBeNull();
  });

  it('throws wrapped error when generateEnvironmentSchema fails', async () => {
    const handler = new EnvironmentsHandler(
      makeDeps({
        generateEnvironmentSchema: vi.fn(() => {
          throw new Error('schema generation failed');
        }),
      }),
    );
    await expect(
      handler.exportEnvironments({
        environmentOption: 'schema',
        selectedEnvironments: [],
      }),
    ).rejects.toThrow('Failed to export environments: schema generation failed');
  });
});

// ---------------------------------------------------------------------------
// getEnvironmentStatistics
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.getEnvironmentStatistics', () => {
  it('returns zeros for empty data', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({});
    expect(stats).toEqual({
      environments: 0,
      totalVariables: 0,
      secretVariables: 0,
      emptyVariables: 0,
      schemaVariables: 0,
    });
  });

  it('counts enterprise environments and variables correctly', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environments: makeEnterpriseEnvironments(),
    });
    expect(stats.environments).toBe(3);
    expect(stats.totalVariables).toBe(10);
    expect(stats.secretVariables).toBe(5); // CLIENT_SECRET x2, DB_CONN, REDIS, BEARER
    expect(stats.emptyVariables).toBe(0);
  });

  it('counts empty variables (empty value)', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environments: {
        Default: {
          FILLED: envVar('value'),
          EMPTY: envVar(''),
        },
      },
    });
    expect(stats.totalVariables).toBe(2);
    expect(stats.emptyVariables).toBe(1);
  });

  it('counts schema variables from variableDefinitions', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environmentSchema: {
        variableDefinitions: {
          OAUTH2_CLIENT_ID: {},
          OAUTH2_CLIENT_SECRET: {},
          API_GATEWAY_URL: {},
        },
      } as unknown as EnvironmentSchema,
    });
    expect(stats.schemaVariables).toBe(3);
  });

  it('handles both environments and schema data together', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = handler.getEnvironmentStatistics({
      environments: { Default: { KEY: envVar('val') } },
      environmentSchema: {
        variableDefinitions: { KEY: {}, OTHER: {} },
      } as unknown as EnvironmentSchema,
    });
    expect(stats.environments).toBe(1);
    expect(stats.totalVariables).toBe(1);
    expect(stats.schemaVariables).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentsForExport
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.validateEnvironmentsForExport', () => {
  it('accepts empty object', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({});
    expect(result.success).toBe(true);
  });

  it('reports invalid environment schema', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environmentSchema: 'not-an-object' as unknown as EnvironmentSchema,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Schema validation failed');
  });

  it('reports invalid environment variables type', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environments: { Default: 'not-an-object' as unknown as Record<string, EnvironmentVariable> },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('must be an object');
  });

  it('accepts valid enterprise environment data', () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const result = handler.validateEnvironmentsForExport({
      environmentSchema: {
        environments: {},
        variableDefinitions: {},
      } as unknown as EnvironmentSchema,
      environments: makeEnterpriseEnvironments(),
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importEnvironments
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler.importEnvironments', () => {
  it('returns empty stats when no environment data selected', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = await handler.importEnvironments({}, { selectedItems: { environments: false } });
    expect(stats).toEqual({
      environmentsImported: 0,
      variablesCreated: 0,
      errors: [],
    });
  });

  it('returns empty stats when selected but no data present', async () => {
    const handler = new EnvironmentsHandler(makeDeps());
    const stats = await handler.importEnvironments({}, { selectedItems: { environments: true } });
    expect(stats.environmentsImported).toBe(0);
    expect(stats.variablesCreated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _importFullEnvironments
// ---------------------------------------------------------------------------
describe('EnvironmentsHandler._importFullEnvironments', () => {
  it('creates new environments and batch-sets enterprise variables', async () => {
    const createEnvironment = vi.fn();
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment }));
    handler._batchCreateVariables = vi.fn();

    const importData = {
      Production: {
        OAUTH2_CLIENT_SECRET: envVar('sk_prod_9hF60KrOalZGdumwW4cgt0hi', true),
        REDIS_URL: envVar('rediss://default:r3d!s_p@ss@redis.openheaders.io:6380/0', true),
      },
    };

    const stats = await handler._importFullEnvironments(importData, {
      importMode: IMPORT_MODES.REPLACE,
      selectedItems: {},
    });

    expect(createEnvironment).toHaveBeenCalledWith('Production');
    expect(stats.environmentsImported).toBe(1);
    expect(stats.variablesCreated).toBe(2);
  });

  it('skips duplicate variables in merge mode', async () => {
    const existingEnvs = makeEnterpriseEnvironments();
    const handler = new EnvironmentsHandler(makeDeps({ environments: existingEnvs, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn();

    const stats = await handler._importFullEnvironments(
      {
        Default: {
          OAUTH2_CLIENT_ID: envVar('new-id'), // exists — should skip
          NEW_WEBHOOK_URL: envVar('https://hooks.openheaders.io/webhook'), // new — should import
        },
      },
      { importMode: IMPORT_MODES.MERGE, selectedItems: {} },
    );

    expect(stats.variablesCreated).toBe(1);
  });

  it('filters environments by selectedEnvironments', async () => {
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn();

    const importData = {
      Default: { A: envVar('1') },
      'Staging — EU Region': { B: envVar('2') },
      Production: { C: envVar('3') },
    };

    const stats = await handler._importFullEnvironments(importData, {
      importMode: IMPORT_MODES.REPLACE,
      selectedItems: {},
      selectedEnvironments: ['Default', 'Production'],
    });

    expect(stats.environmentsImported).toBe(2);
  });

  it('handles old format (direct string values)', async () => {
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn();

    const stats = await handler._importFullEnvironments(
      { Default: { API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' } } as unknown as Record<
        string,
        Record<string, EnvironmentVariable>
      >,
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} },
    );

    expect(stats.variablesCreated).toBe(1);
    const callArgs = (handler._batchCreateVariables as Mock).mock.calls[0];
    expect(callArgs[0]).toBe('Default');
    expect(callArgs[1][0]).toEqual({ name: 'API_KEY', value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: false });
  });

  it('handles new format (object with value/isSecret)', async () => {
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn();

    const stats = await handler._importFullEnvironments(
      { Production: { BEARER_TOKEN: envVar('Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig', true) } },
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} },
    );

    expect(stats.variablesCreated).toBe(1);
    const callArgs = (handler._batchCreateVariables as Mock).mock.calls[0];
    expect(callArgs[1][0]).toEqual({
      name: 'BEARER_TOKEN',
      value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
      isSecret: true,
    });
  });

  it('records errors when batch create fails', async () => {
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn().mockRejectedValue(new Error('storage write failed'));

    const stats = await handler._importFullEnvironments(
      { Production: { KEY: envVar('value') } },
      { importMode: IMPORT_MODES.REPLACE, selectedItems: {} },
    );

    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('Batch import failed');
    expect(stats.errors[0].environment).toBe('Production');
  });

  it('imports multiple environments with many variables', async () => {
    const handler = new EnvironmentsHandler(makeDeps({ environments: {}, createEnvironment: vi.fn() }));
    handler._batchCreateVariables = vi.fn();

    const importData = makeEnterpriseEnvironments();
    const stats = await handler._importFullEnvironments(importData, {
      importMode: IMPORT_MODES.REPLACE,
      selectedItems: {},
    });

    expect(stats.environmentsImported).toBe(3);
    expect(stats.variablesCreated).toBe(10);
    expect(stats.errors).toEqual([]);
  });
});
