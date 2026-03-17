import { describe, it, expect } from 'vitest';
import {
  buildHeaderValue,
  parseHeaderValue,
} from '../../../../../../src/renderer/components/rules/header/unified-modal/utils';

// ======================================================================
// buildHeaderValue - non-cookie mode
// ======================================================================
describe('buildHeaderValue (non-cookie)', () => {
  it('returns headerValue for non-cookie mode', () => {
    expect(buildHeaderValue({ headerValue: 'Bearer token123' }, 'header', 'static')).toBe('Bearer token123');
  });

  it('returns empty string when headerValue is missing', () => {
    expect(buildHeaderValue({}, 'header', 'static')).toBe('');
  });
});

// ======================================================================
// buildHeaderValue - cookie mode
// ======================================================================
describe('buildHeaderValue (cookie)', () => {
  it('builds basic request cookie (no attributes)', () => {
    const values = {
      cookieName: 'session',
      cookieValue: 'abc123',
      headerType: 'request',
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toBe('session=abc123');
  });

  it('builds response cookie with path', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
      cookiePath: '/api',
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('token=xyz');
    expect(result).toContain('Path=/api');
  });

  it('adds default path / for response cookie', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('Path=/');
  });

  it('adds Secure flag for response cookie', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
      secure: true,
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('Secure');
  });

  it('adds HttpOnly flag for response cookie', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
      httpOnly: true,
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('HttpOnly');
  });

  it('adds SameSite for response cookie', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
      sameSite: 'Strict',
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('SameSite=Strict');
  });

  it('adds Max-Age for maxAge expiration mode', () => {
    const values = {
      cookieName: 'token',
      cookieValue: 'xyz',
      headerType: 'response',
      expirationMode: 'maxAge',
      maxAge: 3600,
    };
    const result = buildHeaderValue(values, 'cookie', 'static');
    expect(result).toContain('Max-Age=3600');
  });

  it('uses DYNAMIC_VALUE placeholder for dynamic cookie', () => {
    const values = {
      cookieName: 'session',
      sourceId: 'src-1',
      headerType: 'request',
    };
    const result = buildHeaderValue(values, 'cookie', 'dynamic');
    expect(result).toBe('session={{DYNAMIC_VALUE}}');
  });
});

// ======================================================================
// parseHeaderValue - non-cookie mode
// ======================================================================
describe('parseHeaderValue (non-cookie)', () => {
  it('returns value object for non-cookie mode', () => {
    expect(parseHeaderValue('Bearer token', 'header')).toEqual({ value: 'Bearer token' });
  });
});

// ======================================================================
// parseHeaderValue - cookie mode
// ======================================================================
describe('parseHeaderValue (cookie)', () => {
  it('returns empty object for empty string', () => {
    expect(parseHeaderValue('', 'cookie')).toEqual({});
  });

  it('parses name=value', () => {
    const result = parseHeaderValue('session=abc123', 'cookie');
    expect(result.name).toBe('session');
    expect(result.value).toBe('abc123');
  });

  it('parses cookie with attributes', () => {
    const result = parseHeaderValue(
      'token=xyz; Path=/api; SameSite=Strict; Secure; HttpOnly; Max-Age=3600',
      'cookie'
    );
    expect(result.name).toBe('token');
    expect(result.value).toBe('xyz');
    expect(result.path).toBe('/api');
    expect(result.sameSite).toBe('Strict');
    expect(result.secure).toBe(true);
    expect(result.httpOnly).toBe(true);
    expect(result.maxAge).toBe(3600);
    expect(result.expirationMode).toBe('maxAge');
  });

  it('parses Expires attribute', () => {
    const result = parseHeaderValue('x=y; Expires=Thu, 01 Jan 2026 00:00:00 GMT', 'cookie');
    expect(result.expirationMode).toBe('expires');
    expect(result.expires).toBeDefined();
  });

  it('defaults to session expiration', () => {
    const result = parseHeaderValue('x=y', 'cookie');
    expect(result.expirationMode).toBe('session');
  });

  it('defaults path to /', () => {
    const result = parseHeaderValue('x=y', 'cookie');
    expect(result.path).toBe('/');
  });

  it('defaults sameSite to Lax', () => {
    const result = parseHeaderValue('x=y', 'cookie');
    expect(result.sameSite).toBe('Lax');
  });
});
