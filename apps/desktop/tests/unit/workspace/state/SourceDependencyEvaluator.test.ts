import type { Source } from '@openheaders/core';
import { describe, expect, it, vi } from 'vitest';
import {
  activateReadySources,
  evaluateAllSourceDependencies,
  evaluateSourceDependencies,
  extractVariablesFromSource,
} from '@/services/workspace/state/SourceDependencyEvaluator';
import type { EnvironmentResolverLike } from '@/services/workspace/state/types';

function httpSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: '1',
    sourceType: 'http',
    sourcePath: 'https://api.openheaders.io/data',
    ...overrides,
  };
}

function envResolver(vars: Record<string, string> = {}): EnvironmentResolverLike {
  return {
    loadEnvironmentVariables: () => vars,
    resolveTemplate: vi.fn(),
    setVariables: vi.fn(),
    clearVariableCache: vi.fn(),
  };
}

describe('extractVariablesFromSource', () => {
  it('returns empty array for source with no template variables', () => {
    const source = httpSource({ sourcePath: 'https://api.openheaders.io/data' });
    expect(extractVariablesFromSource(source)).toEqual([]);
  });

  it('extracts variables from sourcePath', () => {
    const source = httpSource({ sourcePath: 'https://{{HOST}}/api/{{VERSION}}' });
    expect(extractVariablesFromSource(source)).toEqual(expect.arrayContaining(['HOST', 'VERSION']));
  });

  it('extracts variables from requestOptions body', () => {
    const source = httpSource({
      requestOptions: { body: '{"token":"{{API_TOKEN}}"}' } as Source['requestOptions'],
    });
    expect(extractVariablesFromSource(source)).toContain('API_TOKEN');
  });

  it('extracts variables from requestOptions headers', () => {
    const source = httpSource({
      requestOptions: {
        headers: [
          { key: 'Authorization', value: 'Bearer {{AUTH_TOKEN}}' },
          { key: '{{HEADER_NAME}}', value: 'static-value' },
        ],
      } as Source['requestOptions'],
    });
    const vars = extractVariablesFromSource(source);
    expect(vars).toContain('AUTH_TOKEN');
    expect(vars).toContain('HEADER_NAME');
  });

  it('extracts variables from requestOptions queryParams', () => {
    const source = httpSource({
      requestOptions: {
        queryParams: [{ key: 'env', value: '{{ENV_NAME}}' }],
      } as Source['requestOptions'],
    });
    expect(extractVariablesFromSource(source)).toContain('ENV_NAME');
  });

  it('extracts variables from jsonFilter path', () => {
    const source = httpSource({
      jsonFilter: { path: '$.data.{{FIELD}}', enabled: true },
    });
    expect(extractVariablesFromSource(source)).toContain('FIELD');
  });

  it('deduplicates repeated variable names', () => {
    const source = httpSource({
      sourcePath: 'https://{{HOST}}/{{HOST}}/{{HOST}}',
    });
    expect(extractVariablesFromSource(source)).toEqual(['HOST']);
  });

  it('returns empty for non-http sources', () => {
    const source: Source = { sourceId: '1', sourceType: 'file', sourcePath: '/tmp/{{FILE}}' };
    // extractVariablesFromSource still extracts — it doesn't check sourceType
    expect(extractVariablesFromSource(source)).toContain('FILE');
  });
});

describe('evaluateSourceDependencies', () => {
  it('returns ready=true for non-http sources', () => {
    const source: Source = { sourceId: '1', sourceType: 'file' };
    expect(evaluateSourceDependencies(source, null)).toEqual({ ready: true, missing: [] });
  });

  it('returns ready=true for http source with no variables', () => {
    const source = httpSource({ sourcePath: 'https://api.openheaders.io/data' });
    expect(evaluateSourceDependencies(source, null)).toEqual({ ready: true, missing: [] });
  });

  it('returns ready=true when all variables are resolved', () => {
    const source = httpSource({ sourcePath: 'https://{{HOST}}/api' });
    const resolver = envResolver({ HOST: 'api.openheaders.io' });
    expect(evaluateSourceDependencies(source, resolver)).toEqual({ ready: true, missing: [] });
  });

  it('returns ready=false with missing variables', () => {
    const source = httpSource({ sourcePath: 'https://{{HOST}}/{{VERSION}}' });
    const resolver = envResolver({ HOST: 'api.openheaders.io' });
    const result = evaluateSourceDependencies(source, resolver);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(['VERSION']);
  });

  it('treats empty string env var as missing', () => {
    const source = httpSource({ sourcePath: 'https://{{HOST}}/api' });
    const resolver = envResolver({ HOST: '' });
    expect(evaluateSourceDependencies(source, resolver).ready).toBe(false);
  });

  it('returns all missing when envResolver is null', () => {
    const source = httpSource({ sourcePath: 'https://{{HOST}}/api' });
    const result = evaluateSourceDependencies(source, null);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(['HOST']);
  });
});

describe('evaluateAllSourceDependencies', () => {
  it('marks http sources as active when all deps resolved', () => {
    const sources = [httpSource({ sourcePath: 'https://api.openheaders.io/data' })];
    const result = evaluateAllSourceDependencies(sources, null);
    expect(result[0].activationState).toBe('active');
    expect(result[0].missingDependencies).toEqual([]);
  });

  it('marks http sources as waiting_for_deps when deps missing', () => {
    const sources = [httpSource({ sourcePath: 'https://{{HOST}}/data' })];
    const result = evaluateAllSourceDependencies(sources, envResolver({}));
    expect(result[0].activationState).toBe('waiting_for_deps');
    expect(result[0].missingDependencies).toEqual(['HOST']);
  });

  it('marks file sources as active regardless', () => {
    const sources: Source[] = [{ sourceId: '1', sourceType: 'file', sourcePath: '/tmp/data.json' }];
    const result = evaluateAllSourceDependencies(sources, null);
    expect(result[0].activationState).toBe('active');
  });

  it('marks env sources as active regardless', () => {
    const sources: Source[] = [{ sourceId: '1', sourceType: 'env', sourcePath: 'MY_VAR' }];
    const result = evaluateAllSourceDependencies(sources, null);
    expect(result[0].activationState).toBe('active');
  });

  it('handles mixed source types correctly', () => {
    const sources: Source[] = [
      httpSource({ sourceId: '1', sourcePath: 'https://{{HOST}}/api' }),
      { sourceId: '2', sourceType: 'file', sourcePath: '/tmp/data.json' },
      httpSource({ sourceId: '3', sourcePath: 'https://api.openheaders.io/plain' }),
    ];
    const result = evaluateAllSourceDependencies(sources, envResolver({}));
    expect(result[0].activationState).toBe('waiting_for_deps');
    expect(result[1].activationState).toBe('active');
    expect(result[2].activationState).toBe('active');
  });
});

describe('activateReadySources', () => {
  it('activates sources whose deps are now resolved', () => {
    const sources: Source[] = [
      httpSource({
        sourceId: '1',
        sourcePath: 'https://{{HOST}}/api',
        activationState: 'waiting_for_deps',
        missingDependencies: ['HOST'],
      }),
    ];
    const resolver = envResolver({ HOST: 'api.openheaders.io' });
    const result = activateReadySources(sources, resolver);
    expect(result.activated).toBe(1);
    expect(result.hasChanges).toBe(true);
    expect(result.sources[0].activationState).toBe('active');
    expect(result.sources[0].missingDependencies).toEqual([]);
  });

  it('returns hasChanges=false when nothing changes', () => {
    const sources: Source[] = [
      httpSource({ sourceId: '1', sourcePath: 'https://api.openheaders.io/data', activationState: 'active' }),
    ];
    const result = activateReadySources(sources, null);
    expect(result.activated).toBe(0);
    expect(result.hasChanges).toBe(false);
  });

  it('updates missing dependencies list when deps change but not all resolved', () => {
    const sources: Source[] = [
      httpSource({
        sourceId: '1',
        sourcePath: 'https://{{HOST}}/{{VERSION}}',
        activationState: 'waiting_for_deps',
        missingDependencies: ['HOST', 'VERSION'],
      }),
    ];
    const resolver = envResolver({ HOST: 'api.openheaders.io' });
    const result = activateReadySources(sources, resolver);
    expect(result.activated).toBe(0);
    expect(result.hasChanges).toBe(true);
    expect(result.sources[0].missingDependencies).toEqual(['VERSION']);
  });

  it('does not re-evaluate sources already active', () => {
    const sources: Source[] = [
      httpSource({ sourceId: '1', sourcePath: 'https://{{HOST}}/api', activationState: 'active' }),
    ];
    const result = activateReadySources(sources, null);
    expect(result.activated).toBe(0);
    expect(result.hasChanges).toBe(false);
    // source is returned as-is (same reference)
    expect(result.sources[0]).toBe(sources[0]);
  });
});
