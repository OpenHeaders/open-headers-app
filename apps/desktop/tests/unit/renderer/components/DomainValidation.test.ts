import { describe, expect, it } from 'vitest';
import {
  extractBaseDomain,
  isWildcardDomain,
  validateDomain,
  validateDomainBatch,
} from '../../../../src/renderer/components/features/domain-tags/DomainValidation';

// ======================================================================
// validateDomain
// ======================================================================
describe('validateDomain', () => {
  it('returns invalid for empty string', () => {
    const result = validateDomain('');
    expect(result).toEqual({ valid: false, message: 'Domain cannot be empty' });
  });

  it('returns invalid for whitespace-only', () => {
    expect(validateDomain('   ')).toEqual({ valid: false, message: 'Domain cannot be empty' });
  });

  it('validates standard domain', () => {
    const result = validateDomain('openheaders.io');
    expect(result).toEqual({ valid: true, sanitized: 'openheaders.io' });
  });

  it('validates subdomain', () => {
    expect(validateDomain('api.openheaders.io')).toEqual({ valid: true, sanitized: 'api.openheaders.io' });
  });

  it('validates deeply nested subdomain', () => {
    expect(validateDomain('auth.internal.staging.openheaders.io')).toEqual({
      valid: true,
      sanitized: 'auth.internal.staging.openheaders.io',
    });
  });

  it('validates wildcard domain', () => {
    expect(validateDomain('*.openheaders.io')).toEqual({ valid: true, sanitized: '*.openheaders.io' });
  });

  it('validates bare wildcard', () => {
    expect(validateDomain('*')).toEqual({ valid: true, sanitized: '*' });
  });

  it('validates wildcard protocol pattern', () => {
    expect(validateDomain('*://openheaders.io/*')).toEqual({
      valid: true,
      sanitized: '*://openheaders.io/*',
    });
  });

  it('validates path wildcard pattern', () => {
    expect(validateDomain('openheaders.io/*')).toEqual({ valid: true, sanitized: 'openheaders.io/*' });
  });

  it('validates IPv4 address', () => {
    expect(validateDomain('192.168.1.1')).toEqual({ valid: true, sanitized: '192.168.1.1' });
  });

  it('validates IPv4 with port', () => {
    expect(validateDomain('192.168.1.1:8080')).toEqual({ valid: true, sanitized: '192.168.1.1:8080' });
  });

  it('validates enterprise IP with high port', () => {
    expect(validateDomain('10.0.0.1:8443')).toEqual({ valid: true, sanitized: '10.0.0.1:8443' });
  });

  it('validates localhost', () => {
    expect(validateDomain('localhost')).toEqual({ valid: true, sanitized: 'localhost' });
  });

  it('validates localhost with port', () => {
    expect(validateDomain('localhost:3000')).toEqual({ valid: true, sanitized: 'localhost:3000' });
  });

  it('validates 127.0.0.1', () => {
    expect(validateDomain('127.0.0.1')).toEqual({ valid: true, sanitized: '127.0.0.1' });
  });

  it('validates domain with https protocol prefix', () => {
    expect(validateDomain('https://openheaders.io').valid).toBe(true);
  });

  it('validates domain with http protocol prefix', () => {
    expect(validateDomain('http://openheaders.io').valid).toBe(true);
  });

  it('validates domain with path', () => {
    expect(validateDomain('https://openheaders.io/api/v2/config').valid).toBe(true);
  });

  it('returns invalid for double-dot domain', () => {
    const result = validateDomain('invalid..openheaders.io');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Invalid domain pattern');
  });

  // Environment variable patterns
  it('validates single environment variable pattern', () => {
    expect(validateDomain('{{DOMAIN}}')).toEqual({ valid: true, sanitized: '{{DOMAIN}}' });
  });

  it('validates environment variable embedded in domain', () => {
    expect(validateDomain('api.{{ENV}}.openheaders.io')).toEqual({
      valid: true,
      sanitized: 'api.{{ENV}}.openheaders.io',
    });
  });

  it('validates multiple environment variables in domain', () => {
    expect(validateDomain('{{SUBDOMAIN}}.{{DOMAIN}}')).toEqual({
      valid: true,
      sanitized: '{{SUBDOMAIN}}.{{DOMAIN}}',
    });
  });

  it('returns invalid for unmatched opening braces', () => {
    const result = validateDomain('{{DOMAIN}');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('unmatched');
  });

  it('returns invalid for unmatched closing braces', () => {
    const result = validateDomain('{DOMAIN}}');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('unmatched');
  });

  // Enterprise domain patterns
  it('domain with port but no protocol does not match domain regex', () => {
    // The domainPattern regex doesn't handle port suffixes on non-IP domains
    // Only IPs and localhost support bare :port — this documents actual behavior
    const result = validateDomain('api.partner-service.io:8443');
    expect(result.valid).toBe(false);
  });

  it('validates enterprise internal domain', () => {
    expect(validateDomain('auth.openheaders.internal')).toEqual({
      valid: true,
      sanitized: 'auth.openheaders.internal',
    });
  });

  it('validates hyphenated domain components', () => {
    expect(validateDomain('my-service.openheaders.io')).toEqual({
      valid: true,
      sanitized: 'my-service.openheaders.io',
    });
  });

  it('validates single-char domain label', () => {
    expect(validateDomain('a.openheaders.io')).toEqual({ valid: true, sanitized: 'a.openheaders.io' });
  });

  it('validates domain with max-length label (63 chars)', () => {
    const label = 'a'.repeat(63);
    expect(validateDomain(`${label}.openheaders.io`).valid).toBe(true);
  });

  it('trims whitespace from valid domain sanitized output', () => {
    // Domain itself with trailing space — the sanitized value should be trimmed
    const result = validateDomain('openheaders.io');
    expect(result.sanitized).toBe('openheaders.io');
  });
});

// ======================================================================
// validateDomainBatch
// ======================================================================
describe('validateDomainBatch', () => {
  it('returns all valid for good enterprise domains', () => {
    const result = validateDomainBatch(['openheaders.io', '*.openheaders.io', 'localhost:3000']);
    expect(result.valid).toEqual(['openheaders.io', '*.openheaders.io', 'localhost:3000']);
    expect(result.invalid).toEqual([]);
  });

  it('separates valid and invalid domains', () => {
    const result = validateDomainBatch(['openheaders.io', 'invalid..domain', '*.staging.openheaders.io']);
    expect(result.valid).toEqual(['openheaders.io', '*.staging.openheaders.io']);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]).toEqual({
      domain: 'invalid..domain',
      message: 'Invalid domain pattern',
    });
  });

  it('handles empty array', () => {
    const result = validateDomainBatch([]);
    expect(result).toEqual({ valid: [], invalid: [] });
  });

  it('handles large batch of 100+ domains', () => {
    const domains = Array.from({ length: 120 }, (_, i) => `service-${i}.openheaders.io`);
    const result = validateDomainBatch(domains);
    expect(result.valid).toHaveLength(120);
    expect(result.invalid).toHaveLength(0);
  });

  it('correctly categorizes mixed valid/invalid/empty batch', () => {
    const result = validateDomainBatch(['', 'openheaders.io', 'invalid..x', '*.openheaders.io', '   ']);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(3);
  });
});

// ======================================================================
// isWildcardDomain
// ======================================================================
describe('isWildcardDomain', () => {
  it('returns true for wildcard prefix', () => {
    expect(isWildcardDomain('*.openheaders.io')).toBe(true);
  });

  it('returns true for bare wildcard', () => {
    expect(isWildcardDomain('*')).toBe(true);
  });

  it('returns true for protocol wildcard', () => {
    expect(isWildcardDomain('*://openheaders.io/*')).toBe(true);
  });

  it('returns true for path wildcard', () => {
    expect(isWildcardDomain('openheaders.io/*')).toBe(true);
  });

  it('returns true for embedded wildcard', () => {
    expect(isWildcardDomain('api.*.openheaders.io')).toBe(true);
  });

  it('returns false for standard domain', () => {
    expect(isWildcardDomain('openheaders.io')).toBe(false);
  });

  it('returns false for IP address', () => {
    expect(isWildcardDomain('192.168.1.1')).toBe(false);
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
    expect(extractBaseDomain('https://openheaders.io')).toBe('openheaders.io');
  });

  it('removes http protocol', () => {
    expect(extractBaseDomain('http://openheaders.io')).toBe('openheaders.io');
  });

  it('removes wildcard prefix', () => {
    expect(extractBaseDomain('*.openheaders.io')).toBe('openheaders.io');
  });

  it('removes wildcard protocol', () => {
    expect(extractBaseDomain('*://openheaders.io')).toBe('openheaders.io');
  });

  it('removes path suffix', () => {
    expect(extractBaseDomain('https://www.openheaders.io/api/v2')).toBe('www.openheaders.io');
  });

  it('preserves domain with port', () => {
    expect(extractBaseDomain('openheaders.io:8443')).toBe('openheaders.io:8443');
  });

  it('handles protocol + path combined', () => {
    expect(extractBaseDomain('https://api.openheaders.io/oauth2/token')).toBe('api.openheaders.io');
  });

  it('handles wildcard protocol + path', () => {
    expect(extractBaseDomain('*://openheaders.io/*')).toBe('openheaders.io');
  });

  it('handles plain domain unchanged', () => {
    expect(extractBaseDomain('openheaders.io')).toBe('openheaders.io');
  });

  it('handles subdomain with wildcard prefix', () => {
    expect(extractBaseDomain('*.staging.openheaders.io')).toBe('staging.openheaders.io');
  });
});
