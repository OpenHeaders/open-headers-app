import { describe, it, expect } from 'vitest';

import {
  extractEnvironmentVariables,
  hasEnvironmentVariables,
  extractVariablesFromRule,
  findMissingVariables,
  validateEnvironmentVariables,
  validateRuleEnvironmentVariables,
  resolveEnvironmentVariables,
  resolveRuleEnvironmentVariables,
  checkRuleActivation,
  formatMissingVariables,
  getResolvedPreview,
} from '../../../../src/renderer/utils/validation/environment-variables';

// ---------------------------------------------------------------------------
// Enterprise variable maps for reuse
// ---------------------------------------------------------------------------

const enterpriseVars: Record<string, string> = {
  OAUTH2_CLIENT_ID: 'oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  OAUTH2_CLIENT_SECRET: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
  API_GATEWAY_URL: 'https://gateway.openheaders.io:8443/v2',
  BEARER_TOKEN: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
  DATABASE_HOST: 'db.openheaders.io',
  DATABASE_PORT: '5432',
  STAGING_DOMAIN: 'staging-eu.openheaders.io',
};

// ======================================================================
// extractEnvironmentVariables
// ======================================================================
describe('extractEnvironmentVariables', () => {
  it('extracts single enterprise variable', () => {
    expect(extractEnvironmentVariables('{{OAUTH2_CLIENT_ID}}')).toEqual(['OAUTH2_CLIENT_ID']);
  });

  it('extracts multiple variables from connection string template', () => {
    expect(
      extractEnvironmentVariables('postgresql://admin@{{DATABASE_HOST}}:{{DATABASE_PORT}}/prod')
    ).toEqual(['DATABASE_HOST', 'DATABASE_PORT']);
  });

  it('deduplicates variables used multiple times', () => {
    expect(
      extractEnvironmentVariables('{{OAUTH2_CLIENT_ID}} and id={{OAUTH2_CLIENT_ID}}')
    ).toEqual(['OAUTH2_CLIENT_ID']);
  });

  it('trims whitespace inside braces', () => {
    expect(extractEnvironmentVariables('{{ OAUTH2_CLIENT_SECRET }}')).toEqual(['OAUTH2_CLIENT_SECRET']);
  });

  it('returns empty array for null', () => {
    expect(extractEnvironmentVariables(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractEnvironmentVariables(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractEnvironmentVariables('')).toEqual([]);
  });

  it('returns empty array when no variables present', () => {
    expect(extractEnvironmentVariables('https://api.openheaders.io/v2/health')).toEqual([]);
  });

  it('extracts from Bearer token pattern', () => {
    expect(extractEnvironmentVariables('Bearer {{BEARER_TOKEN}}')).toEqual(['BEARER_TOKEN']);
  });

  it('extracts from complex URL template with port', () => {
    expect(
      extractEnvironmentVariables('https://{{STAGING_DOMAIN}}:8443/{{API_VERSION}}/resources')
    ).toEqual(['STAGING_DOMAIN', 'API_VERSION']);
  });
});

// ======================================================================
// hasEnvironmentVariables
// ======================================================================
describe('hasEnvironmentVariables', () => {
  it('returns true when enterprise variables exist', () => {
    expect(hasEnvironmentVariables('Bearer {{BEARER_TOKEN}}')).toBe(true);
  });

  it('returns true for connection string template', () => {
    expect(hasEnvironmentVariables('postgresql://{{DATABASE_HOST}}:{{DATABASE_PORT}}')).toBe(true);
  });

  it('returns false for plain enterprise URL', () => {
    expect(hasEnvironmentVariables('https://api.openheaders.io/v2/resources')).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasEnvironmentVariables(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasEnvironmentVariables(undefined)).toBe(false);
  });
});

// ======================================================================
// extractVariablesFromRule
// ======================================================================
describe('extractVariablesFromRule', () => {
  it('extracts from headerName with enterprise pattern', () => {
    expect(
      extractVariablesFromRule({ headerName: 'X-{{HEADER_PREFIX}}-Auth' })
    ).toEqual(['HEADER_PREFIX']);
  });

  it('extracts from headerValue for static rules with JWT', () => {
    expect(
      extractVariablesFromRule({
        headerName: 'Authorization',
        headerValue: 'Bearer {{BEARER_TOKEN}}',
        isDynamic: false,
      })
    ).toEqual(['BEARER_TOKEN']);
  });

  it('does NOT extract from headerValue for dynamic rules', () => {
    expect(
      extractVariablesFromRule({
        headerValue: 'Bearer {{BEARER_TOKEN}}',
        isDynamic: true,
      })
    ).toEqual([]);
  });

  it('extracts from prefix and suffix for dynamic rules', () => {
    expect(
      extractVariablesFromRule({
        isDynamic: true,
        prefix: 'Bearer {{OAUTH2_CLIENT_ID}}',
        suffix: '{{API_SUFFIX}}',
      })
    ).toEqual(['OAUTH2_CLIENT_ID', 'API_SUFFIX']);
  });

  it('extracts from enterprise domain patterns', () => {
    expect(
      extractVariablesFromRule({
        domains: ['{{STAGING_DOMAIN}}', '{{PROD_DOMAIN}}:8443'],
      })
    ).toEqual(['STAGING_DOMAIN', 'PROD_DOMAIN']);
  });

  it('deduplicates across fields', () => {
    expect(
      extractVariablesFromRule({
        headerName: '{{OAUTH2_CLIENT_ID}}',
        headerValue: '{{OAUTH2_CLIENT_ID}}',
        isDynamic: false,
        domains: ['{{OAUTH2_CLIENT_ID}}.example.com'],
      })
    ).toEqual(['OAUTH2_CLIENT_ID']);
  });

  it('handles rule with no fields', () => {
    expect(extractVariablesFromRule({})).toEqual([]);
  });

  it('handles static rule with enterprise header and multiple domains', () => {
    const vars = extractVariablesFromRule({
      headerName: 'X-API-Key',
      headerValue: '{{OAUTH2_CLIENT_SECRET}}',
      isDynamic: false,
      domains: ['*.openheaders.io', '{{STAGING_DOMAIN}}', 'api.partner-service.io:8443'],
    });
    expect(vars).toEqual(['OAUTH2_CLIENT_SECRET', 'STAGING_DOMAIN']);
  });
});

// ======================================================================
// findMissingVariables
// ======================================================================
describe('findMissingVariables', () => {
  it('returns missing enterprise variables', () => {
    expect(
      findMissingVariables(
        ['OAUTH2_CLIENT_ID', 'MISSING_SECRET', 'API_GATEWAY_URL'],
        { OAUTH2_CLIENT_ID: 'oidc-client-abc', API_GATEWAY_URL: 'https://gw.openheaders.io' }
      )
    ).toEqual(['MISSING_SECRET']);
  });

  it('considers empty string as missing', () => {
    expect(findMissingVariables(['OAUTH2_CLIENT_SECRET'], { OAUTH2_CLIENT_SECRET: '' })).toEqual(['OAUTH2_CLIENT_SECRET']);
  });

  it('considers null as missing', () => {
    expect(findMissingVariables(['BEARER_TOKEN'], { BEARER_TOKEN: null })).toEqual(['BEARER_TOKEN']);
  });

  it('considers undefined as missing', () => {
    expect(findMissingVariables(['DATABASE_HOST'], { OTHER: 'val' })).toEqual(['DATABASE_HOST']);
  });

  it('returns empty array when all present', () => {
    expect(
      findMissingVariables(['OAUTH2_CLIENT_ID', 'API_GATEWAY_URL'], enterpriseVars)
    ).toEqual([]);
  });

  it('returns requiredVars when availableVars is null', () => {
    expect(findMissingVariables(['OAUTH2_CLIENT_ID'], null)).toEqual(['OAUTH2_CLIENT_ID']);
  });

  it('returns empty array for non-array requiredVars', () => {
    expect(findMissingVariables(null, {})).toEqual([]);
  });
});

// ======================================================================
// validateEnvironmentVariables
// ======================================================================
describe('validateEnvironmentVariables', () => {
  it('returns valid when all enterprise vars available', () => {
    const result = validateEnvironmentVariables(
      '{{API_GATEWAY_URL}}/oauth2/token?client_id={{OAUTH2_CLIENT_ID}}',
      enterpriseVars
    );
    expect(result).toEqual({
      isValid: true,
      missingVars: [],
      usedVars: ['API_GATEWAY_URL', 'OAUTH2_CLIENT_ID'],
      hasVars: true,
    });
  });

  it('returns invalid when enterprise vars missing', () => {
    const result = validateEnvironmentVariables(
      'Bearer {{MISSING_JWT_TOKEN}}',
      enterpriseVars
    );
    expect(result).toEqual({
      isValid: false,
      missingVars: ['MISSING_JWT_TOKEN'],
      usedVars: ['MISSING_JWT_TOKEN'],
      hasVars: true,
    });
  });

  it('handles text with no variables', () => {
    const result = validateEnvironmentVariables('https://api.openheaders.io/health', enterpriseVars);
    expect(result).toEqual({
      isValid: true,
      missingVars: [],
      usedVars: [],
      hasVars: false,
    });
  });

  it('validates connection string template', () => {
    const result = validateEnvironmentVariables(
      'postgresql://admin@{{DATABASE_HOST}}:{{DATABASE_PORT}}/production',
      enterpriseVars
    );
    expect(result.isValid).toBe(true);
    expect(result.usedVars).toEqual(['DATABASE_HOST', 'DATABASE_PORT']);
  });
});

// ======================================================================
// validateRuleEnvironmentVariables
// ======================================================================
describe('validateRuleEnvironmentVariables', () => {
  it('validates all fields of a static enterprise rule', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: 'Authorization',
        headerValue: 'Bearer {{BEARER_TOKEN}}',
        isDynamic: false,
        domains: ['{{STAGING_DOMAIN}}', 'api.openheaders.io'],
      },
      enterpriseVars
    );
    expect(result.isValid).toBe(true);
    expect(result.totalVarsUsed).toBe(2);
    expect(result.missingVars).toEqual([]);
  });

  it('reports missing vars in enterprise context', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: 'X-API-Key',
        headerValue: '{{MISSING_API_KEY}}',
        isDynamic: false,
      },
      enterpriseVars
    );
    expect(result.isValid).toBe(false);
    expect(result.missingVars).toContain('MISSING_API_KEY');
  });

  it('validates dynamic rule prefix/suffix', () => {
    const result = validateRuleEnvironmentVariables(
      {
        isDynamic: true,
        prefix: 'Bearer {{BEARER_TOKEN}}',
        suffix: ' {{OAUTH2_CLIENT_ID}}',
      },
      enterpriseVars
    );
    expect(result.isValid).toBe(true);
    expect(result.totalVarsUsed).toBe(2);
  });

  it('deduplicates missing vars across fields', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: '{{MISSING_VAR}}',
        headerValue: '{{MISSING_VAR}}',
        isDynamic: false,
        domains: ['{{MISSING_VAR}}.example.com'],
      },
      {}
    );
    expect(result.missingVars).toEqual(['MISSING_VAR']);
  });

  it('validates enterprise rule with multiple domains', () => {
    const result = validateRuleEnvironmentVariables(
      {
        headerName: 'X-Client-ID',
        headerValue: '{{OAUTH2_CLIENT_ID}}',
        isDynamic: false,
        domains: [
          '*.openheaders.io',
          '{{STAGING_DOMAIN}}:8443',
          'api.partner-service.io',
        ],
      },
      enterpriseVars
    );
    expect(result.isValid).toBe(true);
    expect(result.totalVarsUsed).toBe(2); // OAUTH2_CLIENT_ID + STAGING_DOMAIN
  });
});

// ======================================================================
// resolveEnvironmentVariables
// ======================================================================
describe('resolveEnvironmentVariables', () => {
  it('replaces enterprise variables with values', () => {
    expect(
      resolveEnvironmentVariables('Bearer {{BEARER_TOKEN}}', enterpriseVars)
    ).toBe('Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig');
  });

  it('replaces multiple variables in connection string', () => {
    expect(
      resolveEnvironmentVariables(
        'postgresql://admin@{{DATABASE_HOST}}:{{DATABASE_PORT}}/production',
        enterpriseVars
      )
    ).toBe('postgresql://admin@db.openheaders.io:5432/production');
  });

  it('returns placeholder for missing vars by default', () => {
    const result = resolveEnvironmentVariables('{{MISSING_WEBHOOK_SECRET}}', enterpriseVars);
    expect(result).toBe('[MISSING_VAR:MISSING_WEBHOOK_SECRET]');
  });

  it('keeps unresolved when option set', () => {
    const result = resolveEnvironmentVariables('{{MISSING_VAR}}', enterpriseVars, {
      keepUnresolved: true,
    });
    expect(result).toBe('{{MISSING_VAR}}');
  });

  it('uses custom placeholder prefix', () => {
    const result = resolveEnvironmentVariables('{{MISSING_VAR}}', enterpriseVars, {
      placeholderPrefix: '[UNSET:',
    });
    expect(result).toBe('[UNSET:MISSING_VAR]');
  });

  it('returns input for null', () => {
    expect(resolveEnvironmentVariables(null, enterpriseVars)).toBeNull();
  });

  it('returns input for undefined', () => {
    expect(resolveEnvironmentVariables(undefined, enterpriseVars)).toBeUndefined();
  });

  it('handles empty variables value as missing', () => {
    const result = resolveEnvironmentVariables('{{EMPTY}}', { EMPTY: '' });
    expect(result).toBe('[MISSING_VAR:EMPTY]');
  });

  it('resolves full enterprise URL template', () => {
    const result = resolveEnvironmentVariables(
      '{{API_GATEWAY_URL}}/oauth2/token?client_id={{OAUTH2_CLIENT_ID}}',
      enterpriseVars
    );
    expect(result).toBe(
      'https://gateway.openheaders.io:8443/v2/oauth2/token?client_id=oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });
});

// ======================================================================
// resolveRuleEnvironmentVariables
// ======================================================================
describe('resolveRuleEnvironmentVariables', () => {
  it('resolves all static rule fields with enterprise data', () => {
    const rule = {
      headerName: 'Authorization',
      headerValue: 'Bearer {{BEARER_TOKEN}}',
      isDynamic: false,
      domains: ['{{STAGING_DOMAIN}}', 'api.openheaders.io'],
    };
    const resolved = resolveRuleEnvironmentVariables(rule, enterpriseVars);
    expect(resolved.headerName).toBe('Authorization');
    expect(resolved.headerValue).toBe(
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig'
    );
    expect(resolved.domains).toEqual(['staging-eu.openheaders.io', 'api.openheaders.io']);
  });

  it('resolves dynamic rule prefix/suffix', () => {
    const rule = {
      isDynamic: true,
      prefix: 'Bearer {{BEARER_TOKEN}}',
      suffix: ' (client={{OAUTH2_CLIENT_ID}})',
    };
    const resolved = resolveRuleEnvironmentVariables(rule, enterpriseVars);
    expect(resolved.prefix).toBe(
      'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig'
    );
    expect(resolved.suffix).toBe(' (client=oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890)');
  });

  it('does not mutate original rule', () => {
    const rule = { headerName: '{{OAUTH2_CLIENT_ID}}', isDynamic: false };
    const resolved = resolveRuleEnvironmentVariables(rule, enterpriseVars);
    expect(rule.headerName).toBe('{{OAUTH2_CLIENT_ID}}');
    expect(resolved.headerName).toBe('oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });
});

// ======================================================================
// checkRuleActivation
// ======================================================================
describe('checkRuleActivation', () => {
  it('returns shouldApply false when rule disabled', () => {
    const result = checkRuleActivation({ isEnabled: false }, enterpriseVars);
    expect(result).toEqual({
      shouldApply: false,
      reason: 'Rule is disabled',
      missingVars: [],
    });
  });

  it('returns shouldApply true when all enterprise deps satisfied', () => {
    const result = checkRuleActivation(
      {
        isEnabled: true,
        headerName: 'Authorization',
        headerValue: 'Bearer {{BEARER_TOKEN}}',
        isDynamic: false,
      },
      enterpriseVars
    );
    expect(result.shouldApply).toBe(true);
    expect(result.activationState).toBe('active');
    expect(result.missingVars).toEqual([]);
  });

  it('returns shouldApply false when enterprise vars missing', () => {
    const result = checkRuleActivation(
      {
        isEnabled: true,
        headerName: 'X-API-Key',
        headerValue: '{{MISSING_WEBHOOK_SECRET}}',
        isDynamic: false,
      },
      enterpriseVars
    );
    expect(result.shouldApply).toBe(false);
    expect(result.activationState).toBe('waiting_for_deps');
    expect(result.missingVars).toContain('MISSING_WEBHOOK_SECRET');
  });

  it('checks enterprise rule with all fields', () => {
    const result = checkRuleActivation(
      {
        isEnabled: true,
        headerName: 'X-Client-ID',
        headerValue: '{{OAUTH2_CLIENT_ID}}',
        isDynamic: false,
        domains: ['{{STAGING_DOMAIN}}:8443'],
      },
      enterpriseVars
    );
    expect(result.shouldApply).toBe(true);
    expect(result.activationState).toBe('active');
  });
});

// ======================================================================
// formatMissingVariables
// ======================================================================
describe('formatMissingVariables', () => {
  it('returns empty string for empty array', () => {
    expect(formatMissingVariables([])).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatMissingVariables(null)).toBe('');
  });

  it('formats single missing enterprise variable', () => {
    expect(formatMissingVariables(['OAUTH2_CLIENT_SECRET'])).toBe(
      'Missing variable: {{OAUTH2_CLIENT_SECRET}}'
    );
  });

  it('formats multiple missing enterprise variables', () => {
    const result = formatMissingVariables(['OAUTH2_CLIENT_SECRET', 'DATABASE_HOST', 'REDIS_URL']);
    expect(result).toBe(
      'Missing variables: {{OAUTH2_CLIENT_SECRET}}, {{DATABASE_HOST}}, {{REDIS_URL}}'
    );
  });
});

// ======================================================================
// getResolvedPreview
// ======================================================================
describe('getResolvedPreview', () => {
  it('returns empty preview for null text', () => {
    const result = getResolvedPreview(null, enterpriseVars);
    expect(result).toEqual({
      text: '',
      hasMissing: false,
      missingCount: 0,
    });
  });

  it('returns resolved enterprise URL with no missing vars', () => {
    const result = getResolvedPreview(
      '{{API_GATEWAY_URL}}/oauth2/token?client_id={{OAUTH2_CLIENT_ID}}',
      enterpriseVars
    );
    expect(result.text).toBe(
      'https://gateway.openheaders.io:8443/v2/oauth2/token?client_id=oidc-client-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
    expect(result.hasMissing).toBe(false);
    expect(result.missingCount).toBe(0);
  });

  it('reports missing vars in enterprise preview', () => {
    const result = getResolvedPreview(
      'Bearer {{BEARER_TOKEN}} scope={{MISSING_SCOPE}}',
      enterpriseVars
    );
    expect(result.hasMissing).toBe(true);
    expect(result.missingCount).toBe(1);
    expect(result.missingVars).toEqual(['MISSING_SCOPE']);
    expect(result.text).toContain('[MISSING:MISSING_SCOPE]');
    expect(result.text).toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('handles template with all vars missing', () => {
    const result = getResolvedPreview('{{UNKNOWN_A}}/{{UNKNOWN_B}}', {});
    expect(result.hasMissing).toBe(true);
    expect(result.missingCount).toBe(2);
    expect(result.text).toBe('[MISSING:UNKNOWN_A]/[MISSING:UNKNOWN_B]');
  });

  it('returns empty string for undefined text', () => {
    const result = getResolvedPreview(undefined, enterpriseVars);
    expect(result.text).toBe('');
  });
});
