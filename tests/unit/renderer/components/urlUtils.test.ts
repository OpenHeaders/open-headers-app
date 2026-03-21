import { describe, it, expect } from 'vitest';
import {
  getDisplayName,
} from '../../../../src/renderer/components/record/network/utils/urlUtils';

// ======================================================================
// getDisplayName
// ======================================================================
describe('getDisplayName', () => {
  it('returns fallback for empty URL', () => {
    expect(getDisplayName('')).toBe('Request Details');
  });

  it('returns last path segment', () => {
    expect(getDisplayName('https://api.com/users/data.json')).toBe('data.json');
  });

  it('returns last segment for path-only URL', () => {
    expect(getDisplayName('/api/v1/users')).toBe('users');
  });

  it('combines numeric segment with previous segment', () => {
    expect(getDisplayName('https://api.com/users/123')).toBe('users/123');
  });

  it('handles trailing slash by using previous segment', () => {
    expect(getDisplayName('https://api.com/users/')).toBe('users');
  });

  it('handles numeric-only last segment with dotted parent', () => {
    // When previousSegment contains a dot, it should just return the number
    expect(getDisplayName('https://api.com/v1.2/123')).toBe('123');
  });
});
