import { describe, it, expect } from 'vitest';
import {
  decodeJWT,
  encodeJWT,
  isJWT,
  formatJSON,
  validateJSON,
  getJWTExpiration,
  JWT_CLAIM_DESCRIPTIONS,
} from '../../../../src/renderer/utils/jwtUtils';
import type { JsonObject } from '../../../../src/types/common';

// Helper: build a minimal valid JWT from header + payload objects
function buildJWT(header: object, payload: object, sig = 'fakesig'): string {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  return `${encode(header)}.${encode(payload)}.${sig}`;
}

// Enterprise-like JWT token for realistic testing
const ENTERPRISE_HEADER = { alg: 'RS256', typ: 'JWT', kid: 'openheaders-signing-key-2025' };
const ENTERPRISE_PAYLOAD = {
  iss: 'https://auth.openheaders.io',
  sub: 'user@openheaders.io',
  aud: 'https://api.openheaders.io',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  scope: 'openid profile email',
  roles: ['admin', 'developer'],
  org_id: 'org-openheaders-prod',
};

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
      expect(decoded).toEqual({
        header,
        payload,
        signature: 'testsig',
      });
    });

    it('decodes enterprise JWT with all standard claims', () => {
      const token = buildJWT(ENTERPRISE_HEADER, ENTERPRISE_PAYLOAD, 'enterprise-sig');
      const decoded = decodeJWT(token);

      expect(decoded.header).toEqual(ENTERPRISE_HEADER);
      expect(decoded.payload.iss).toBe('https://auth.openheaders.io');
      expect(decoded.payload.sub).toBe('user@openheaders.io');
      expect(decoded.payload.aud).toBe('https://api.openheaders.io');
      expect(decoded.payload.jti).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(decoded.payload.scope).toBe('openid profile email');
      expect(decoded.payload.roles).toEqual(['admin', 'developer']);
      expect(decoded.signature).toBe('enterprise-sig');
    });

    it('handles base64url characters (- and _)', () => {
      const header = { alg: 'HS256' };
      const payload = { data: '>>>???' };
      const token = buildJWT(header, payload);
      const decoded = decodeJWT(token);
      expect(decoded.payload.data).toBe('>>>???');
    });

    it('decodes JWT with nested object claims', () => {
      const payload = {
        sub: 'user@openheaders.io',
        permissions: { proxy: ['read', 'write'], workspace: ['admin'] },
        metadata: { team: 'platform', region: 'eu-west-1' },
      };
      const token = buildJWT({ alg: 'RS256' }, payload);
      const decoded = decodeJWT(token);
      expect(decoded.payload.permissions).toEqual({ proxy: ['read', 'write'], workspace: ['admin'] });
    });

    it('throws for null input', () => {
      expect(() => decodeJWT(null as unknown as string)).toThrow('Failed to decode JWT');
    });

    it('throws for undefined input', () => {
      expect(() => decodeJWT(undefined as unknown as string)).toThrow('Failed to decode JWT');
    });

    it('throws for empty string', () => {
      expect(() => decodeJWT('')).toThrow('Failed to decode JWT');
    });

    it('throws for token with 2 parts', () => {
      expect(() => decodeJWT('abc.def')).toThrow('Failed to decode JWT');
    });

    it('throws for token with 4 parts', () => {
      expect(() => decodeJWT('a.b.c.d')).toThrow('Failed to decode JWT');
    });

    it('throws for token with invalid base64 in header', () => {
      expect(() => decodeJWT('!!!.abc.def')).toThrow('Failed to decode JWT');
    });

    it('throws for token whose header is valid base64 but not JSON', () => {
      const notJson = btoa('not json');
      const validPayload = btoa(JSON.stringify({ a: 1 }));
      expect(() => decodeJWT(`${notJson}.${validPayload}.sig`)).toThrow('Failed to decode JWT');
    });

    it('throws for single-segment string', () => {
      expect(() => decodeJWT('just-a-string')).toThrow('Failed to decode JWT');
    });
  });

  // ------------------------------------------------------------------
  // encodeJWT
  // ------------------------------------------------------------------
  describe('encodeJWT', () => {
    it('round-trips with decodeJWT', () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = { sub: 'user@openheaders.io', roles: ['admin'] };

      const token = encodeJWT(header, payload, 'mysig');
      const decoded = decodeJWT(token);

      expect(decoded.header).toEqual(header);
      expect(decoded.payload).toEqual(payload);
      expect(decoded.signature).toBe('mysig');
    });

    it('round-trips enterprise JWT', () => {
      const token = encodeJWT(ENTERPRISE_HEADER, ENTERPRISE_PAYLOAD, 'sig');
      const decoded = decodeJWT(token);
      expect(decoded.header).toEqual(ENTERPRISE_HEADER);
      expect(decoded.payload).toEqual(ENTERPRISE_PAYLOAD);
    });

    it('uses empty string as default signature', () => {
      const token = encodeJWT({ alg: 'none' }, { data: 1 });
      expect(token.endsWith('.')).toBe(true);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[2]).toBe('');
    });

    it('produces base64url output (no +, /, or =)', () => {
      const token = encodeJWT(
        { alg: 'HS256' },
        { longvalue: 'a'.repeat(200) },
      );
      const parts = token.split('.');
      expect(parts[0]).not.toMatch(/[+/=]/);
      expect(parts[1]).not.toMatch(/[+/=]/);
    });

    it('throws on circular reference', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(() => encodeJWT(circular as JsonObject, {})).toThrow('Failed to encode JWT');
    });

    it('encodes JWT with special ASCII characters', () => {
      const payload = { url: 'https://auth.openheaders.io/oauth2/token?scope=read+write&client_id=abc' };
      const token = encodeJWT({ alg: 'HS256' }, payload, 'sig');
      const decoded = decodeJWT(token);
      expect(decoded.payload.url).toBe('https://auth.openheaders.io/oauth2/token?scope=read+write&client_id=abc');
    });
  });

  // ------------------------------------------------------------------
  // isJWT
  // ------------------------------------------------------------------
  describe('isJWT', () => {
    it('returns truthy for a valid JWT with alg in header', () => {
      const token = buildJWT({ alg: 'HS256' }, { sub: 'user@openheaders.io' });
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns truthy for RS256 JWT', () => {
      const token = buildJWT({ alg: 'RS256', typ: 'JWT' }, { iss: 'https://auth.openheaders.io' });
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns truthy for a JWT with typ:JWT but no alg', () => {
      const token = buildJWT({ typ: 'JWT' }, { foo: 'bar' });
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns truthy for enterprise JWT', () => {
      const token = buildJWT(ENTERPRISE_HEADER, ENTERPRISE_PAYLOAD);
      expect(isJWT(token)).toBeTruthy();
    });

    it('returns false for null', () => {
      expect(isJWT(null as unknown as string)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isJWT(undefined as unknown as string)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isJWT('')).toBe(false);
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

    it('returns false for random bearer token that looks JWT-ish', () => {
      expect(isJWT('eyJra.eyJra.invalid')).toBe(false);
    });

    it('returns false for non-string number', () => {
      expect(isJWT(12345 as unknown as string)).toBe(false);
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
      const result = formatJSON([1, 2, 3] as unknown as JsonObject);
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('formats enterprise JWT payload', () => {
      const result = formatJSON({
        iss: 'https://auth.openheaders.io',
        sub: 'user@openheaders.io',
        roles: ['admin'],
      });
      expect(result).toContain('"iss": "https://auth.openheaders.io"');
      expect(result).toContain('"roles"');
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

    it('throws for truncated JSON', () => {
      expect(() => validateJSON('{"key": "val')).toThrow('Invalid JSON');
    });

    it('parses enterprise config JSON', () => {
      const config = JSON.stringify({
        sources: [{ sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', sourceType: 'http' }],
        environments: { Production: { API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc' } },
      });
      const parsed = validateJSON(config);
      expect(parsed.sources).toHaveLength(1);
      expect(parsed.environments.Production.API_KEY).toBe('ohk_live_4eC39HqLyjWDarjtT1zdp7dc');
    });
  });

  // ------------------------------------------------------------------
  // getJWTExpiration
  // ------------------------------------------------------------------
  describe('getJWTExpiration', () => {
    it('returns hasExpiration:false when payload is null', () => {
      expect(getJWTExpiration(null as unknown as JsonObject)).toEqual({ hasExpiration: false });
    });

    it('returns hasExpiration:false when payload has no exp', () => {
      expect(getJWTExpiration({ sub: 'user@openheaders.io' })).toEqual({ hasExpiration: false });
    });

    it('detects expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const result = getJWTExpiration({ exp: pastExp });

      expect(result).toEqual({
        hasExpiration: true,
        isExpired: true,
        expiresAt: expect.any(Date),
        expiresIn: expect.any(Number),
      });
      expect(result.isExpired).toBe(true);
      expect(result.expiresIn!).toBeLessThan(0);
    });

    it('detects non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const result = getJWTExpiration({ exp: futureExp });

      expect(result).toEqual({
        hasExpiration: true,
        isExpired: false,
        expiresAt: expect.any(Date),
        expiresIn: expect.any(Number),
      });
      expect(result.isExpired).toBe(false);
      expect(result.expiresIn!).toBeGreaterThan(0);
    });

    it('converts exp from seconds to milliseconds correctly', () => {
      const expSeconds = 1700000000;
      const result = getJWTExpiration({ exp: expSeconds });
      expect(result.expiresAt!.getTime()).toBe(expSeconds * 1000);
    });

    it('handles enterprise JWT expiry (24h token)', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = getJWTExpiration({ exp: now + 86400 }); // 24 hours
      expect(result.hasExpiration).toBe(true);
      expect(result.isExpired).toBe(false);
      // expiresIn should be close to 86400000ms (24h in ms)
      expect(result.expiresIn!).toBeGreaterThan(86300000);
      expect(result.expiresIn!).toBeLessThanOrEqual(86400000);
    });

    it('handles token that just expired (exp = now - 1)', () => {
      const justPast = Math.floor(Date.now() / 1000) - 1;
      const result = getJWTExpiration({ exp: justPast });
      expect(result.isExpired).toBe(true);
    });

    it('returns hasExpiration:false for empty payload', () => {
      expect(getJWTExpiration({})).toEqual({ hasExpiration: false });
    });
  });

  // ------------------------------------------------------------------
  // JWT_CLAIM_DESCRIPTIONS
  // ------------------------------------------------------------------
  describe('JWT_CLAIM_DESCRIPTIONS', () => {
    it('has all standard RFC 7519 claims', () => {
      expect(JWT_CLAIM_DESCRIPTIONS).toEqual(expect.objectContaining({
        iss: 'Issuer',
        sub: 'Subject',
        aud: 'Audience',
        exp: 'Expiration Time',
        nbf: 'Not Before',
        iat: 'Issued At',
        jti: 'JWT ID',
      }));
    });

    it('has common custom claims', () => {
      expect(JWT_CLAIM_DESCRIPTIONS).toEqual(expect.objectContaining({
        email: 'Email',
        name: 'Name',
        role: 'Role',
        scope: 'Scope',
        permissions: 'Permissions',
      }));
    });

    it('contains exactly the expected number of claims', () => {
      expect(Object.keys(JWT_CLAIM_DESCRIPTIONS)).toHaveLength(12);
    });
  });
});
