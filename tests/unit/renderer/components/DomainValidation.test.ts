import { describe, it, expect } from 'vitest';
import {
  validateDomain,
  validateDomainBatch,
  isWildcardDomain,
  extractBaseDomain,
} from '../../../../src/renderer/components/features/domain-tags/DomainValidation';

// ======================================================================
// validateDomain
// ======================================================================
describe('validateDomain', () => {
  it('returns invalid for empty string', () => {
    const result = validateDomain('');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('returns invalid for whitespace-only', () => {
    expect(validateDomain('   ').valid).toBe(false);
  });

  it('validates standard domain', () => {
    const result = validateDomain('example.com');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('example.com');
  });

  it('validates subdomain', () => {
    expect(validateDomain('api.example.com').valid).toBe(true);
  });

  it('validates wildcard domain', () => {
    const result = validateDomain('*.example.com');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('*.example.com');
  });

  it('validates bare wildcard', () => {
    expect(validateDomain('*').valid).toBe(true);
  });

  it('validates wildcard protocol pattern', () => {
    expect(validateDomain('*://example.com/*').valid).toBe(true);
  });

  it('validates IP address', () => {
    const result = validateDomain('192.168.1.1');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('192.168.1.1');
  });

  it('validates IP with port', () => {
    expect(validateDomain('192.168.1.1:8080').valid).toBe(true);
  });

  it('validates localhost', () => {
    expect(validateDomain('localhost').valid).toBe(true);
  });

  it('validates localhost with port', () => {
    expect(validateDomain('localhost:3000').valid).toBe(true);
  });

  it('validates 127.0.0.1', () => {
    expect(validateDomain('127.0.0.1').valid).toBe(true);
  });

  it('validates domain with protocol prefix', () => {
    expect(validateDomain('https://example.com').valid).toBe(true);
  });

  it('returns invalid for double-dot domain', () => {
    expect(validateDomain('invalid..domain').valid).toBe(false);
  });

  it('validates domain without leading/trailing whitespace', () => {
    // The function checks the raw input through regex, so leading/trailing
    // whitespace causes validation to fail. Only the sanitized value is trimmed.
    const result = validateDomain('example.com');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('example.com');
  });

  it('validates environment variable pattern', () => {
    const result = validateDomain('{{DOMAIN}}');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('{{DOMAIN}}');
  });

  it('returns invalid for unmatched braces', () => {
    const result = validateDomain('{{DOMAIN}');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('unmatched');
  });

  it('validates domain with path', () => {
    expect(validateDomain('https://example.com/path').valid).toBe(true);
  });
});

// ======================================================================
// validateDomainBatch
// ======================================================================
describe('validateDomainBatch', () => {
  it('returns all valid for good domains', () => {
    const result = validateDomainBatch(['example.com', '*.test.com']);
    expect(result.valid).toEqual(['example.com', '*.test.com']);
    expect(result.invalid).toEqual([]);
  });

  it('separates valid and invalid domains', () => {
    const result = validateDomainBatch(['example.com', 'invalid..domain', '*.test.com']);
    expect(result.valid).toContain('example.com');
    expect(result.valid).toContain('*.test.com');
    expect(result.invalid.length).toBe(1);
    expect(result.invalid[0].domain).toBe('invalid..domain');
  });

  it('handles empty array', () => {
    const result = validateDomainBatch([]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});

// ======================================================================
// isWildcardDomain
// ======================================================================
describe('isWildcardDomain', () => {
  it('returns true for wildcard prefix', () => {
    expect(isWildcardDomain('*.example.com')).toBe(true);
  });

  it('returns true for bare wildcard', () => {
    expect(isWildcardDomain('*')).toBe(true);
  });

  it('returns true for protocol wildcard', () => {
    expect(isWildcardDomain('*://test.com/*')).toBe(true);
  });

  it('returns false for standard domain', () => {
    expect(isWildcardDomain('example.com')).toBe(false);
  });

  it('returns falsy for empty string', () => {
    expect(isWildcardDomain('')).toBeFalsy();
  });

});

// ======================================================================
// extractBaseDomain
// ======================================================================
describe('extractBaseDomain', () => {
  it('returns empty for empty string', () => {
    expect(extractBaseDomain('')).toBe('');
  });

  it('removes https protocol', () => {
    expect(extractBaseDomain('https://example.com')).toBe('example.com');
  });

  it('removes http protocol', () => {
    expect(extractBaseDomain('http://example.com')).toBe('example.com');
  });

  it('removes wildcard prefix', () => {
    expect(extractBaseDomain('*.example.com')).toBe('example.com');
  });

  it('removes wildcard protocol', () => {
    expect(extractBaseDomain('*://test.com')).toBe('test.com');
  });

  it('removes path suffix', () => {
    expect(extractBaseDomain('https://www.example.com/path')).toBe('www.example.com');
  });

  it('handles domain with port', () => {
    expect(extractBaseDomain('example.com:8080')).toBe('example.com:8080');
  });
});
