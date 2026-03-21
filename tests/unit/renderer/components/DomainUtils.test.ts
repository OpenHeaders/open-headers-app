import { describe, it, expect, vi } from 'vitest';
import {
  removeDomain,
  addDomains,
  createTagCloseHandler,
  formatDomainCount,
  calculateInputWidth,
  validateDomainArray,
} from '../../../../src/renderer/components/features/domain-tags/DomainUtils';

// ======================================================================
// removeDomain
// ======================================================================
describe('removeDomain', () => {
  it('removes specified domain', () => {
    expect(removeDomain(['a.com', 'b.com', 'c.com'], 'b.com')).toEqual(['a.com', 'c.com']);
  });

  it('returns same array when domain not found', () => {
    expect(removeDomain(['a.com', 'b.com'], 'x.com')).toEqual(['a.com', 'b.com']);
  });

  it('returns empty array when removing from single-item array', () => {
    expect(removeDomain(['a.com'], 'a.com')).toEqual([]);
  });

  it('removes all occurrences', () => {
    expect(removeDomain(['a.com', 'a.com', 'b.com'], 'a.com')).toEqual(['b.com']);
  });
});

// ======================================================================
// addDomains
// ======================================================================
describe('addDomains', () => {
  it('adds new domains', () => {
    expect(addDomains(['a.com'], ['b.com'])).toEqual(['a.com', 'b.com']);
  });

  it('removes duplicates', () => {
    expect(addDomains(['a.com'], ['a.com', 'b.com'])).toEqual(['a.com', 'b.com']);
  });

  it('handles single string domain', () => {
    expect(addDomains(['a.com'], 'b.com')).toEqual(['a.com', 'b.com']);
  });

  it('handles empty current array', () => {
    expect(addDomains([], ['a.com'])).toEqual(['a.com']);
  });
});

// ======================================================================
// createTagCloseHandler
// ======================================================================
describe('createTagCloseHandler', () => {
  it('creates handler that removes domain and calls onChange', () => {
    const onChange = vi.fn();
    const handler = createTagCloseHandler(['a.com', 'b.com', 'c.com'], onChange);
    handler('b.com');
    expect(onChange).toHaveBeenCalledWith(['a.com', 'c.com']);
  });

  it('does not throw if onChange is undefined', () => {
    const handler = createTagCloseHandler(['a.com'], undefined);
    expect(() => handler('a.com')).not.toThrow();
  });
});

// ======================================================================
// formatDomainCount
// ======================================================================
describe('formatDomainCount', () => {
  it('singular for count 1', () => {
    expect(formatDomainCount(1, 'copied')).toBe('1 copied');
  });

  it('plural for count > 1', () => {
    expect(formatDomainCount(5, 'added')).toBe('5 addeds');
  });

  it('plural for count 0', () => {
    expect(formatDomainCount(0, 'domain')).toBe('0 domains');
  });

  it('default action is domain', () => {
    expect(formatDomainCount(1)).toBe('1 domain');
    expect(formatDomainCount(3)).toBe('3 domains');
  });
});

// ======================================================================
// calculateInputWidth
// ======================================================================
describe('calculateInputWidth', () => {
  it('uses minimum width for empty content', () => {
    expect(calculateInputWidth('', 80, 400)).toBe(80);
  });

  it('calculates width based on char count', () => {
    // 10 chars * 8 + 20 = 100
    expect(calculateInputWidth('1234567890', 80, 400, 8)).toBe(100);
  });

  it('caps at max width', () => {
    const longText = 'x'.repeat(100); // 100 * 8 + 20 = 820 > 400
    expect(calculateInputWidth(longText, 80, 400, 8)).toBe(400);
  });

  it('respects minimum width', () => {
    expect(calculateInputWidth('ab', 200, 400, 8)).toBe(200);
  });

  it('handles undefined content', () => {
    expect(calculateInputWidth(undefined, 80, 400)).toBe(80);
  });
});

// ======================================================================
// validateDomainArray
// ======================================================================
describe('validateDomainArray', () => {
  it('returns valid for clean array', () => {
    const result = validateDomainArray(['a.com', 'b.com']);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('detects duplicates', () => {
    const result = validateDomainArray(['a.com', 'a.com', 'b.com']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('duplicates');
    expect(result.duplicateCount).toBe(1);
  });

  it('detects empty values', () => {
    const result = validateDomainArray(['a.com', '', 'b.com']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty');
    expect(result.emptyCount).toBe(1);
  });

  it('detects multiple issues', () => {
    const result = validateDomainArray(['a.com', 'a.com', '']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('duplicates');
    expect(result.issues).toContain('empty');
  });
});
