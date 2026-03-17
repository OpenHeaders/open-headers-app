import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  truncateValue,
  truncateDomain,
} from '../../../../../src/renderer/components/proxy/utils/formatUtils';

// ======================================================================
// formatBytes
// ======================================================================
describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
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
    // 1024 + 103 = 1127 bytes = 1.1006... KB -> 1.1 KB
    const result = formatBytes(1127);
    expect(result).toMatch(/^\d+\.?\d{0,2} KB$/);
  });
});

// ======================================================================
// truncateValue
// ======================================================================
describe('truncateValue', () => {
  it('returns empty string for null', () => {
    expect(truncateValue(null as any)).toBe('');
  });

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

  it('truncates long value with ellipsis', () => {
    const long = 'ABCDEFGHIJ' + 'x'.repeat(20) + '0123456789';
    expect(truncateValue(long)).toBe('ABCDEFGHIJ...0123456789');
  });
});

// ======================================================================
// truncateDomain
// ======================================================================
describe('truncateDomain', () => {
  it('returns empty string for null', () => {
    expect(truncateDomain(null as any)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(truncateDomain('')).toBe('');
  });

  it('returns short domain as-is', () => {
    expect(truncateDomain('example.com')).toBe('example.com');
  });

  it('truncates long domain', () => {
    const long = 'very-long-subdomain.example.com';
    expect(truncateDomain(long, 18)).toBe('very-long-subdomai...');
  });

  it('uses custom maxLength', () => {
    expect(truncateDomain('example.com', 5)).toBe('examp...');
  });

  it('returns domain of exactly maxLength as-is', () => {
    expect(truncateDomain('example.com', 11)).toBe('example.com');
  });
});
