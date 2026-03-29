import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitAuthenticator } from '../../../src/services/workspace/git/auth/GitAuthenticator';

type SetupAuthResult = Awaited<ReturnType<GitAuthenticator['setupAuth']>>;

function makeAuthResult(overrides: Partial<SetupAuthResult> = {}): SetupAuthResult {
  return {
    effectiveUrl: 'https://github.com/OpenHeaders/open-headers-app.git',
    env: process.env,
    type: 'none',
    ...overrides,
  };
}

const SSH_DIR = '/Users/jane.doe/.openheaders/ssh-keys';
const GITHUB_URL = 'https://github.com/OpenHeaders/open-headers-app.git';
const GITHUB_PAT = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';

describe('GitAuthenticator', () => {
  let auth: GitAuthenticator;

  beforeEach(() => {
    auth = new GitAuthenticator(SSH_DIR);
  });

  describe('setupAuth()', () => {
    describe('type "none"', () => {
      it('returns original URL, process env, and type "none"', async () => {
        const result = await auth.setupAuth(GITHUB_URL, 'none');
        expect(result).toEqual({
          effectiveUrl: GITHUB_URL,
          env: process.env,
          type: 'none',
        });
      });

      it('treats empty string authType as none', async () => {
        const result = await auth.setupAuth(GITHUB_URL, '');
        expect(result).toEqual({
          effectiveUrl: GITHUB_URL,
          env: process.env,
          type: 'none',
        });
      });

      it('defaults to none when authType is omitted', async () => {
        const result = await auth.setupAuth(GITHUB_URL);
        expect(result.type).toBe('none');
        expect(result.effectiveUrl).toBe(GITHUB_URL);
      });
    });

    describe('type "token"', () => {
      it('delegates to TokenAuthStrategy and returns type "token"', async () => {
        const result = await auth.setupAuth(GITHUB_URL, 'token', {
          token: GITHUB_PAT,
        });
        expect(result.type).toBe('token');
        expect(result.effectiveUrl).toContain(GITHUB_PAT);
        expect(result.env).toBe(process.env);
      });
    });

    describe('type "basic"', () => {
      it('delegates to BasicAuthStrategy and returns type "basic"', async () => {
        const result = await auth.setupAuth(GITHUB_URL, 'basic', {
          username: 'deploy-bot',
          password: 'secure-pass',
        });
        expect(result.type).toBe('basic');
        expect(result.effectiveUrl).toContain('deploy-bot');
        expect(result.effectiveUrl).toContain('secure-pass');
      });
    });

    describe('unknown type', () => {
      it('throws for unknown auth type "kerberos"', async () => {
        await expect(auth.setupAuth(GITHUB_URL, 'kerberos')).rejects.toThrow('Unknown authentication type: kerberos');
      });

      it('throws for unknown auth type "oauth"', async () => {
        await expect(auth.setupAuth(GITHUB_URL, 'oauth')).rejects.toThrow('Unknown authentication type: oauth');
      });
    });

    describe('error wrapping', () => {
      it('wraps strategy errors with auth type prefix', async () => {
        await expect(auth.setupAuth(GITHUB_URL, 'token', {})).rejects.toThrow('token authentication setup failed');
      });

      it('wraps basic auth missing creds error', async () => {
        await expect(auth.setupAuth(GITHUB_URL, 'basic', {})).rejects.toThrow('basic authentication setup failed');
      });
    });
  });

  describe('validateAuthData()', () => {
    it('returns valid for type "none"', () => {
      expect(auth.validateAuthData('none', {})).toEqual({ valid: true });
    });

    it('returns valid for empty string type', () => {
      expect(auth.validateAuthData('', {})).toEqual({ valid: true });
    });

    it('delegates token validation to TokenAuthStrategy', () => {
      expect(auth.validateAuthData('token', { token: GITHUB_PAT })).toEqual({
        valid: true,
      });
    });

    it('returns error for token type without token', () => {
      const result = auth.validateAuthData('token', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('token');
    });

    it('returns error for basic type without username', () => {
      const result = auth.validateAuthData('basic', { password: 'pass' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Username');
    });

    it('returns error for unknown auth type', () => {
      const result = auth.validateAuthData('kerberos', {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown authentication type');
    });
  });

  describe('cleanup()', () => {
    it('does nothing for type "none"', async () => {
      await expect(auth.cleanup('none', makeAuthResult())).resolves.toBeUndefined();
    });

    it('does nothing for empty string type', async () => {
      await expect(auth.cleanup('', makeAuthResult())).resolves.toBeUndefined();
    });

    it('calls cleanup on strategy if available', async () => {
      const cleanupFn = vi.fn().mockResolvedValue(undefined);
      const result = makeAuthResult({ type: 'ssh-key', cleanup: cleanupFn });
      await auth.cleanup('ssh-key', result);
      expect(cleanupFn).toHaveBeenCalledOnce();
    });

    it('does nothing for token type (no cleanup method on strategy)', async () => {
      const result = makeAuthResult({ type: 'token' });
      await expect(auth.cleanup('token', result)).resolves.toBeUndefined();
    });
  });

  describe('getSafeDisplayUrl()', () => {
    it('appends "(with token authentication)" for token type', () => {
      expect(auth.getSafeDisplayUrl(GITHUB_URL, 'token')).toBe(`${GITHUB_URL} (with token authentication)`);
    });

    it('appends "(with username/password)" for basic type', () => {
      expect(auth.getSafeDisplayUrl(GITHUB_URL, 'basic')).toBe(`${GITHUB_URL} (with username/password)`);
    });

    it('appends "(with SSH key)" for ssh-key type', () => {
      expect(auth.getSafeDisplayUrl(GITHUB_URL, 'ssh-key')).toBe(`${GITHUB_URL} (with SSH key)`);
    });

    it('returns plain URL for none type', () => {
      expect(auth.getSafeDisplayUrl(GITHUB_URL, 'none')).toBe(GITHUB_URL);
    });

    it('returns plain URL for unknown type', () => {
      expect(auth.getSafeDisplayUrl(GITHUB_URL, 'kerberos')).toBe(GITHUB_URL);
    });
  });
});
