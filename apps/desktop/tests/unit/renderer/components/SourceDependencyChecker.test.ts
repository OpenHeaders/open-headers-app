import { describe, it, expect } from 'vitest';
import {
  checkSourceDependencies,
  isTemplateSource,
} from '../../../../src/renderer/components/sources/source-table/SourceDependencyChecker';
import type { Source } from '../../../../src/types/source';

function makeSource(overrides: Partial<Source> = {}): Source {
  return { sourceId: 'test', sourceType: 'http', ...overrides };
}

// ======================================================================
// checkSourceDependencies
// ======================================================================
describe('checkSourceDependencies', () => {
  it('returns empty array for source with no vars', () => {
    expect(checkSourceDependencies(makeSource({ sourceType: 'file', sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json' }), {})).toEqual([]);
  });

  it('detects missing environment variable', () => {
    const result = checkSourceDependencies(makeSource({ sourcePath: 'https://{{HOST}}/api' }), {});
    expect(result).toContain('env:HOST');
  });

  it('does not flag existing environment variable', () => {
    const result = checkSourceDependencies(makeSource({ sourcePath: 'https://{{HOST}}/api' }), { HOST: 'auth.openheaders.io' });
    expect(result).not.toContain('env:HOST');
  });

  it('detects multiple missing variables', () => {
    const result = checkSourceDependencies(makeSource({ sourcePath: '{{A}}', requestOptions: { headers: [{ key: 'h', value: '{{B}}' }] } }), {});
    expect(result).toContain('env:A');
    expect(result).toContain('env:B');
  });

  it('removes duplicate missing deps', () => {
    const result = checkSourceDependencies(makeSource({ sourcePath: '{{X}}' }), {});
    expect(result.filter(d => d === 'env:X').length).toBe(1);
  });

  it('detects TOTP dependency when secret is missing', () => {
    const result = checkSourceDependencies(makeSource({
      sourcePath: 'https://api/[[TOTP_CODE]]',
      requestOptions: { totpSecret: '' },
    }), {});
    expect(result).toContain('totp:secret');
  });

  it('does not flag TOTP when secret is present', () => {
    const result = checkSourceDependencies(makeSource({
      sourcePath: 'https://api/[[TOTP_CODE]]',
      requestOptions: { totpSecret: 'JBSWY3DPEHPK3PXP' },
    }), {});
    expect(result).not.toContain('totp:secret');
  });

  it('detects TOTP dependency when requestOptions missing', () => {
    const result = checkSourceDependencies(makeSource({ sourcePath: 'https://api/[[TOTP_CODE]]' }), {});
    expect(result).toContain('totp:secret');
  });
});

// ======================================================================
// isTemplateSource
// ======================================================================
describe('isTemplateSource', () => {
  it('returns false for non-http source', () => {
    expect(isTemplateSource(makeSource({ sourceType: 'file', sourcePath: '{{X}}' }))).toBe(false);
  });

  it('returns false for http source without templates', () => {
    expect(isTemplateSource(makeSource({ sourcePath: 'https://api.openheaders.io' }))).toBe(false);
  });

  it('returns true for http source with env var', () => {
    expect(isTemplateSource(makeSource({ sourcePath: '{{HOST}}' }))).toBe(true);
  });

  it('returns true when templates are in nested fields', () => {
    expect(isTemplateSource(makeSource({
      requestOptions: { headers: [{ key: 'auth', value: '{{TOKEN}}' }] },
    }))).toBe(true);
  });
});
