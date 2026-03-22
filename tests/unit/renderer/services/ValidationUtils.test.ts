import { describe, it, expect } from 'vitest';
import {
  validateImportData,
  validateAndParseFileContent,
  validateWorkspaceConfig,
  validateEnvironmentVariable,
  validateProxyRule,
  validateSource,
  validateVersion,
  validateEnvironmentSchema,
  validateImportPayload,
} from '../../../../src/renderer/services/export-import/utilities/ValidationUtils';
import { VALIDATION_RULES } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------
describe('validateImportData', () => {
  it('rejects null', () => {
    const r = validateImportData(null);
    expect(r.success).toBe(false);
  });

  it('rejects undefined', () => {
    const r = validateImportData(undefined);
    expect(r.success).toBe(false);
  });

  it('rejects a string', () => {
    const r = validateImportData('hello');
    expect(r.success).toBe(false);
  });

  it('rejects a number', () => {
    const r = validateImportData(42);
    expect(r.success).toBe(false);
  });

  it('rejects an array', () => {
    const r = validateImportData([1, 2, 3]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('array');
  });

  it('accepts a plain object', () => {
    const r = validateImportData({ sources: [] });
    expect(r.success).toBe(true);
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

  it('rejects invalid JSON', () => {
    const r = validateAndParseFileContent('not json');
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid JSON');
  });

  it('rejects JSON array', () => {
    const r = validateAndParseFileContent('[1,2]');
    expect(r.success).toBe(false);
  });

  it('parses valid JSON object', () => {
    const r = validateAndParseFileContent('{"key":"value"}');
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ key: 'value' });
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceConfig
// ---------------------------------------------------------------------------
describe('validateWorkspaceConfig', () => {
  it('rejects null', () => {
    const r = validateWorkspaceConfig(null);
    expect(r.success).toBe(false);
  });

  it('rejects missing required field name', () => {
    const r = validateWorkspaceConfig({ type: 'git' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('name');
  });

  it('rejects missing required field type', () => {
    const r = validateWorkspaceConfig({ name: 'ws' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('type');
  });

  it('rejects name exceeding max length', () => {
    const r = validateWorkspaceConfig({ name: 'x'.repeat(256), type: 'git' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('maximum length');
  });

  it('accepts valid workspace', () => {
    const r = validateWorkspaceConfig({ name: 'My WS', type: 'git' });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentVariable
// ---------------------------------------------------------------------------
describe('validateEnvironmentVariable', () => {
  it('rejects null', () => {
    const r = validateEnvironmentVariable(null);
    expect(r.success).toBe(false);
  });

  it('rejects missing name', () => {
    const r = validateEnvironmentVariable({});
    expect(r.success).toBe(false);
  });

  it('rejects non-string name', () => {
    const r = validateEnvironmentVariable({ name: 123 });
    expect(r.success).toBe(false);
  });

  it('rejects name exceeding max length', () => {
    const r = validateEnvironmentVariable({ name: 'V'.repeat(256) });
    expect(r.success).toBe(false);
    expect(r.error).toContain('maximum length');
  });

  it('accepts valid variable', () => {
    const r = validateEnvironmentVariable({ name: 'API_KEY' });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateProxyRule
// ---------------------------------------------------------------------------
describe('validateProxyRule', () => {
  it('rejects null', () => {
    const r = validateProxyRule(null);
    expect(r.success).toBe(false);
  });

  it('rejects rule with neither domains nor headerRuleId', () => {
    const r = validateProxyRule({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('domains');
  });

  it('rejects static rule without headerName', () => {
    const r = validateProxyRule({ isDynamic: false, domains: ['example.com'] });
    expect(r.success).toBe(false);
    expect(r.error).toContain('header name');
  });

  it('accepts valid static rule with enterprise domains', () => {
    const r = validateProxyRule({
      isDynamic: false,
      domains: ['*.openheaders.io', 'api.partner-service.io:8443'],
      headerName: 'Authorization',
    });
    expect(r.success).toBe(true);
  });

  it('rejects dynamic rule without headerRuleId', () => {
    const r = validateProxyRule({ isDynamic: true });
    expect(r.success).toBe(false);
    expect(r.error).toContain('header rule ID');
  });

  it('accepts valid dynamic rule', () => {
    const r = validateProxyRule({ isDynamic: true, headerRuleId: 'rule-1' });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSource
// ---------------------------------------------------------------------------
describe('validateSource', () => {
  it('rejects null', () => {
    const r = validateSource(null as unknown as Parameters<typeof validateSource>[0]);
    expect(r.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const r = validateSource({ sourceType: 'file' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('required field');
  });

  it('validates http source needs valid URL', () => {
    const r = validateSource({
      sourceId: 's1',
      sourceType: 'http',
      sourcePath: 'not-a-url',
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('valid URL');
  });

  it('accepts valid http source with enterprise URL', () => {
    const r = validateSource({
      sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      sourceType: 'http',
      sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid file source with enterprise path', () => {
    const r = validateSource({
      sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      sourceType: 'file',
      sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid env source', () => {
    const r = validateSource({
      sourceId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      sourceType: 'env',
      sourcePath: 'OAUTH2_ACCESS_TOKEN',
    });
    expect(r.success).toBe(true);
  });

  it('rejects file source without sourcePath', () => {
    const r = validateSource({
      sourceId: 's1',
      sourceType: 'file',
      sourcePath: '',
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateVersion
// ---------------------------------------------------------------------------
describe('validateVersion', () => {
  it('succeeds for supported version', () => {
    const supported = VALIDATION_RULES.SUPPORTED_VERSIONS[0];
    const r = validateVersion(supported);
    expect(r.success).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('succeeds with warning for unsupported version', () => {
    const r = validateVersion('99.0.0');
    expect(r.success).toBe(true);
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain('99.0.0');
  });
});

// ---------------------------------------------------------------------------
// validateEnvironmentSchema
// ---------------------------------------------------------------------------
describe('validateEnvironmentSchema', () => {
  it('rejects null', () => {
    const r = validateEnvironmentSchema(null);
    expect(r.success).toBe(false);
  });

  it('rejects non-object environments field', () => {
    const r = validateEnvironmentSchema({ environments: 'bad' });
    expect(r.success).toBe(false);
  });

  it('rejects non-object variableDefinitions', () => {
    const r = validateEnvironmentSchema({ variableDefinitions: 42 });
    expect(r.success).toBe(false);
  });

  it('accepts valid schema', () => {
    const r = validateEnvironmentSchema({
      environments: { dev: {} },
      variableDefinitions: { KEY: { type: 'string' } },
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty schema object', () => {
    const r = validateEnvironmentSchema({});
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImportPayload
// ---------------------------------------------------------------------------
describe('validateImportPayload', () => {
  it('rejects null payload', () => {
    const r = validateImportPayload(null as unknown as Parameters<typeof validateImportPayload>[0]);
    expect(r.success).toBe(false);
  });

  it('accepts empty object', () => {
    const r = validateImportPayload({});
    expect(r.success).toBe(true);
  });

  it('collects version warnings', () => {
    const r = validateImportPayload({ version: '99.0.0' });
    expect(r.success).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });

  it('collects workspace errors', () => {
    const r = validateImportPayload({ workspace: { type: 'git' } });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Workspace');
  });

  it('collects source errors', () => {
    const r = validateImportPayload({
      sources: [{ sourceType: 'file' }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Source 1');
  });

  it('collects proxy rule errors', () => {
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

  it('aggregates multiple errors', () => {
    const r = validateImportPayload({
      workspace: {},
      sources: [{}],
    });
    expect(r.success).toBe(false);
    // Should contain both workspace and source errors separated by ;
    expect(r.error).toContain(';');
  });

  it('passes with valid full payload', () => {
    const r = validateImportPayload({
      version: '3.0.0',
      workspace: { name: 'OpenHeaders — Staging', type: 'git' },
      sources: [{
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
      }],
    });
    expect(r.success).toBe(true);
  });

  it('passes with enterprise payload including all data types', () => {
    const r = validateImportPayload({
      version: '3.0.0',
      workspace: { name: 'OpenHeaders — Production', type: 'git' },
      sources: [
        { sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceType: 'http', sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token' },
        { sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json' },
      ],
      proxyRules: [
        { isDynamic: false, domains: ['*.openheaders.io'], headerName: 'Authorization' },
        { isDynamic: true, headerRuleId: 'rule-c3d4e5f6' },
      ],
      environmentSchema: {
        environments: { Production: { variables: [{ name: 'API_KEY', isSecret: true }] } },
        variableDefinitions: { API_KEY: { description: 'Production API key', isSecret: true, usedIn: ['src-gateway'] } },
      },
    });
    expect(r.success).toBe(true);
  });
});
