import { describe, it, expect } from 'vitest';
import type { Source } from '../../../../src/types/source';

type ImportSource = Pick<Source, 'sourceType' | 'sourcePath'>;

function makeImportSource(overrides: Partial<ImportSource> & { sourceType: Source['sourceType'] }): ImportSource {
  return { sourcePath: '', ...overrides };
}

import {
  isSourceDuplicate,
  isProxyRuleDuplicate,
  areHeadersEqual,
  isRuleDuplicate,
  areRulesContentEqual,
  areHeaderModificationsEqual,
  isEnvironmentVariableDuplicate,
  isWorkspaceNameDuplicate,
  generateUniqueName,
  createDuplicateDetector,
  batchDuplicateDetection,
} from '../../../../src/renderer/services/export-import/utilities/DuplicateDetection';

// ---------------------------------------------------------------------------
// isSourceDuplicate
// ---------------------------------------------------------------------------
describe('isSourceDuplicate', () => {
  it('returns false for null source', () => {
    expect(isSourceDuplicate(null, [])).toBe(false);
  });

  it('detects file source duplicate by sourcePath', () => {
    const source = makeImportSource({ sourceType: 'file', sourcePath: '/tmp/a.json' });
    const existing = [makeImportSource({ sourceType: 'file', sourcePath: '/tmp/a.json' })];
    expect(isSourceDuplicate(source, existing)).toBe(true);
  });

  it('does not flag different file sources', () => {
    const source = makeImportSource({ sourceType: 'file', sourcePath: '/tmp/b.json' });
    const existing = [makeImportSource({ sourceType: 'file', sourcePath: '/tmp/a.json' })];
    expect(isSourceDuplicate(source, existing)).toBe(false);
  });

  it('does not match sources with different types', () => {
    const source = makeImportSource({ sourceType: 'file', sourcePath: '/tmp/a.json' });
    const existing = [makeImportSource({ sourceType: 'env', sourcePath: '/tmp/a.json' })];
    expect(isSourceDuplicate(source, existing)).toBe(false);
  });

  it('detects env source duplicate by sourcePath', () => {
    const source = makeImportSource({ sourceType: 'env', sourcePath: 'MY_VAR' });
    const existing = [makeImportSource({ sourceType: 'env', sourcePath: 'MY_VAR' })];
    expect(isSourceDuplicate(source, existing)).toBe(true);
  });

  it('detects http source duplicate by url and sourcePath', () => {
    const source = makeImportSource({ sourceType: 'http', sourcePath: 'https://a.com' });
    const existing = [makeImportSource({ sourceType: 'http', sourcePath: 'https://a.com' })];
    expect(isSourceDuplicate(source, existing)).toBe(true);
  });

  it('http source with different url is not duplicate', () => {
    const source = makeImportSource({ sourceType: 'http', sourcePath: 'https://b.com' });
    const existing = [makeImportSource({ sourceType: 'http', sourcePath: 'https://a.com' })];
    expect(isSourceDuplicate(source, existing)).toBe(false);
  });

  it('handles unknown source type by comparing sourcePath', () => {
    // Intentionally using non-standard sourceType to test fallback
    const source = { sourceType: 'custom' as Source['sourceType'], sourcePath: '/x' };
    const existing = [{ sourceType: 'custom' as Source['sourceType'], sourcePath: '/x' }];
    expect(isSourceDuplicate(source, existing)).toBe(true);
  });

  it('returns false for empty existing list', () => {
    const source = makeImportSource({ sourceType: 'file', sourcePath: '/a' });
    expect(isSourceDuplicate(source, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areHeadersEqual
// ---------------------------------------------------------------------------
describe('areHeadersEqual', () => {
  it('returns true for identical static headers', () => {
    const h1 = { name: 'X-Key', isDynamic: false, value: 'abc' };
    const h2 = { name: 'X-Key', isDynamic: false, value: 'abc' };
    expect(areHeadersEqual(h1, h2)).toBe(true);
  });

  it('returns false for different header names', () => {
    const h1 = { name: 'X-Key', isDynamic: false, value: 'abc' };
    const h2 = { name: 'X-Other', isDynamic: false, value: 'abc' };
    expect(areHeadersEqual(h1, h2)).toBe(false);
  });

  it('returns false when isDynamic differs', () => {
    const h1 = { name: 'X-Key', isDynamic: false, value: 'abc' };
    const h2 = { name: 'X-Key', isDynamic: true, sourceId: 's1' };
    expect(areHeadersEqual(h1, h2)).toBe(false);
  });

  it('returns false for different static values', () => {
    const h1 = { name: 'X-Key', isDynamic: false, value: 'abc' };
    const h2 = { name: 'X-Key', isDynamic: false, value: 'xyz' };
    expect(areHeadersEqual(h1, h2)).toBe(false);
  });

  it('returns true for identical dynamic headers', () => {
    const h1 = { name: 'Auth', isDynamic: true, sourceId: 's1', prefix: 'Bearer ', suffix: '' };
    const h2 = { name: 'Auth', isDynamic: true, sourceId: 's1', prefix: 'Bearer ', suffix: '' };
    expect(areHeadersEqual(h1, h2)).toBe(true);
  });

  it('treats undefined prefix/suffix as empty string for dynamic headers', () => {
    const h1 = { name: 'Auth', isDynamic: true, sourceId: 's1' };
    const h2 = { name: 'Auth', isDynamic: true, sourceId: 's1', prefix: '', suffix: '' };
    expect(areHeadersEqual(h1, h2)).toBe(true);
  });

  it('returns false for different sourceId in dynamic headers', () => {
    const h1 = { name: 'Auth', isDynamic: true, sourceId: 's1' };
    const h2 = { name: 'Auth', isDynamic: true, sourceId: 's2' };
    expect(areHeadersEqual(h1, h2)).toBe(false);
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
    const rule = { id: 'rule-1', headerName: 'X-Key', headerValue: 'v1', domains: ['*.example.com'] };
    const existing = [{ id: 'rule-1', headerName: 'X-Key', headerValue: 'v1', domains: ['*.example.com'] }];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(true);
  });

  it('detects duplicate by header name, value, and domains', () => {
    const rule = { id: 'rule-new', headerName: 'X-Key', headerValue: 'v1', domains: ['*.example.com'] };
    const existing = [{ id: 'rule-old', headerName: 'X-Key', headerValue: 'v1', domains: ['*.example.com'] }];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(true);
  });

  it('does not match rules with different header names', () => {
    const rule = { id: '1', headerName: 'X-A', headerValue: 'v1' };
    const existing = [{ id: '2', headerName: 'X-B', headerValue: 'v1' }];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(false);
  });

  it('does not match rules with different domains', () => {
    const rule = { id: '1', headerName: 'X-Key', headerValue: 'v1', domains: ['a.com'] };
    const existing = [{ id: '2', headerName: 'X-Key', headerValue: 'v1', domains: ['b.com'] }];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(false);
  });

  it('matches rules with same headers and no domains', () => {
    const rule = { id: '1', headerName: 'X-Key', headerValue: 'v1' };
    const existing = [{ id: '2', headerName: 'X-Key', headerValue: 'v1' }];
    expect(isProxyRuleDuplicate(rule, existing)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isRuleDuplicate / areRulesContentEqual
// ---------------------------------------------------------------------------
describe('isRuleDuplicate', () => {
  it('returns false for null rule', () => {
    expect(isRuleDuplicate(null, [])).toBe(false);
  });

  it('detects duplicate by id', () => {
    expect(isRuleDuplicate({ id: 'r1' }, [{ id: 'r1' }])).toBe(true);
  });

  it('does not match different ids', () => {
    expect(isRuleDuplicate({ id: 'r1' }, [{ id: 'r2' }])).toBe(false);
  });

  it('falls back to content comparison when no id', () => {
    const rule = { name: 'Rule', enabled: true, pattern: '*.com', action: 'block' };
    const existing = [{ name: 'Rule', enabled: true, pattern: '*.com', action: 'block' }];
    expect(isRuleDuplicate(rule, existing)).toBe(true);
  });

  it('content comparison detects different names', () => {
    const rule = { name: 'A', enabled: true, pattern: '*.com', action: 'block' };
    const existing = [{ name: 'B', enabled: true, pattern: '*.com', action: 'block' }];
    expect(isRuleDuplicate(rule, existing)).toBe(false);
  });
});

describe('areRulesContentEqual', () => {
  it('returns false for different actions', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'block' };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'redirect' };
    expect(areRulesContentEqual(r1, r2)).toBe(false);
  });

  it('compares redirect URLs', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'redirect', redirectUrl: 'http://a' };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'redirect', redirectUrl: 'http://a' };
    expect(areRulesContentEqual(r1, r2)).toBe(true);
  });

  it('compares redirect URLs - different', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'redirect', redirectUrl: 'http://a' };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'redirect', redirectUrl: 'http://b' };
    expect(areRulesContentEqual(r1, r2)).toBe(false);
  });

  it('compares payloads for modify-payload', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'modify-payload', payload: '{}' };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'modify-payload', payload: '{}' };
    expect(areRulesContentEqual(r1, r2)).toBe(true);
  });

  it('block rules with same basics are equal', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'block' };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'block' };
    expect(areRulesContentEqual(r1, r2)).toBe(true);
  });

  it('modify-headers compares headers', () => {
    const headers = [{ name: 'X-Key', isDynamic: false, value: 'v1' }];
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'modify-headers', headers };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'modify-headers', headers: [...headers] };
    expect(areRulesContentEqual(r1, r2)).toBe(true);
  });

  it('unknown action falls back to JSON comparison', () => {
    const r1 = { name: 'R', enabled: true, pattern: '*', action: 'custom', x: 1 };
    const r2 = { name: 'R', enabled: true, pattern: '*', action: 'custom', x: 1 };
    expect(areRulesContentEqual(r1, r2)).toBe(true);
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
    const a = [{ name: 'A', isDynamic: false, value: '1' }];
    const b: Array<{ name: string; isDynamic: boolean; value: string }> = [];
    expect(areHeaderModificationsEqual(a, b)).toBe(false);
  });

  it('sorts by name for comparison', () => {
    const a = [
      { name: 'B', isDynamic: false, value: '2' },
      { name: 'A', isDynamic: false, value: '1' },
    ];
    const b = [
      { name: 'A', isDynamic: false, value: '1' },
      { name: 'B', isDynamic: false, value: '2' },
    ];
    expect(areHeaderModificationsEqual(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEnvironmentVariableDuplicate
// ---------------------------------------------------------------------------
describe('isEnvironmentVariableDuplicate', () => {
  it('returns false for falsy inputs', () => {
    expect(isEnvironmentVariableDuplicate('', 'dev', {})).toBe(false);
    expect(isEnvironmentVariableDuplicate('VAR', '', {})).toBe(false);
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', null)).toBe(false);
  });

  it('returns false if environment does not exist', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { prod: {} })).toBe(false);
  });

  it('returns false if variable is not defined', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: {} })).toBe(false);
  });

  it('returns false for empty string value (schema placeholder)', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: { VAR: '' } })).toBe(false);
  });

  it('returns false for undefined value', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: { VAR: undefined } })).toBe(false);
  });

  it('returns true for existing non-empty string value', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: { VAR: 'hello' } })).toBe(true);
  });

  it('handles object-form variables', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: { VAR: { value: 'x' } } })).toBe(true);
  });

  it('returns false for object-form variable with empty value', () => {
    expect(isEnvironmentVariableDuplicate('VAR', 'dev', { dev: { VAR: { value: '' } } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWorkspaceNameDuplicate
// ---------------------------------------------------------------------------
describe('isWorkspaceNameDuplicate', () => {
  it('returns false for falsy name', () => {
    expect(isWorkspaceNameDuplicate('', [{ name: '' }])).toBe(false);
  });

  it('detects matching name', () => {
    expect(isWorkspaceNameDuplicate('ws', [{ name: 'ws' }])).toBe(true);
  });

  it('returns false when no match', () => {
    expect(isWorkspaceNameDuplicate('ws', [{ name: 'other' }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueName
// ---------------------------------------------------------------------------
describe('generateUniqueName', () => {
  it('returns baseName when not taken', () => {
    expect(generateUniqueName('Config', ['Other'])).toBe('Config');
  });

  it('appends (Copy) for first duplicate', () => {
    expect(generateUniqueName('Config', ['Config'])).toBe('Config (Copy)');
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
});

// ---------------------------------------------------------------------------
// createDuplicateDetector
// ---------------------------------------------------------------------------
describe('createDuplicateDetector', () => {
  it('creates detector for sources', () => {
    const detect = createDuplicateDetector('sources');
    const source = makeImportSource({ sourceType: 'file', sourcePath: '/a' });
    expect(detect(source as never, [makeImportSource({ sourceType: 'file', sourcePath: '/a' })] as never)).toBe(true);
    expect(detect(source as never, [] as never)).toBe(false);
  });

  it('creates detector for proxyRules', () => {
    const detect = createDuplicateDetector('proxyRules');
    const rule = { pattern: '*.com', headers: null };
    expect(detect(rule as never, [{ pattern: '*.com', headers: null }] as never)).toBe(true);
  });

  it('creates detector for rules', () => {
    const detect = createDuplicateDetector('rules');
    expect(detect({ id: 'r1' } as never, [{ id: 'r1' }] as never)).toBe(true);
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
  it('returns results for each item', async () => {
    const items = [
      makeImportSource({ sourceType: 'file', sourcePath: '/a' }),
      makeImportSource({ sourceType: 'file', sourcePath: '/b' }),
    ];
    const existing = [makeImportSource({ sourceType: 'file', sourcePath: '/a' })];
    const detector = createDuplicateDetector('sources');

    const results = await batchDuplicateDetection(items, existing, detector as (item: ImportSource, existing: ImportSource[]) => boolean);
    expect(results).toHaveLength(2);
    expect(results[0].isDuplicate).toBe(true);
    expect(results[1].isDuplicate).toBe(false);
  });

  it('handles empty input', async () => {
    const results = await batchDuplicateDetection([], [], () => false);
    expect(results).toHaveLength(0);
  });

  it('processes in batches without error', async () => {
    const items = Array.from({ length: 120 }, (_, i) => makeImportSource({
      sourceType: 'file',
      sourcePath: `/file-${i}`,
    }));
    const existing = [makeImportSource({ sourceType: 'file', sourcePath: '/file-0' })];
    const detector = createDuplicateDetector('sources');

    const results = await batchDuplicateDetection(items, existing, detector as (item: ImportSource, existing: ImportSource[]) => boolean, 25);
    expect(results).toHaveLength(120);
    expect(results[0].isDuplicate).toBe(true);
    expect(results[1].isDuplicate).toBe(false);
  });
});
