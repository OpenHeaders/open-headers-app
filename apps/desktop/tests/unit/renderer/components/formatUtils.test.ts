import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  truncateDomain,
  truncateValue,
} from '../../../../src/renderer/components/proxy/utils/formatUtils';

// ======================================================================
// formatBytes
// ======================================================================
describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats small bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('formats fractional kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('limits decimal places to 2', () => {
    const result = formatBytes(1127);
    expect(result).toMatch(/^\d+\.?\d{0,2} KB$/);
  });

  it('formats enterprise-scale response size (10MB)', () => {
    const result = formatBytes(10 * 1024 * 1024);
    expect(result).toBe('10 MB');
  });

  it('formats enterprise-scale large file (2.5GB)', () => {
    const result = formatBytes(2.5 * 1024 * 1024 * 1024);
    expect(result).toBe('2.5 GB');
  });
});

// ======================================================================
// truncateValue
// ======================================================================
describe('truncateValue', () => {
  it('returns empty string for empty input', () => {
    expect(truncateValue('')).toBe('');
  });

  it('returns short value as-is', () => {
    expect(truncateValue('short')).toBe('short');
  });

  it('returns value of exactly 23 chars as-is', () => {
    const str = 'a'.repeat(23);
    expect(truncateValue(str)).toBe(str);
  });

  it('truncates long value with ellipsis preserving start and end', () => {
    const long = 'ABCDEFGHIJ' + 'x'.repeat(20) + '0123456789';
    expect(truncateValue(long)).toBe('ABCDEFGHIJ...0123456789');
  });

  it('truncates enterprise JWT token', () => {
    const jwt = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.signature';
    const result = truncateValue(jwt);
    expect(result.length).toBeLessThan(jwt.length);
    expect(result).toContain('...');
  });
});

// ======================================================================
// truncateDomain
// ======================================================================
describe('truncateDomain', () => {
  it('returns empty string for empty input', () => {
    expect(truncateDomain('')).toBe('');
  });

  it('returns short domain as-is', () => {
    expect(truncateDomain('openheaders.io')).toBe('openheaders.io');
  });

  it('truncates long enterprise domain', () => {
    const long = 'auth.internal.staging.openheaders.io';
    expect(truncateDomain(long, 18)).toBe('auth.internal.stag...');
  });

  it('uses custom maxLength', () => {
    expect(truncateDomain('openheaders.io', 5)).toBe('openh...');
  });

  it('returns domain of exactly maxLength as-is', () => {
    expect(truncateDomain('openheaders.io', 14)).toBe('openheaders.io');
  });

  it('handles wildcard domain truncation', () => {
    const wildcard = '*.very-long-subdomain.openheaders.io';
    expect(truncateDomain(wildcard, 20)).toBe('*.very-long-subdomai...');
  });
});
