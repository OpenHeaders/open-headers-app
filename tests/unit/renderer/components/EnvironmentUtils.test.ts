import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  checkMissingVariables,
  generateUniqueEnvironmentName,
  sourceUsesVariables,
  getSourcesUsingVariables,
  formatVariableUsage,
} from '../../../../src/renderer/components/features/environments/EnvironmentUtils';
import type { Source } from '../../../../src/types/source';

function makeSource(overrides: Partial<Source> = {}): Source {
  return { sourceId: 'test', sourceType: 'http', ...overrides };
}

// ======================================================================
// extractVariables
// ======================================================================
describe('extractVariables', () => {
  it('returns empty for text without variables', () => {
    expect(extractVariables('plain text')).toEqual([]);
  });

  it('extracts single variable', () => {
    expect(extractVariables('{{API_KEY}}')).toEqual(['API_KEY']);
  });

  it('extracts multiple variables', () => {
    expect(extractVariables('{{HOST}}/{{PATH}}')).toEqual(['HOST', 'PATH']);
  });

  it('returns empty for empty string', () => {
    expect(extractVariables('')).toEqual([]);
  });
});

// ======================================================================
// checkMissingVariables
// ======================================================================
describe('checkMissingVariables', () => {
  it('returns empty when all variables exist', () => {
    const sources = [makeSource({ sourcePath: '{{HOST}}/api' })];
    expect(checkMissingVariables(sources, { HOST: { value: 'example.com', isSecret: false } })).toEqual([]);
  });

  it('detects missing URL variable', () => {
    const sources = [makeSource({ sourcePath: '{{HOST}}/api' })];
    expect(checkMissingVariables(sources, {})).toContain('HOST');
  });

  it('detects missing header variable', () => {
    const sources = [makeSource({
      sourcePath: 'https://api.com',
      requestOptions: { headers: [{ key: 'auth', value: '{{TOKEN}}' }] },
    })];
    expect(checkMissingVariables(sources, {})).toContain('TOKEN');
  });

  it('detects missing body variable', () => {
    const sources = [makeSource({
      sourcePath: 'https://api.com',
      requestOptions: { body: '{{BODY_VAR}}' },
    })];
    expect(checkMissingVariables(sources, {})).toContain('BODY_VAR');
  });

  it('detects missing totpSecret variable', () => {
    const sources = [makeSource({
      sourcePath: 'https://api.com',
      requestOptions: { totpSecret: '{{TOTP_KEY}}' },
    })];
    expect(checkMissingVariables(sources, {})).toContain('TOTP_KEY');
  });

  it('detects missing query param variable', () => {
    const sources = [makeSource({
      sourcePath: 'https://api.com',
      requestOptions: { queryParams: [{ key: 'q', value: '{{Q_VAR}}' }] },
    })];
    expect(checkMissingVariables(sources, {})).toContain('Q_VAR');
  });

  it('detects missing JSON filter path variable', () => {
    const sources = [makeSource({
      sourcePath: 'https://api.com',
      jsonFilter: { enabled: true, path: '{{FILTER_PATH}}' },
    })];
    expect(checkMissingVariables(sources, {})).toContain('FILTER_PATH');
  });

  it('skips non-http sources', () => {
    const sources = [makeSource({ sourceType: 'file', sourcePath: '{{HOST}}' })];
    expect(checkMissingVariables(sources, {})).toEqual([]);
  });

  it('returns unique missing vars', () => {
    const sources = [
      makeSource({ sourcePath: '{{X}}' }),
      makeSource({ sourcePath: '{{X}}' }),
    ];
    const result = checkMissingVariables(sources, {});
    expect(result.filter(v => v === 'X').length).toBe(1);
  });

  it('checks rules for env vars', () => {
    const rules = {
      header: [{ hasEnvVars: true, envVars: ['RULE_VAR'] }],
    } as Parameters<typeof checkMissingVariables>[2];
    const result = checkMissingVariables([], {}, rules);
    expect(result).toContain('RULE_VAR');
  });

  it('does not flag rule var that exists', () => {
    const rules = {
      header: [{ hasEnvVars: true, envVars: ['RULE_VAR'] }],
    } as Parameters<typeof checkMissingVariables>[2];
    const result = checkMissingVariables([], { RULE_VAR: { value: 'val', isSecret: false } }, rules);
    expect(result).not.toContain('RULE_VAR');
  });
});

// ======================================================================
// generateUniqueEnvironmentName
// ======================================================================
describe('generateUniqueEnvironmentName', () => {
  it('appends -copy for first duplicate', () => {
    expect(generateUniqueEnvironmentName('prod', {})).toBe('prod-copy');
  });

  it('appends counter when copy exists', () => {
    expect(generateUniqueEnvironmentName('prod', { 'prod-copy': {} })).toBe('prod-copy-1');
  });

  it('increments counter', () => {
    const existing = { 'prod-copy': {}, 'prod-copy-1': {} };
    expect(generateUniqueEnvironmentName('prod', existing)).toBe('prod-copy-2');
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
    expect(sourceUsesVariables(makeSource({ sourcePath: 'https://api.com' }))).toBe(false);
  });

  it('returns true for source with variables', () => {
    expect(sourceUsesVariables(makeSource({ sourcePath: '{{HOST}}' }))).toBe(true);
  });

  it('detects variables in nested fields', () => {
    expect(sourceUsesVariables(makeSource({ requestOptions: { headers: [{ key: 'auth', value: '{{TOKEN}}' }] } }))).toBe(true);
  });
});

// ======================================================================
// getSourcesUsingVariables
// ======================================================================
describe('getSourcesUsingVariables', () => {
  it('returns empty for empty array', () => {
    expect(getSourcesUsingVariables([])).toEqual([]);
  });

  it('filters sources using variables', () => {
    const sources = [
      makeSource({ sourcePath: '{{HOST}}' }),
      makeSource({ sourcePath: 'https://api.com' }),
      makeSource({ requestOptions: { body: '{{BODY}}' } }),
    ];
    const result = getSourcesUsingVariables(sources);
    expect(result.length).toBe(2);
  });
});

// ======================================================================
// formatVariableUsage
// ======================================================================
describe('formatVariableUsage', () => {
  it('returns empty for empty sourceIds', () => {
    expect(formatVariableUsage('VAR', [], [])).toEqual([]);
  });

  it('formats regular source', () => {
    const sources = [makeSource({ sourceId: 's1', sourceName: 'My Source' })];
    const result = formatVariableUsage('VAR', ['s1'], sources);
    expect(result[0].sourceId).toBe('s1');
    expect(result[0].sourceName).toBe('My Source');
    expect(result[0].isRule).toBe(false);
  });

  it('formats rule identifier', () => {
    const rules = { header: [{ id: '42', headerName: 'X-Custom' }] } as Parameters<typeof formatVariableUsage>[3];
    const result = formatVariableUsage('VAR', ['rule-42'], [], rules);
    expect(result[0].isRule).toBe(true);
    expect(result[0].sourceName).toBe('X-Custom');
  });

  it('uses fallback name for unknown rule', () => {
    const result = formatVariableUsage('VAR', ['rule-99'], [], { header: [] });
    expect(result[0].isRule).toBe(true);
    expect(result[0].sourceName).toContain('Rule');
  });

  it('uses fallback name for unknown source', () => {
    const result = formatVariableUsage('VAR', ['unknown-id'], []);
    expect(result[0].sourceName).toContain('Source unknown-id');
  });
});
