import { describe, expect, it } from 'vitest';
import type { Source } from '@/types/source';

type ImportSource = Pick<Source, 'sourceType' | 'sourcePath'>;

function makeImportSource(overrides: Partial<ImportSource> & { sourceType: Source['sourceType'] }): ImportSource {
  return { sourcePath: '', ...overrides };
}

function makeEnterpriseHttpSource(path = 'https://auth.openheaders.internal:8443/oauth2/token'): ImportSource {
  return { sourceType: 'http', sourcePath: path };
}

function makeEnterpriseFileSource(path = '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json'): ImportSource {
  return { sourceType: 'file', sourcePath: path };
}

function makeEnterpriseEnvSource(varName = 'OAUTH2_ACCESS_TOKEN'): ImportSource {
  return { sourceType: 'env', sourcePath: varName };
}

import {
  areHeaderModificationsEqual,
  areHeadersEqual,
  areRulesContentEqual,
  batchDuplicateDetection,
  createDuplicateDetector,
  generateUniqueName,
  isEnvironmentVariableDuplicate,
  isProxyRuleDuplicate,
  isRuleDuplicate,
  isSourceDuplicate,
  isWorkspaceNameDuplicate,
} from '@/renderer/services/export-import/utilities/DuplicateDetection';

// ---------------------------------------------------------------------------
// isSourceDuplicate
// ---------------------------------------------------------------------------
describe('isSourceDuplicate', () => {
  it('returns false for null source', () => {
    expect(isSourceDuplicate(null, [])).toBe(false);
  });

  it('returns false for non-array existingSources', () => {
    expect(isSourceDuplicate(makeEnterpriseHttpSource(), null as never)).toBe(false);
  });

  it('detects file source duplicate by sourcePath', () => {
    const source = makeEnterpriseFileSource();
    expect(isSourceDuplicate(source, [makeEnterpriseFileSource()])).toBe(true);
  });

  it('does not flag different file sources', () => {
    const source = makeImportSource({
      sourceType: 'file',
      sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/production.json',
    });
    expect(isSourceDuplicate(source, [makeEnterpriseFileSource()])).toBe(false);
  });

  it('does not match sources with different types but same path', () => {
    const url = 'https://auth.openheaders.internal:8443/oauth2/token';
    const source = makeImportSource({ sourceType: 'http', sourcePath: url });
    expect(isSourceDuplicate(source, [makeImportSource({ sourceType: 'file', sourcePath: url })])).toBe(false);
  });

  it('detects env source duplicate by sourcePath', () => {
    const source = makeEnterpriseEnvSource();
    expect(isSourceDuplicate(source, [makeEnterpriseEnvSource()])).toBe(true);
  });

  it('detects http source duplicate by sourcePath', () => {
    const source = makeEnterpriseHttpSource();
    expect(isSourceDuplicate(source, [makeEnterpriseHttpSource()])).toBe(true);
  });

  it('http source with different url is not duplicate', () => {
    const source = makeEnterpriseHttpSource('https://api.openheaders.io:8443/v2/config');
    expect(isSourceDuplicate(source, [makeEnterpriseHttpSource()])).toBe(false);
  });

  it('handles unknown source type by comparing sourcePath', () => {
    const source = { sourceType: 'custom' as Source['sourceType'], sourcePath: '/x' };
    expect(isSourceDuplicate(source, [{ sourceType: 'custom' as Source['sourceType'], sourcePath: '/x' }])).toBe(true);
  });

  it('returns false for empty existing list', () => {
    expect(isSourceDuplicate(makeEnterpriseHttpSource(), [])).toBe(false);
  });

  it('detects duplicate among multiple enterprise sources', () => {
    const source = makeEnterpriseHttpSource();
    const existing = [
      makeEnterpriseFileSource(),
      makeEnterpriseEnvSource(),
      makeEnterpriseHttpSource(), // duplicate
    ];
    expect(isSourceDuplicate(source, existing)).toBe(true);
  });

  it('handles sources with paths containing spaces', () => {
    const path = '/Users/jane doe/My Documents/OpenHeaders Config/tokens.json';
    const source = makeImportSource({ sourceType: 'file', sourcePath: path });
    expect(isSourceDuplicate(source, [makeImportSource({ sourceType: 'file', sourcePath: path })])).toBe(true);
  });

  it('handles sources with long URL paths', () => {
    const longUrl = 'https://auth.openheaders.io/realms/production/protocol/openid-connect/token';
    const source = makeEnterpriseHttpSource(longUrl);
    expect(isSourceDuplicate(source, [makeEnterpriseHttpSource(longUrl)])).toBe(true);
    expect(isSourceDuplicate(source, [makeEnterpriseHttpSource()])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areHeadersEqual
// ---------------------------------------------------------------------------
describe('areHeadersEqual', () => {
  it('returns true for identical static headers', () => {
    const h = { name: 'Authorization', isDynamic: false, value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig' };
    expect(areHeadersEqual(h, { ...h })).toBe(true);
  });

  it('returns false for different header names', () => {
    expect(
      areHeadersEqual(
        { name: 'Authorization', isDynamic: false, value: 'abc' },
        { name: 'X-API-Key', isDynamic: false, value: 'abc' },
      ),
    ).toBe(false);
  });

  it('returns false when isDynamic differs', () => {
    expect(
      areHeadersEqual(
        { name: 'Authorization', isDynamic: false, value: 'abc' },
        { name: 'Authorization', isDynamic: true, sourceId: 's1' },
      ),
    ).toBe(false);
  });

  it('returns false for different static values', () => {
    expect(
      areHeadersEqual(
        { name: 'Authorization', isDynamic: false, value: 'Bearer token-a' },
        { name: 'Authorization', isDynamic: false, value: 'Bearer token-b' },
      ),
    ).toBe(false);
  });

  it('returns true for identical dynamic headers with enterprise source', () => {
    const h = {
      name: 'Authorization',
      isDynamic: true,
      sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      prefix: 'Bearer ',
      suffix: '',
    };
    expect(areHeadersEqual(h, { ...h })).toBe(true);
  });

  it('treats undefined prefix/suffix as empty string for dynamic headers', () => {
    const h1 = { name: 'Authorization', isDynamic: true, sourceId: 's1' };
    const h2 = { name: 'Authorization', isDynamic: true, sourceId: 's1', prefix: '', suffix: '' };
    expect(areHeadersEqual(h1, h2)).toBe(true);
  });

  it('returns false for different sourceId in dynamic headers', () => {
    expect(
      areHeadersEqual(
        { name: 'Authorization', isDynamic: true, sourceId: 'src-prod-1' },
        { name: 'Authorization', isDynamic: true, sourceId: 'src-staging-2' },
      ),
    ).toBe(false);
  });

  it('returns false for different prefix in dynamic headers', () => {
    expect(
      areHeadersEqual(
        { name: 'Authorization', isDynamic: true, sourceId: 's1', prefix: 'Bearer ' },
        { name: 'Authorization', isDynamic: true, sourceId: 's1', prefix: 'Token ' },
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isProxyRuleDuplicate
// ---------------------------------------------------------------------------
describe('isProxyRuleDuplicate', () => {
  it('returns false for null rule', () => {
    expect(isProxyRuleDuplicate(null, [])).toBe(false);
  });

  it('returns false when existingRules is not an array', () => {
    expect(isProxyRuleDuplicate({ id: '1', headerName: 'X' }, null as never)).toBe(false);
  });

  it('detects duplicate by ID', () => {
    const rule = {
      id: 'pr-a1b2c3d4-e5f6-7890',
      headerName: 'Authorization',
      headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.sig',
      domains: ['*.openheaders.io'],
    };
    expect(isProxyRuleDuplicate(rule, [{ ...rule }])).toBe(true);
  });

  it('detects duplicate by header name, value, and sorted domains', () => {
    const rule = {
      id: 'pr-new-id',
      headerName: 'Authorization',
      headerValue: 'Bearer token123',
      domains: ['*.openheaders.io', 'api.partner-service.io'],
    };
    const existing = [
      {
        id: 'pr-old-id',
        headerName: 'Authorization',
        headerValue: 'Bearer token123',
        domains: ['api.partner-service.io', '*.openheaders.io'], // reversed order
      },
    ];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(true);
  });

  it('does not match rules with different header names', () => {
    expect(
      isProxyRuleDuplicate({ id: '1', headerName: 'X-API-Key', headerValue: 'v1' }, [
        { id: '2', headerName: 'Authorization', headerValue: 'v1' },
      ]),
    ).toBe(false);
  });

  it('does not match rules with different domains', () => {
    expect(
      isProxyRuleDuplicate({ id: '1', headerName: 'Authorization', headerValue: 'v1', domains: ['a.openheaders.io'] }, [
        { id: '2', headerName: 'Authorization', headerValue: 'v1', domains: ['b.openheaders.io'] },
      ]),
    ).toBe(false);
  });

  it('matches rules with same headers and no domains (both undefined)', () => {
    expect(
      isProxyRuleDuplicate({ id: '1', headerName: 'X-Key', headerValue: 'v1' }, [
        { id: '2', headerName: 'X-Key', headerValue: 'v1' },
      ]),
    ).toBe(true);
  });

  it('does not match rules with different values', () => {
    expect(
      isProxyRuleDuplicate({ id: '1', headerName: 'Authorization', headerValue: 'Bearer a' }, [
        { id: '2', headerName: 'Authorization', headerValue: 'Bearer b' },
      ]),
    ).toBe(false);
  });

  it('returns false for empty existing list', () => {
    expect(
      isProxyRuleDuplicate(
        { id: '1', headerName: 'Authorization', headerValue: 'v1', domains: ['*.openheaders.io'] },
        [],
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRuleDuplicate / areRulesContentEqual
// ---------------------------------------------------------------------------
describe('isRuleDuplicate', () => {
  it('returns false for null rule', () => {
    expect(isRuleDuplicate(null, [])).toBe(false);
  });

  it('returns false for non-array existing', () => {
    expect(isRuleDuplicate({ id: 'r1' }, null as never)).toBe(false);
  });

  it('detects duplicate by id', () => {
    expect(isRuleDuplicate({ id: 'rule-a1b2c3d4' }, [{ id: 'rule-a1b2c3d4' }])).toBe(true);
  });

  it('does not match different ids', () => {
    expect(isRuleDuplicate({ id: 'r1' }, [{ id: 'r2' }])).toBe(false);
  });

  it('falls back to content comparison when no id', () => {
    const rule = { name: 'Block OpenHeaders CDN', enabled: true, pattern: '*.cdn.openheaders.io', action: 'block' };
    expect(isRuleDuplicate(rule, [{ ...rule }])).toBe(true);
  });

  it('content comparison detects different names', () => {
    expect(
      isRuleDuplicate({ name: 'Rule A', enabled: true, pattern: '*.openheaders.io', action: 'block' }, [
        { name: 'Rule B', enabled: true, pattern: '*.openheaders.io', action: 'block' },
      ]),
    ).toBe(false);
  });

  it('content comparison detects different enabled state', () => {
    expect(
      isRuleDuplicate({ name: 'Rule', enabled: true, pattern: '*', action: 'block' }, [
        { name: 'Rule', enabled: false, pattern: '*', action: 'block' },
      ]),
    ).toBe(false);
  });
});

describe('areRulesContentEqual', () => {
  it('returns false for different actions', () => {
    const base = { name: 'R', enabled: true, pattern: '*.openheaders.io' };
    expect(areRulesContentEqual({ ...base, action: 'block' }, { ...base, action: 'redirect' })).toBe(false);
  });

  it('compares redirect URLs', () => {
    const base = { name: 'R', enabled: true, pattern: '*', action: 'redirect' };
    expect(
      areRulesContentEqual(
        { ...base, redirectUrl: 'https://api.openheaders.io/v2' },
        { ...base, redirectUrl: 'https://api.openheaders.io/v2' },
      ),
    ).toBe(true);
  });

  it('compares redirect URLs - different', () => {
    const base = { name: 'R', enabled: true, pattern: '*', action: 'redirect' };
    expect(
      areRulesContentEqual(
        { ...base, redirectUrl: 'https://api.openheaders.io/v1' },
        { ...base, redirectUrl: 'https://api.openheaders.io/v2' },
      ),
    ).toBe(false);
  });

  it('compares payloads for modify-payload', () => {
    const base = { name: 'R', enabled: true, pattern: '*', action: 'modify-payload' };
    expect(areRulesContentEqual({ ...base, payload: '{"key":"value"}' }, { ...base, payload: '{"key":"value"}' })).toBe(
      true,
    );
  });

  it('block rules with same basics are equal', () => {
    const r = { name: 'R', enabled: true, pattern: '*.openheaders.io', action: 'block' };
    expect(areRulesContentEqual(r, { ...r })).toBe(true);
  });

  it('modify-headers compares headers', () => {
    const headers = [{ name: 'Authorization', isDynamic: false, value: 'Bearer token' }];
    const base = { name: 'R', enabled: true, pattern: '*', action: 'modify-headers' };
    expect(areRulesContentEqual({ ...base, headers }, { ...base, headers: [...headers] })).toBe(true);
  });

  it('unknown action falls back to JSON comparison', () => {
    const r = { name: 'R', enabled: true, pattern: '*', action: 'custom', x: 1 };
    expect(areRulesContentEqual(r, { ...r })).toBe(true);
  });

  it('returns false for different patterns', () => {
    expect(
      areRulesContentEqual(
        { name: 'R', enabled: true, pattern: '*.openheaders.io', action: 'block' },
        { name: 'R', enabled: true, pattern: '*.partner.io', action: 'block' },
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areHeaderModificationsEqual
// ---------------------------------------------------------------------------
describe('areHeaderModificationsEqual', () => {
  it('returns true when both are undefined', () => {
    expect(areHeaderModificationsEqual(undefined, undefined)).toBe(true);
  });

  it('returns false when one is array and one is undefined', () => {
    expect(areHeaderModificationsEqual([], undefined)).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(areHeaderModificationsEqual([{ name: 'Authorization', isDynamic: false, value: '1' }], [])).toBe(false);
  });

  it('sorts by name for comparison (order-independent)', () => {
    const a = [
      { name: 'X-Request-ID', isDynamic: false, value: '2' },
      { name: 'Authorization', isDynamic: false, value: '1' },
    ];
    const b = [
      { name: 'Authorization', isDynamic: false, value: '1' },
      { name: 'X-Request-ID', isDynamic: false, value: '2' },
    ];
    expect(areHeaderModificationsEqual(a, b)).toBe(true);
  });

  it('returns false for same names but different values', () => {
    expect(
      areHeaderModificationsEqual(
        [{ name: 'Authorization', isDynamic: false, value: 'Bearer a' }],
        [{ name: 'Authorization', isDynamic: false, value: 'Bearer b' }],
      ),
    ).toBe(false);
  });

  it('compares enterprise-like header arrays', () => {
    const headers = [
      { name: 'Authorization', isDynamic: true, sourceId: 'src-prod', prefix: 'Bearer ', suffix: '' },
      { name: 'X-Correlation-ID', isDynamic: false, value: 'req-a1b2c3d4' },
      { name: 'X-Tenant-ID', isDynamic: false, value: 'org-openheaders' },
    ];
    expect(areHeaderModificationsEqual(headers, [...headers])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEnvironmentVariableDuplicate
// ---------------------------------------------------------------------------
describe('isEnvironmentVariableDuplicate', () => {
  it('returns false for empty varName', () => {
    expect(isEnvironmentVariableDuplicate('', 'Production', {})).toBe(false);
  });

  it('returns false for empty envName', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', '', {})).toBe(false);
  });

  it('returns false for null environments', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', 'Production', null)).toBe(false);
  });

  it('returns false if environment does not exist', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', 'Staging', { Production: {} })).toBe(false);
  });

  it('returns false if variable is not defined in environment', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', 'Production', { Production: {} })).toBe(false);
  });

  it('returns false for empty string value (schema placeholder)', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', 'Production', { Production: { API_KEY: '' } })).toBe(false);
  });

  it('returns false for undefined value', () => {
    expect(isEnvironmentVariableDuplicate('API_KEY', 'Production', { Production: { API_KEY: undefined } })).toBe(false);
  });

  it('returns true for existing non-empty string value', () => {
    expect(
      isEnvironmentVariableDuplicate('API_KEY', 'Production', {
        Production: { API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' },
      }),
    ).toBe(true);
  });

  it('handles object-form variables with enterprise JWT value', () => {
    expect(
      isEnvironmentVariableDuplicate('BEARER_TOKEN', 'Production', {
        Production: { BEARER_TOKEN: { value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig' } },
      }),
    ).toBe(true);
  });

  it('returns false for object-form variable with empty value (schema placeholder)', () => {
    expect(
      isEnvironmentVariableDuplicate('OAUTH2_CLIENT_SECRET', 'Production', {
        Production: { OAUTH2_CLIENT_SECRET: { value: '' } },
      }),
    ).toBe(false);
  });

  it('returns false for object-form variable with null value', () => {
    expect(
      isEnvironmentVariableDuplicate('API_KEY', 'Staging', {
        Staging: { API_KEY: { value: null } },
      }),
    ).toBe(false);
  });

  it('checks the correct environment (not all)', () => {
    expect(
      isEnvironmentVariableDuplicate('API_KEY', 'Staging', {
        Production: { API_KEY: 'filled' },
        Staging: { API_KEY: '' }, // schema placeholder
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWorkspaceNameDuplicate
// ---------------------------------------------------------------------------
describe('isWorkspaceNameDuplicate', () => {
  it('returns false for falsy name', () => {
    expect(isWorkspaceNameDuplicate('', [{ name: '' }])).toBe(false);
  });

  it('returns false for non-array existing', () => {
    expect(isWorkspaceNameDuplicate('ws', null as never)).toBe(false);
  });

  it('detects matching enterprise workspace name', () => {
    expect(
      isWorkspaceNameDuplicate('OpenHeaders — Production', [
        { name: 'OpenHeaders — Staging' },
        { name: 'OpenHeaders — Production' },
      ]),
    ).toBe(true);
  });

  it('returns false when no match', () => {
    expect(
      isWorkspaceNameDuplicate('OpenHeaders — QA', [
        { name: 'OpenHeaders — Production' },
        { name: 'OpenHeaders — Staging' },
      ]),
    ).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isWorkspaceNameDuplicate('openheaders', [{ name: 'OpenHeaders' }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueName
// ---------------------------------------------------------------------------
describe('generateUniqueName', () => {
  it('returns baseName when not taken', () => {
    expect(generateUniqueName('OpenHeaders Config', ['Other Config'])).toBe('OpenHeaders Config');
  });

  it('appends (Copy) for first duplicate', () => {
    expect(generateUniqueName('OpenHeaders Config', ['OpenHeaders Config'])).toBe('OpenHeaders Config (Copy)');
  });

  it('increments counter for further duplicates', () => {
    expect(generateUniqueName('Config', ['Config', 'Config (Copy)'])).toBe('Config (Copy 2)');
  });

  it('keeps incrementing past multiple collisions', () => {
    expect(generateUniqueName('A', ['A', 'A (Copy)', 'A (Copy 2)', 'A (Copy 3)'])).toBe('A (Copy 4)');
  });

  it('respects custom suffix', () => {
    expect(generateUniqueName('Config', ['Config'], 'Import')).toBe('Config (Import)');
  });

  it('handles enterprise workspace names with special characters', () => {
    const name = 'OpenHeaders — Production';
    expect(generateUniqueName(name, [name])).toBe('OpenHeaders — Production (Copy)');
  });
});

// ---------------------------------------------------------------------------
// createDuplicateDetector
// ---------------------------------------------------------------------------
describe('createDuplicateDetector', () => {
  it('creates detector for sources', () => {
    const detect = createDuplicateDetector('sources');
    const source = makeEnterpriseFileSource();
    expect(detect(source as never, [makeEnterpriseFileSource()] as never)).toBe(true);
    expect(detect(source as never, [] as never)).toBe(false);
  });

  it('creates detector for proxyRules', () => {
    const detect = createDuplicateDetector('proxyRules');
    const rule = {
      id: 'pr-1',
      headerName: 'Authorization',
      headerValue: 'Bearer token',
      domains: ['*.openheaders.io'],
    };
    expect(detect(rule as never, [{ ...rule }] as never)).toBe(true);
  });

  it('creates detector for rules', () => {
    const detect = createDuplicateDetector('rules');
    expect(detect({ id: 'rule-a1b2c3d4' } as never, [{ id: 'rule-a1b2c3d4' }] as never)).toBe(true);
  });

  it('returns a no-op detector for unknown types', () => {
    const detect = createDuplicateDetector('unknown');
    expect(detect({ id: 'r1' } as never, [{ id: 'r1' }] as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// batchDuplicateDetection
// ---------------------------------------------------------------------------
describe('batchDuplicateDetection', () => {
  it('returns results for each item with correct shape', async () => {
    const items = [makeEnterpriseFileSource('/path/a'), makeEnterpriseFileSource('/path/b')];
    const existing = [makeEnterpriseFileSource('/path/a')];
    const detector = createDuplicateDetector('sources');

    const results = await batchDuplicateDetection(
      items,
      existing,
      detector as (item: ImportSource, existing: ImportSource[]) => boolean,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ item: items[0], isDuplicate: true });
    expect(results[1]).toEqual({ item: items[1], isDuplicate: false });
  });

  it('handles empty input', async () => {
    const results = await batchDuplicateDetection([], [], () => false);
    expect(results).toEqual([]);
  });

  it('processes large dataset in batches without error', async () => {
    const items = Array.from({ length: 120 }, (_, i) =>
      makeImportSource({
        sourceType: 'file',
        sourcePath: `/Users/jane.doe/Documents/OpenHeaders/file-${i}.json`,
      }),
    );
    const existing = [
      makeImportSource({ sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/file-0.json' }),
    ];
    const detector = createDuplicateDetector('sources');

    const results = await batchDuplicateDetection(
      items,
      existing,
      detector as (item: ImportSource, existing: ImportSource[]) => boolean,
      25,
    );
    expect(results).toHaveLength(120);
    expect(results[0].isDuplicate).toBe(true);
    expect(results[1].isDuplicate).toBe(false);
    expect(results[119].isDuplicate).toBe(false);
  });

  it('respects custom batch size', async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeImportSource({
        sourceType: 'http',
        sourcePath: `https://api.openheaders.io/source-${i}`,
      }),
    );
    const results = await batchDuplicateDetection(items, [], () => false, 3);
    expect(results).toHaveLength(10);
    // All should be non-duplicates since existing is empty
    expect(results.every((r) => r.isDuplicate === false)).toBe(true);
  });
});
