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

  it('returns custom fallback for empty URL', () => {
    expect(getDisplayName('', 'Unknown')).toBe('Unknown');
  });

  it('returns last path segment for API endpoint', () => {
    expect(getDisplayName('https://api.openheaders.io/v2/config/data.json')).toBe('data.json');
  });

  it('returns last segment for enterprise API path', () => {
    expect(getDisplayName('https://auth.openheaders.internal:8443/oauth2/token')).toBe('token');
  });

  it('returns last segment for path-only URL', () => {
    expect(getDisplayName('/api/v1/users')).toBe('users');
  });

  it('combines numeric segment with previous segment for REST resource', () => {
    expect(getDisplayName('https://api.openheaders.io/workspaces/123')).toBe('workspaces/123');
  });

  it('handles trailing slash by using previous segment', () => {
    expect(getDisplayName('https://api.openheaders.io/users/')).toBe('users');
  });

  it('handles numeric-only last segment with dotted parent', () => {
    expect(getDisplayName('https://api.openheaders.io/v1.2/123')).toBe('123');
  });

  it('handles enterprise URL with deep path', () => {
    expect(getDisplayName('https://auth.openheaders.io/realms/production/protocol/openid-connect/token')).toBe('token');
  });

  it('handles URL with query string (query is part of last segment)', () => {
    expect(getDisplayName('https://api.openheaders.io/search?q=test')).toBe('search?q=test');
  });

  it('returns file name from static asset URL', () => {
    expect(getDisplayName('https://cdn.openheaders.io/assets/styles.css')).toBe('styles.css');
  });
});
