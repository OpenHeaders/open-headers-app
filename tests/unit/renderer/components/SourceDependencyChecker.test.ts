import { describe, it, expect } from 'vitest';
import {
  checkSourceDependencies,
  isTemplateSource,
} from '../../../../src/renderer/components/sources/source-table/SourceDependencyChecker';

// ======================================================================
// checkSourceDependencies
// ======================================================================
describe('checkSourceDependencies', () => {
  it('returns empty array for source with no vars', () => {
    const source = { sourceType: 'file', sourcePath: '/path/to/file' };
    expect(checkSourceDependencies(source, {})).toEqual([]);
  });

  it('detects missing environment variable', () => {
    const source = { sourceType: 'http', sourcePath: 'https://{{HOST}}/api' };
    const result = checkSourceDependencies(source, {});
    expect(result).toContain('env:HOST');
  });

  it('does not flag existing environment variable', () => {
    const source = { sourceType: 'http', sourcePath: 'https://{{HOST}}/api' };
    const result = checkSourceDependencies(source, { HOST: 'example.com' });
    expect(result).not.toContain('env:HOST');
  });

  it('detects multiple missing variables', () => {
    const source = { sourcePath: '{{A}}', requestOptions: { headers: [{ value: '{{B}}' }] } };
    const result = checkSourceDependencies(source, {});
    expect(result).toContain('env:A');
    expect(result).toContain('env:B');
  });

  it('removes duplicate missing deps', () => {
    const source = { url: '{{X}}', path: '{{X}}' };
    const result = checkSourceDependencies(source, {});
    expect(result.filter(d => d === 'env:X').length).toBe(1);
  });

  it('detects TOTP dependency when secret is missing', () => {
    const source = {
      sourcePath: 'https://api/[[TOTP_CODE]]',
      requestOptions: { totpSecret: '' },
    };
    const result = checkSourceDependencies(source, {});
    expect(result).toContain('totp:secret');
  });

  it('does not flag TOTP when secret is present', () => {
    const source = {
      sourcePath: 'https://api/[[TOTP_CODE]]',
      requestOptions: { totpSecret: 'JBSWY3DPEHPK3PXP' },
    };
    const result = checkSourceDependencies(source, {});
    expect(result).not.toContain('totp:secret');
  });

  it('detects TOTP dependency when requestOptions missing', () => {
    const source = { sourcePath: 'https://api/[[TOTP_CODE]]' };
    const result = checkSourceDependencies(source, {});
    expect(result).toContain('totp:secret');
  });
});

// ======================================================================
// isTemplateSource
// ======================================================================
describe('isTemplateSource', () => {
  it('returns false for non-http source', () => {
    expect(isTemplateSource({ sourceType: 'file', sourcePath: '{{X}}' })).toBe(false);
  });

  it('returns false for http source without templates', () => {
    expect(isTemplateSource({ sourceType: 'http', sourcePath: 'https://api.com' })).toBe(false);
  });

  it('returns true for http source with env var', () => {
    expect(isTemplateSource({ sourceType: 'http', sourcePath: '{{HOST}}' })).toBe(true);
  });

  it('returns true when templates are in nested fields', () => {
    const source = {
      sourceType: 'http',
      requestOptions: { headers: [{ value: '{{TOKEN}}' }] },
    };
    expect(isTemplateSource(source)).toBe(true);
  });
});
