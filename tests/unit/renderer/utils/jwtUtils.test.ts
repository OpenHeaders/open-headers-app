import { describe, it, expect, vi } from 'vitest';
import {
  decodeJWT,
  encodeJWT,
  isJWT,
  formatJSON,
  validateJSON,
  getJWTExpiration,
  JWT_CLAIM_DESCRIPTIONS,
} from '../../../../src/renderer/utils/jwtUtils';

// Helper: build a minimal valid JWT from header + payload objects
function buildJWT(header: object, payload: object, sig = 'fakesig'): string {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  return `${encode(header)}.${encode(payload)}.${sig}`;
}

describe('jwtUtils', () => {
  // ------------------------------------------------------------------
  // decodeJWT
  // ------------------------------------------------------------------
  describe('decodeJWT', () => {
    it('decodes a valid JWT with standard claims', () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { sub: '1234567890', name: 'John', iat: 1516239022 };
      const token = buildJWT(header, payload, 'testsig');

      const decoded = decodeJWT(token);
      expect(decoded.header).toEqual(header);
      expect(decoded.payload).toEqual(payload);
      expect(decoded.signature).toBe('testsig');
    });

    it('handles base64url characters (- and _)', () => {
      // Payload with data that produces + and / in regular base64
      const header = { alg: 'HS256' };
      const payload = { data: '>>>???' }; // tends to produce non-url-safe chars
      const token = buildJWT(header, payload);
      const decoded = decodeJWT(token);
      expect(decoded.payload.data).toBe('>>>???');
    });

    it('throws for null input', () => {
      expect(() => decodeJWT(null)).toThrow('Failed to decode JWT');
    });

    it('throws for undefined input', () => {
      expect(() => decodeJWT(undefined)).toThrow('Failed to decode JWT');
    });

    it('throws for empty string', () => {
      expect(() => decodeJWT('')).toThrow('Failed to decode JWT');
    });

    it('throws for non-string input', () => {
      expect(() => decodeJWT(42 as any)).toThrow('Failed to decode JWT');
    });

    it('throws for token with wrong number of parts (2 parts)', () => {
      expect(() => decodeJWT('abc.def')).toThrow('Failed to decode JWT');
    });

    it('throws for token with wrong number of parts (4 parts)', () => {
      expect(() => decodeJWT('a.b.c.d')).toThrow('Failed to decode JWT');
    });

    it('throws for token with invalid base64 in header', () => {
      expect(() => decodeJWT('!!!.abc.def')).toThrow('Failed to decode JWT');
    });

    it('throws for token whose header is valid base64 but not JSON', () => {
      const notJson = btoa('not json');
      const validPayload = btoa(JSON.stringify({ a: 1 }));
      expect(() => decodeJWT(`${notJson}.${validPayload}.sig`)).toThrow(
        'Failed to decode JWT'
      );
    });
  });

  // ------------------------------------------------------------------
  // encodeJWT
  // ------------------------------------------------------------------
  describe('encodeJWT', () => {
    it('round-trips with decodeJWT', () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { sub: 'user123', roles: ['admin'] };

      const token = encodeJWT(header, payload, 'mysig');
      const decoded = decodeJWT(token);

      expect(decoded.header).toEqual(header);
      expect(decoded.payload).toEqual(payload);
      expect(decoded.signature).toBe('mysig');
    });

    it('uses empty string as default signature', () => {
      const token = encodeJWT({ alg: 'none' }, { data: 1 });
      expect(token.endsWith('.')).toBe(true);
    });

    it('produces base64url output (no +, /, or =)', () => {
      const token = encodeJWT(
        { alg: 'HS256' },
        { longvalue: 'a'.repeat(200) }
      );
      const parts = token.split('.');
      expect(parts[0]).not.toMatch(/[+/=]/);
      expect(parts[1]).not.toMatch(/[+/=]/);
    });

    it('throws on circular reference', () => {
      const circular: any = {};
      circular.self = circular;
      expect(() => encodeJWT(circular, {})).toThrow('Failed to encode JWT');
    });
  });

  // ------------------------------------------------------------------
  // isJWT
  // ------------------------------------------------------------------
  describe('isJWT', () => {
    it('returns truthy for a valid JWT with alg in header', () => {
      const token = buildJWT({ alg: 'HS256' }, { sub: '1' });
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns truthy for a JWT with typ:JWT but no alg', () => {
      const token = buildJWT({ typ: 'JWT' }, { foo: 'bar' });
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns false for null', () => {
      expect(isJWT(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isJWT(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isJWT('')).toBe(false);
    });

    it('returns false for non-string', () => {
      expect(isJWT(123 as any)).toBe(false);
    });

    it('returns false for a string with only 2 dot-separated parts', () => {
      expect(isJWT('abc.def')).toBe(false);
    });

    it('returns false for 3 parts where header is not valid JSON', () => {
      expect(isJWT('notbase64.notbase64.sig')).toBe(false);
    });

    it('returns false for valid base64 header without alg or typ', () => {
      const token = buildJWT({ foo: 'bar' }, { x: 1 });
      expect(isJWT(token)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // formatJSON
  // ------------------------------------------------------------------
  describe('formatJSON', () => {
    it('formats with 2-space indentation', () => {
      const result = formatJSON({ a: 1 });
      expect(result).toBe('{\n  "a": 1\n}');
    });

    it('handles nested objects', () => {
      const result = formatJSON({ a: { b: 2 } });
      expect(result).toContain('"b": 2');
    });

    it('handles arrays', () => {
      const result = formatJSON([1, 2, 3]);
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });
  });

  // ------------------------------------------------------------------
  // validateJSON
  // ------------------------------------------------------------------
  describe('validateJSON', () => {
    it('returns parsed object for valid JSON', () => {
      expect(validateJSON('{"a":1}')).toEqual({ a: 1 });
    });

    it('returns parsed array', () => {
      expect(validateJSON('[1,2]')).toEqual([1, 2]);
    });

    it('throws for invalid JSON', () => {
      expect(() => validateJSON('{not json}')).toThrow('Invalid JSON');
    });

    it('throws for empty string', () => {
      expect(() => validateJSON('')).toThrow('Invalid JSON');
    });
  });

  // ------------------------------------------------------------------
  // getJWTExpiration
  // ------------------------------------------------------------------
  describe('getJWTExpiration', () => {
    it('returns hasExpiration:false when payload is null', () => {
      expect(getJWTExpiration(null)).toEqual({ hasExpiration: false });
    });

    it('returns hasExpiration:false when payload has no exp', () => {
      expect(getJWTExpiration({ sub: '1' })).toEqual({ hasExpiration: false });
    });

    it('detects expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const result = getJWTExpiration({ exp: pastExp });

      expect(result.hasExpiration).toBe(true);
      expect(result.isExpired).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresIn).toBeLessThan(0);
    });

    it('detects non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const result = getJWTExpiration({ exp: futureExp });

      expect(result.hasExpiration).toBe(true);
      expect(result.isExpired).toBe(false);
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('converts exp from seconds to milliseconds correctly', () => {
      const expSeconds = 1700000000;
      const result = getJWTExpiration({ exp: expSeconds });
      expect(result.expiresAt!.getTime()).toBe(expSeconds * 1000);
    });
  });

  // ------------------------------------------------------------------
  // JWT_CLAIM_DESCRIPTIONS
  // ------------------------------------------------------------------
  describe('JWT_CLAIM_DESCRIPTIONS', () => {
    it('has standard claims', () => {
      expect(JWT_CLAIM_DESCRIPTIONS.iss).toBe('Issuer');
      expect(JWT_CLAIM_DESCRIPTIONS.sub).toBe('Subject');
      expect(JWT_CLAIM_DESCRIPTIONS.aud).toBe('Audience');
      expect(JWT_CLAIM_DESCRIPTIONS.exp).toBe('Expiration Time');
      expect(JWT_CLAIM_DESCRIPTIONS.nbf).toBe('Not Before');
      expect(JWT_CLAIM_DESCRIPTIONS.iat).toBe('Issued At');
      expect(JWT_CLAIM_DESCRIPTIONS.jti).toBe('JWT ID');
    });

    it('has common custom claims', () => {
      expect(JWT_CLAIM_DESCRIPTIONS.email).toBe('Email');
      expect(JWT_CLAIM_DESCRIPTIONS.name).toBe('Name');
      expect(JWT_CLAIM_DESCRIPTIONS.role).toBe('Role');
    });
  });
});
