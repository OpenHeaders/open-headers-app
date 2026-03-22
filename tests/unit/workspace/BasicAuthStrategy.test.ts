import { describe, it, expect } from 'vitest';
import { BasicAuthStrategy } from '../../../src/services/workspace/git/auth/BasicAuthStrategy';

describe('BasicAuthStrategy', () => {
    const strategy = new BasicAuthStrategy();

    describe('validate()', () => {
        it('returns valid when username and password provided', () => {
            expect(strategy.validate({
                username: 'deploy-bot@openheaders.io',
                password: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
            })).toEqual({ valid: true });
        });

        it('returns error when username missing', () => {
            expect(strategy.validate({ password: 'pass' })).toEqual({
                valid: false,
                error: 'Username is required',
            });
        });

        it('returns error when password missing', () => {
            expect(strategy.validate({ username: 'user' })).toEqual({
                valid: false,
                error: 'Password is required',
            });
        });

        it('returns error when both missing', () => {
            const result = strategy.validate({});
            expect(result.valid).toBe(false);
        });
    });

    describe('embedCredentials()', () => {
        it('embeds username and password into HTTPS URL', () => {
            const result = strategy.embedCredentials(
                'https://gitlab.openheaders.io/platform/shared-headers.git',
                'deploy-bot',
                'secure-password-123'
            );
            expect(result).toBe(
                'https://deploy-bot:secure-password-123@gitlab.openheaders.io/platform/shared-headers.git'
            );
        });

        it('URL-encodes @ in username', () => {
            const result = strategy.embedCredentials(
                'https://gitlab.openheaders.io/platform/shared-headers.git',
                'deploy-bot@openheaders.io',
                'p@ss'
            );
            const parsed = new URL(result);
            expect(parsed.username).toBe('deploy-bot%40openheaders.io');
            expect(parsed.password).toBe('p%40ss');
        });

        it('URL-encodes special characters in password (!, #, $, %, &, +, =)', () => {
            const result = strategy.embedCredentials(
                'https://gitlab.openheaders.io/repo.git',
                'user',
                'P@ss!w0rd#123$%&+=end'
            );
            const parsed = new URL(result);
            // decodeURIComponent should recover the original password
            expect(decodeURIComponent(parsed.password)).toBe('P@ss!w0rd#123$%&+=end');
        });

        it('handles Unicode characters in credentials', () => {
            const result = strategy.embedCredentials(
                'https://gitlab.openheaders.io/repo.git',
                'müller',
                'pässwörd'
            );
            const parsed = new URL(result);
            expect(decodeURIComponent(parsed.username)).toBe('müller');
            expect(decodeURIComponent(parsed.password)).toBe('pässwörd');
        });

        it('preserves port in URL', () => {
            const result = strategy.embedCredentials(
                'https://gitlab.openheaders.io:8443/platform/shared-headers.git',
                'deploy-bot',
                'pass'
            );
            const parsed = new URL(result);
            expect(parsed.port).toBe('8443');
            expect(parsed.username).toBe('deploy-bot');
        });

        it('overwrites existing credentials in URL', () => {
            const result = strategy.embedCredentials(
                'https://old:creds@gitlab.openheaders.io/repo.git',
                'new-user',
                'new-pass'
            );
            const parsed = new URL(result);
            expect(parsed.username).toBe('new-user');
            expect(parsed.password).toBe('new-pass');
        });

        it('throws for invalid URL', () => {
            expect(() => strategy.embedCredentials('not-a-url', 'user', 'pass'))
                .toThrow('Failed to parse Git URL');
        });
    });

    describe('getSafeDisplayUrl()', () => {
        it('masks password with *** in URL', () => {
            const result = strategy.getSafeDisplayUrl(
                'https://gitlab.openheaders.io/platform/shared-headers.git',
                'deploy-bot'
            );
            expect(result).toContain('deploy-bot');
            expect(result).toContain('***');
            expect(result).not.toContain('password');
        });

        it('falls back gracefully for invalid URL', () => {
            const result = strategy.getSafeDisplayUrl('not-a-url', 'deploy-bot');
            expect(result).toContain('with credentials');
        });
    });

    describe('setup()', () => {
        it('returns effectiveUrl with embedded credentials and process.env', async () => {
            const result = await strategy.setup(
                'https://gitlab.openheaders.io/platform/shared-headers.git',
                { username: 'deploy-bot', password: 'ghp_aBcDeFgHiJkLmNoPqRsT' }
            );
            expect(result.effectiveUrl).toContain('deploy-bot');
            expect(result.effectiveUrl).toContain('ghp_aBcDeFgHiJkLmNoPqRsT');
            expect(result.env).toBe(process.env);
        });

        it('throws when username is missing', async () => {
            await expect(
                strategy.setup('https://gitlab.openheaders.io/repo.git', { password: 'pass' })
            ).rejects.toThrow('Username and password are required');
        });

        it('throws when password is missing', async () => {
            await expect(
                strategy.setup('https://gitlab.openheaders.io/repo.git', { username: 'user' })
            ).rejects.toThrow('Username and password are required');
        });

        it('throws when both missing', async () => {
            await expect(
                strategy.setup('https://gitlab.openheaders.io/repo.git', {})
            ).rejects.toThrow('Username and password are required');
        });
    });
});
