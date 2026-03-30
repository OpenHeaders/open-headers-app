import type { Source } from '@openheaders/core';
import { describe, expect, it } from 'vitest';
import {
  checkMissingVariables,
  extractVariables,
  formatVariableUsage,
  generateUniqueEnvironmentName,
  getSourcesUsingVariables,
  sourceUsesVariables,
} from '@/renderer/components/features/environments/EnvironmentUtils';
import type { EnvironmentVariables } from '@/types/environment';

// ---------------------------------------------------------------------------
// Enterprise-realistic factory
// ---------------------------------------------------------------------------

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceType: 'http',
    sourceName: 'Production API Gateway Token',
    ...overrides,
  };
}

function makeEnterpriseVars(): EnvironmentVariables {
  return {
    OAUTH2_CLIENT_ID: { value: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890', isSecret: false },
    OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true },
    API_GATEWAY_URL: { value: 'https://gateway.openheaders.io:8443/v2', isSecret: false },
    DATABASE_CONNECTION_STRING: { value: 'postgresql://admin:P@ss=w0rd@db.openheaders.io:5432/prod', isSecret: true },
    TOTP_SECRET: { value: 'JBSWY3DPEHPK3PXP', isSecret: true },
    JSON_FILTER_PATH: { value: '$.access_token', isSecret: false },
  };
}

// ======================================================================
// extractVariables
// ======================================================================
describe('extractVariables', () => {
  it('returns empty for text without variables', () => {
    expect(extractVariables('https://api.openheaders.io/v2/resources')).toEqual([]);
  });

  it('extracts single variable', () => {
    expect(extractVariables('{{OAUTH2_CLIENT_ID}}')).toEqual(['OAUTH2_CLIENT_ID']);
  });

  it('extracts multiple variables from enterprise URL template', () => {
    expect(extractVariables('{{API_GATEWAY_URL}}/oauth2/token?client_id={{OAUTH2_CLIENT_ID}}')).toEqual([
      'API_GATEWAY_URL',
      'OAUTH2_CLIENT_ID',
    ]);
  });

  it('returns empty for empty string', () => {
    expect(extractVariables('')).toEqual([]);
  });

  it('handles variables embedded in Bearer token pattern', () => {
    expect(extractVariables('Bearer {{OAUTH2_ACCESS_TOKEN}}')).toEqual(['OAUTH2_ACCESS_TOKEN']);
  });

  it('extracts from connection string template', () => {
    expect(extractVariables('postgresql://{{DB_USER}}:{{DB_PASS}}@{{DB_HOST}}:{{DB_PORT}}/{{DB_NAME}}')).toEqual([
      'DB_USER',
      'DB_PASS',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
    ]);
  });
});

// ======================================================================
// checkMissingVariables
// ======================================================================
describe('checkMissingVariables', () => {
  it('returns empty when all variables exist in enterprise env', () => {
    const sources = [
      makeSource({
        sourcePath: '{{API_GATEWAY_URL}}/oauth2/token',
        requestOptions: {
          headers: [{ key: 'X-Client-ID', value: '{{OAUTH2_CLIENT_ID}}' }],
        },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toEqual([]);
  });

  it('detects missing URL variable', () => {
    const sources = [makeSource({ sourcePath: '{{MISSING_GATEWAY_URL}}/api' })];
    const result = checkMissingVariables(sources, makeEnterpriseVars());
    expect(result).toContain('MISSING_GATEWAY_URL');
  });

  it('detects missing header variable', () => {
    const sources = [
      makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: {
          headers: [{ key: 'Authorization', value: 'Bearer {{MISSING_TOKEN}}' }],
        },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toContain('MISSING_TOKEN');
  });

  it('detects missing body variable', () => {
    const sources = [
      makeSource({
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        requestOptions: { body: '{"client_secret": "{{MISSING_SECRET}}"}' },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toContain('MISSING_SECRET');
  });

  it('detects missing totpSecret variable', () => {
    const sources = [
      makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: { totpSecret: '{{MISSING_TOTP}}' },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toContain('MISSING_TOTP');
  });

  it('detects missing query param variable', () => {
    const sources = [
      makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: {
          queryParams: [{ key: 'api_key', value: '{{MISSING_API_KEY}}' }],
        },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toContain('MISSING_API_KEY');
  });

  it('detects missing JSON filter path variable', () => {
    const sources = [
      makeSource({
        sourcePath: 'https://api.openheaders.io',
        jsonFilter: { enabled: true, path: '{{MISSING_FILTER}}' },
      }),
    ];
    expect(checkMissingVariables(sources, makeEnterpriseVars())).toContain('MISSING_FILTER');
  });

  it('skips non-http sources', () => {
    const sources = [
      makeSource({
        sourceType: 'file',
        sourcePath: '{{API_GATEWAY_URL}}',
      }),
    ];
    expect(checkMissingVariables(sources, {})).toEqual([]);
  });

  it('returns unique missing vars across multiple sources', () => {
    const sources = [
      makeSource({ sourceId: 'src-1', sourcePath: '{{SHARED_VAR}}/a' }),
      makeSource({ sourceId: 'src-2', sourcePath: '{{SHARED_VAR}}/b' }),
    ];
    const result = checkMissingVariables(sources, {});
    expect(result.filter((v) => v === 'SHARED_VAR')).toHaveLength(1);
  });

  it('checks rules for env vars', () => {
    const rules = {
      header: [{ hasEnvVars: true, envVars: ['RULE_OAUTH_TOKEN', 'RULE_API_KEY'] }],
    } as Parameters<typeof checkMissingVariables>[2];
    const result = checkMissingVariables([], {}, rules);
    expect(result).toContain('RULE_OAUTH_TOKEN');
    expect(result).toContain('RULE_API_KEY');
  });

  it('does not flag rule var that exists in environment', () => {
    const rules = {
      header: [{ hasEnvVars: true, envVars: ['OAUTH2_CLIENT_ID'] }],
    } as Parameters<typeof checkMissingVariables>[2];
    const result = checkMissingVariables([], makeEnterpriseVars(), rules);
    expect(result).not.toContain('OAUTH2_CLIENT_ID');
  });

  it('handles source with all variable fields populated', () => {
    const sources = [
      makeSource({
        sourcePath: '{{API_GATEWAY_URL}}/token',
        requestOptions: {
          headers: [{ key: 'X-Client', value: '{{OAUTH2_CLIENT_ID}}' }],
          queryParams: [{ key: 'scope', value: '{{MISSING_SCOPE}}' }],
          body: '{"secret": "{{OAUTH2_CLIENT_SECRET}}"}',
          totpSecret: '{{TOTP_SECRET}}',
        },
        jsonFilter: { enabled: true, path: '{{JSON_FILTER_PATH}}' },
      }),
    ];
    const result = checkMissingVariables(sources, makeEnterpriseVars());
    expect(result).toEqual(['MISSING_SCOPE']);
  });
});

// ======================================================================
// generateUniqueEnvironmentName
// ======================================================================
describe('generateUniqueEnvironmentName', () => {
  it('appends -copy for first duplicate', () => {
    expect(generateUniqueEnvironmentName('Production', {})).toBe('Production-copy');
  });

  it('appends counter when copy exists', () => {
    expect(generateUniqueEnvironmentName('Production', { 'Production-copy': {} })).toBe('Production-copy-1');
  });

  it('increments counter past existing copies', () => {
    const existing = { 'Production-copy': {}, 'Production-copy-1': {}, 'Production-copy-2': {} };
    expect(generateUniqueEnvironmentName('Production', existing)).toBe('Production-copy-3');
  });

  it('handles environment name with special characters', () => {
    expect(generateUniqueEnvironmentName('Staging — EU Region', {})).toBe('Staging — EU Region-copy');
  });
});

// ======================================================================
// sourceUsesVariables
// ======================================================================
describe('sourceUsesVariables', () => {
  it('returns false for null', () => {
    expect(sourceUsesVariables(null)).toBe(false);
  });

  it('returns false for source without variables', () => {
    expect(
      sourceUsesVariables(
        makeSource({
          sourcePath: 'https://api.openheaders.io/v2/resources',
        }),
      ),
    ).toBe(false);
  });

  it('returns true for source with URL variable', () => {
    expect(
      sourceUsesVariables(
        makeSource({
          sourcePath: '{{API_GATEWAY_URL}}/resources',
        }),
      ),
    ).toBe(true);
  });

  it('detects variables in nested request options', () => {
    expect(
      sourceUsesVariables(
        makeSource({
          sourcePath: 'https://api.openheaders.io',
          requestOptions: {
            headers: [{ key: 'Authorization', value: 'Bearer {{OAUTH2_ACCESS_TOKEN}}' }],
          },
        }),
      ),
    ).toBe(true);
  });

  it('detects variables in body', () => {
    expect(
      sourceUsesVariables(
        makeSource({
          sourcePath: 'https://auth.openheaders.io/token',
          requestOptions: { body: '{"secret": "{{CLIENT_SECRET}}"}' },
        }),
      ),
    ).toBe(true);
  });

  it('detects variables in TOTP secret', () => {
    expect(
      sourceUsesVariables(
        makeSource({
          requestOptions: { totpSecret: '{{TOTP_SECRET}}' },
        }),
      ),
    ).toBe(true);
  });
});

// ======================================================================
// getSourcesUsingVariables
// ======================================================================
describe('getSourcesUsingVariables', () => {
  it('returns empty for empty array', () => {
    expect(getSourcesUsingVariables([])).toEqual([]);
  });

  it('filters sources using variables from enterprise set', () => {
    const sources = [
      makeSource({ sourceId: 'src-1', sourcePath: '{{API_GATEWAY_URL}}/resources' }),
      makeSource({ sourceId: 'src-2', sourcePath: 'https://api.openheaders.io/static' }),
      makeSource({ sourceId: 'src-3', requestOptions: { body: '{{REQUEST_BODY}}' } }),
    ];
    const result = getSourcesUsingVariables(sources);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sourceId)).toEqual(['src-1', 'src-3']);
  });
});

// ======================================================================
// formatVariableUsage
// ======================================================================
describe('formatVariableUsage', () => {
  it('returns empty for empty sourceIds', () => {
    expect(formatVariableUsage('OAUTH2_CLIENT_ID', [], [])).toEqual([]);
  });

  it('formats regular source with enterprise source name', () => {
    const sources = [
      makeSource({
        sourceId: 'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceName: 'Production API Gateway Token',
      }),
    ];
    const result = formatVariableUsage('OAUTH2_CLIENT_ID', ['src-a1b2c3d4-e5f6-7890-abcd-ef1234567890'], sources);
    expect(result).toEqual([
      {
        sourceId: 'src-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceName: 'Production API Gateway Token',
        isRule: false,
      },
    ]);
  });

  it('formats rule identifier with header name', () => {
    const rules = {
      header: [{ id: 'r-abc123', headerName: 'X-OpenHeaders-Auth' }],
    } as Parameters<typeof formatVariableUsage>[3];
    const result = formatVariableUsage('OAUTH2_ACCESS_TOKEN', ['rule-r-abc123'], [], rules);
    expect(result).toEqual([
      {
        sourceId: 'rule-r-abc123',
        sourceName: 'X-OpenHeaders-Auth',
        isRule: true,
      },
    ]);
  });

  it('uses fallback name for unknown rule', () => {
    const result = formatVariableUsage('VAR', ['rule-unknown-id'], [], { header: [] });
    expect(result[0].isRule).toBe(true);
    expect(result[0].sourceName).toContain('Rule');
  });

  it('uses fallback name for unknown source', () => {
    const result = formatVariableUsage('VAR', ['src-unknown'], []);
    expect(result[0].sourceName).toContain('Source src-unknown');
    expect(result[0].isRule).toBe(false);
  });

  it('formats multiple sources for the same variable', () => {
    const sources = [
      makeSource({ sourceId: 'src-1', sourceName: 'Auth Token Fetcher' }),
      makeSource({ sourceId: 'src-2', sourceName: 'API Key Validator' }),
    ];
    const result = formatVariableUsage('API_GATEWAY_URL', ['src-1', 'src-2'], sources);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ sourceId: 'src-1', sourceName: 'Auth Token Fetcher', isRule: false });
    expect(result[1]).toEqual({ sourceId: 'src-2', sourceName: 'API Key Validator', isRule: false });
  });

  it('handles mix of sources and rules', () => {
    const sources = [makeSource({ sourceId: 'src-1', sourceName: 'Token Source' })];
    const rules = { header: [{ id: '42', headerName: 'Authorization' }] } as Parameters<typeof formatVariableUsage>[3];
    const result = formatVariableUsage('TOKEN', ['src-1', 'rule-42'], sources, rules);
    expect(result).toHaveLength(2);
    expect(result[0].isRule).toBe(false);
    expect(result[1].isRule).toBe(true);
    expect(result[1].sourceName).toBe('Authorization');
  });
});
