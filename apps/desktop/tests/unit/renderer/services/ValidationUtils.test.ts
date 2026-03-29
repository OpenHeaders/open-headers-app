import { describe, expect, it } from 'vitest';
import { VALIDATION_RULES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';
import {
  validateAndParseFileContent,
  validateEnvironmentSchema,
  validateEnvironmentVariable,
  validateImportData,
  validateImportPayload,
  validateProxyRule,
  validateSource,
  validateVersion,
  validateWorkspaceConfig,
} from '../../../../src/renderer/services/export-import/utilities/ValidationUtils';

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------
describe('validateImportData', () => {
  it('rejects null with error message', () => {
    const r = validateImportData(null);
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });

  it('rejects undefined', () => {
    expect(validateImportData(undefined).success).toBe(false);
  });

  it('rejects a string', () => {
    expect(validateImportData('hello').success).toBe(false);
  });

  it('rejects a number', () => {
    expect(validateImportData(42).success).toBe(false);
  });

  it('rejects a boolean', () => {
    expect(validateImportData(true).success).toBe(false);
  });

  it('rejects an array with specific message', () => {
    const r = validateImportData([1, 2, 3]);
    expect(r).toEqual({ success: false, error: 'Import data must be an object, not an array' });
  });

  it('accepts a plain object', () => {
    expect(validateImportData({ sources: [] })).toEqual({ success: true });
  });

  it('accepts an empty object', () => {
    expect(validateImportData({})).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateAndParseFileContent
// ---------------------------------------------------------------------------
describe('validateAndParseFileContent', () => {
  it('rejects empty content', () => {
    const r = validateAndParseFileContent('');
    expect(r.success).toBe(false);
    expect(r.error).toContain('empty');
  });

  it('rejects non-string input', () => {
    const r = validateAndParseFileContent(null as unknown as string);
    expect(r.success).toBe(false);
    expect(r.error).toContain('empty');
  });

  it('rejects invalid JSON with error details', () => {
    const r = validateAndParseFileContent('not json at all');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/^Invalid JSON format:/);
  });

  it('rejects truncated JSON', () => {
    const r = validateAndParseFileContent('{"key": "val');
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid JSON');
  });

  it('rejects JSON array', () => {
    const r = validateAndParseFileContent('[1,2]');
    expect(r.success).toBe(false);
  });

  it('parses valid JSON object and returns data', () => {
    const r = validateAndParseFileContent('{"key":"value"}');
    expect(r).toEqual({ success: true, data: { key: 'value' } });
  });

  it('parses enterprise config JSON', () => {
    const config = JSON.stringify({
      version: '3.0.0',
      sources: [
        {
          sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          sourceType: 'http',
          sourcePath: 'https://auth.openheaders.io/oauth2/token',
        },
      ],
      workspace: { name: 'OpenHeaders — Production', type: 'git' },
    });
    const r = validateAndParseFileContent(config);
    expect(r.success).toBe(true);
    expect(r.data).toEqual(expect.objectContaining({ version: '3.0.0' }));
  });

  it('rejects JSON with trailing garbage', () => {
    const r = validateAndParseFileContent('{"a":1} extra');
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid JSON');
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceConfig
// ---------------------------------------------------------------------------
describe('validateWorkspaceConfig', () => {
  it('rejects null', () => {
    expect(validateWorkspaceConfig(null)).toEqual({
      success: false,
      error: 'Workspace configuration is required and must be an object',
    });
  });

  it('rejects non-object (string)', () => {
    expect(validateWorkspaceConfig('ws').success).toBe(false);
  });

  it('rejects missing required field name', () => {
    const r = validateWorkspaceConfig({ type: 'git' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('name');
  });

  it('rejects missing required field type', () => {
    const r = validateWorkspaceConfig({ name: 'OpenHeaders — Production' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('type');
  });

  it('rejects name exceeding max length', () => {
    const r = validateWorkspaceConfig({ name: 'x'.repeat(VALIDATION_RULES.MAX_NAME_LENGTH + 1), type: 'git' });
    expect(r.success).toBe(false);
    expect(r.error).toContain(`maximum length of ${VALIDATION_RULES.MAX_NAME_LENGTH}`);
  });

  it('accepts name at exactly max length', () => {
    const r = validateWorkspaceConfig({ name: 'x'.repeat(VALIDATION_RULES.MAX_NAME_LENGTH), type: 'git' });
    expect(r.success).toBe(true);
  });

  it('accepts valid enterprise workspace', () => {
    expect(
      validateWorkspaceConfig({
        name: 'OpenHeaders — Staging Environment',
        type: 'git',
        gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
      }),
    ).toEqual({ success: true });
  });

  it('rejects empty name', () => {
    expect(validateWorkspaceConfig({ name: '', type: 'git' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentVariable
// ---------------------------------------------------------------------------
describe('validateEnvironmentVariable', () => {
  it('rejects null', () => {
    expect(validateEnvironmentVariable(null)).toEqual({
      success: false,
      error: 'Environment variable must be an object',
    });
  });

  it('rejects missing name', () => {
    expect(validateEnvironmentVariable({}).success).toBe(false);
  });

  it('rejects non-string name', () => {
    expect(validateEnvironmentVariable({ name: 123 }).success).toBe(false);
  });

  it('rejects name exceeding max length', () => {
    const r = validateEnvironmentVariable({ name: 'V'.repeat(VALIDATION_RULES.MAX_NAME_LENGTH + 1) });
    expect(r.success).toBe(false);
    expect(r.error).toContain(`maximum length of ${VALIDATION_RULES.MAX_NAME_LENGTH}`);
  });

  it('accepts valid enterprise variable name', () => {
    expect(validateEnvironmentVariable({ name: 'OPENHEADERS_OAUTH2_CLIENT_SECRET' })).toEqual({ success: true });
  });

  it('accepts variable with additional properties', () => {
    expect(
      validateEnvironmentVariable({
        name: 'API_GATEWAY_KEY',
        value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        isSecret: true,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateProxyRule
// ---------------------------------------------------------------------------
describe('validateProxyRule', () => {
  it('rejects null', () => {
    expect(validateProxyRule(null)).toEqual({
      success: false,
      error: 'Proxy rule must be an object',
    });
  });

  it('rejects non-object', () => {
    expect(validateProxyRule('rule').success).toBe(false);
  });

  it('rejects rule with neither domains nor headerRuleId', () => {
    const r = validateProxyRule({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('domains');
  });

  it('rejects static rule without headerName', () => {
    const r = validateProxyRule({ isDynamic: false, domains: ['*.openheaders.io'] });
    expect(r.success).toBe(false);
    expect(r.error).toContain('header name');
  });

  it('rejects static rule with empty domains array', () => {
    const r = validateProxyRule({ isDynamic: false, domains: [], headerName: 'Authorization' });
    expect(r.success).toBe(false);
  });

  it('accepts valid static rule with enterprise domains', () => {
    expect(
      validateProxyRule({
        isDynamic: false,
        domains: ['*.openheaders.io', 'api.staging.openheaders.io'],
        headerName: 'Authorization',
        headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
      }),
    ).toEqual({ success: true });
  });

  it('rejects dynamic rule without headerRuleId', () => {
    const r = validateProxyRule({ isDynamic: true });
    expect(r.success).toBe(false);
    expect(r.error).toContain('header rule ID');
  });

  it('rejects dynamic rule with non-string headerRuleId', () => {
    const r = validateProxyRule({ isDynamic: true, headerRuleId: 123 });
    expect(r.success).toBe(false);
  });

  it('accepts valid dynamic rule with UUID headerRuleId', () => {
    expect(
      validateProxyRule({
        isDynamic: true,
        headerRuleId: 'rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      }),
    ).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateSource
// ---------------------------------------------------------------------------
describe('validateSource', () => {
  it('rejects null', () => {
    expect(validateSource(null as unknown as Parameters<typeof validateSource>[0]).success).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateSource('source' as unknown as Parameters<typeof validateSource>[0]).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const r = validateSource({ sourceType: 'file' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('required field');
  });

  it('rejects http source with invalid URL', () => {
    const r = validateSource({
      sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sourceType: 'http',
      sourcePath: 'not-a-url',
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('valid URL');
  });

  it('accepts valid http source with enterprise URL', () => {
    expect(
      validateSource({
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
      }),
    ).toEqual({ success: true });
  });

  it('accepts valid file source with enterprise path', () => {
    expect(
      validateSource({
        sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
      }),
    ).toEqual({ success: true });
  });

  it('accepts valid env source', () => {
    expect(
      validateSource({
        sourceId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        sourceType: 'env',
        sourcePath: 'OAUTH2_ACCESS_TOKEN',
      }),
    ).toEqual({ success: true });
  });

  it('rejects file source without sourcePath', () => {
    expect(
      validateSource({
        sourceId: 's1',
        sourceType: 'file',
        sourcePath: '',
      }).success,
    ).toBe(false);
  });

  it('rejects env source without sourcePath', () => {
    expect(
      validateSource({
        sourceId: 's1',
        sourceType: 'env',
        sourcePath: '',
      }).success,
    ).toBe(false);
  });

  it('accepts http source with complex URL', () => {
    expect(
      validateSource({
        sourceId: 's1',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/realms/production/protocol/openid-connect/token?scope=openid+profile',
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateVersion
// ---------------------------------------------------------------------------
describe('validateVersion', () => {
  it('rejects falsy version', () => {
    expect(validateVersion('').success).toBe(false);
    expect(validateVersion(null as unknown as string).success).toBe(false);
  });

  it('rejects non-string version', () => {
    expect(validateVersion(123 as unknown as string).success).toBe(false);
  });

  it('succeeds for supported version without warning', () => {
    const supported = VALIDATION_RULES.SUPPORTED_VERSIONS[0];
    const r = validateVersion(supported);
    expect(r).toEqual({ success: true });
  });

  it('succeeds with warning for unsupported version', () => {
    const r = validateVersion('99.0.0');
    expect(r.success).toBe(true);
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain('99.0.0');
    expect(r.warning).toContain('Supported versions');
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentSchema
// ---------------------------------------------------------------------------
describe('validateEnvironmentSchema', () => {
  it('rejects null', () => {
    expect(validateEnvironmentSchema(null)).toEqual({
      success: false,
      error: 'Environment schema must be an object',
    });
  });

  it('rejects non-object', () => {
    expect(validateEnvironmentSchema('schema').success).toBe(false);
  });

  it('rejects non-object environments field', () => {
    const r = validateEnvironmentSchema({ environments: 'bad' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('environments must be an object');
  });

  it('rejects non-object variableDefinitions', () => {
    const r = validateEnvironmentSchema({ variableDefinitions: 42 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('variable definitions');
  });

  it('accepts valid enterprise schema', () => {
    expect(
      validateEnvironmentSchema({
        environments: {
          Development: { variables: [{ name: 'API_URL' }] },
          Staging: { variables: [{ name: 'API_URL' }] },
          Production: { variables: [{ name: 'API_URL', isSecret: true }] },
        },
        variableDefinitions: {
          API_URL: { description: 'OpenHeaders API gateway URL', isSecret: false },
          API_KEY: { description: 'Production API key', isSecret: true, usedIn: ['src-gateway'] },
        },
      }),
    ).toEqual({ success: true });
  });

  it('accepts empty schema object', () => {
    expect(validateEnvironmentSchema({})).toEqual({ success: true });
  });

  it('accepts schema with array variableDefinitions', () => {
    expect(
      validateEnvironmentSchema({
        variableDefinitions: [{ name: 'KEY', type: 'string' }],
      }),
    ).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateImportPayload
// ---------------------------------------------------------------------------
describe('validateImportPayload', () => {
  it('rejects null payload', () => {
    expect(validateImportPayload(null as unknown as Parameters<typeof validateImportPayload>[0]).success).toBe(false);
  });

  it('accepts empty object', () => {
    const r = validateImportPayload({});
    expect(r).toEqual({ success: true, warnings: [] });
  });

  it('collects version warnings without failing', () => {
    const r = validateImportPayload({ version: '99.0.0' });
    expect(r.success).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings![0]).toContain('99.0.0');
  });

  it('collects workspace errors', () => {
    const r = validateImportPayload({ workspace: { type: 'git' } });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Workspace');
  });

  it('collects source errors with index', () => {
    const r = validateImportPayload({
      sources: [{ sourceType: 'file' }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
  });

  it('collects proxy rule errors with index', () => {
    const r = validateImportPayload({
      proxyRules: [{}],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Proxy rule 1');
  });

  it('collects environment schema errors', () => {
    const r = validateImportPayload({
      environmentSchema: 'invalid' as never,
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Environment schema');
  });

  it('aggregates multiple errors separated by semicolons', () => {
    const r = validateImportPayload({
      workspace: {},
      sources: [{}],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain(';');
  });

  it('passes with valid full enterprise payload', () => {
    const r = validateImportPayload({
      version: '3.0.0',
      workspace: { name: 'OpenHeaders — Staging', type: 'git' },
      sources: [
        {
          sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          sourceType: 'http',
          sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('validates comprehensive enterprise payload with all data types', () => {
    const r = validateImportPayload({
      version: '3.0.0',
      workspace: { name: 'OpenHeaders — Production', type: 'git' },
      sources: [
        {
          sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          sourceType: 'http',
          sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
        },
        {
          sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          sourceType: 'file',
          sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
        },
        { sourceId: 'c3d4e5f6-a7b8-9012-cdef-123456789012', sourceType: 'env', sourcePath: 'OAUTH2_ACCESS_TOKEN' },
      ],
      proxyRules: [
        { isDynamic: false, domains: ['*.openheaders.io'], headerName: 'Authorization' },
        { isDynamic: true, headerRuleId: 'rule-c3d4e5f6' },
      ],
      environmentSchema: {
        environments: { Production: { variables: [{ name: 'API_KEY', isSecret: true }] } },
        variableDefinitions: { API_KEY: { description: 'Production API key', isSecret: true, usedIn: ['Production'] } },
      },
    });
    expect(r.success).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('collects errors from multiple invalid sources', () => {
    const r = validateImportPayload({
      sources: [
        { sourceType: 'http', sourceId: 's1', sourcePath: 'not-a-url' },
        { sourceType: 'file' }, // missing required fields
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
    expect(r.error).toContain('Source 2');
  });
});
