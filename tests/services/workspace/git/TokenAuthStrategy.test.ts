import { describe, it, expect } from 'vitest';
import { TokenAuthStrategy } from '../../../../src/services/workspace/git/auth/TokenAuthStrategy';

describe('TokenAuthStrategy', () => {
    const strategy = new TokenAuthStrategy();

    describe('validate()', () => {
        it('returns valid when token provided', () => {
            expect(strategy.validate({ token: 'ghp_abc123' })).toEqual({ valid: true });
        });

        it('returns error when token missing', () => {
            const result = strategy.validate({});
            expect(result.valid).toBe(false);
            expect(result.error).toContain('token');
        });
    });

    describe('detectTokenType()', () => {
        it('detects github.com', () => {
            expect(strategy.detectTokenType('github.com')).toBe('github');
        });

        it('detects GitHub Enterprise', () => {
            expect(strategy.detectTokenType('github.mycompany.com')).toBe('github');
        });

        it('detects GitLab', () => {
            expect(strategy.detectTokenType('gitlab.com')).toBe('gitlab');
        });

        it('detects Bitbucket', () => {
            expect(strategy.detectTokenType('bitbucket.org')).toBe('bitbucket');
        });

        it('detects Azure DevOps', () => {
            expect(strategy.detectTokenType('dev.azure.com')).toBe('azure');
        });

        it('detects Visual Studio', () => {
            expect(strategy.detectTokenType('myorg.visualstudio.com')).toBe('azure');
        });

        it('returns generic for unknown hosts', () => {
            expect(strategy.detectTokenType('gitea.example.com')).toBe('generic');
        });
    });

    describe('getAuthUrl()', () => {
        it('uses token as username for GitHub', () => {
            const url = strategy.getAuthUrl('https://github.com/owner/repo.git', 'ghp_abc', 'github');
            const parsed = new URL(url);
            expect(parsed.username).toBe('ghp_abc');
            expect(parsed.password).toBe('x-oauth-basic');
        });

        it('uses oauth2 for GitLab', () => {
            const url = strategy.getAuthUrl('https://gitlab.com/owner/repo.git', 'glpat_abc', 'gitlab');
            const parsed = new URL(url);
            expect(parsed.username).toBe('oauth2');
            expect(parsed.password).toBe('glpat_abc');
        });

        it('uses x-token-auth for Bitbucket', () => {
            const url = strategy.getAuthUrl('https://bitbucket.org/owner/repo.git', 'tok123', 'bitbucket');
            const parsed = new URL(url);
            expect(parsed.username).toBe('x-token-auth');
            expect(parsed.password).toBe('tok123');
        });

        it('uses token as password for Azure', () => {
            const url = strategy.getAuthUrl('https://dev.azure.com/owner/repo', 'tok123', 'azure');
            const parsed = new URL(url);
            expect(parsed.username).toBe('token');
            expect(parsed.password).toBe('tok123');
        });

        it('uses token as password for generic', () => {
            const url = strategy.getAuthUrl('https://gitea.example.com/repo.git', 'tok', 'generic');
            const parsed = new URL(url);
            expect(parsed.username).toBe('token');
            expect(parsed.password).toBe('tok');
        });

        it('auto-detects token type from hostname', () => {
            const url = strategy.getAuthUrl('https://github.com/owner/repo.git', 'ghp_abc', 'auto');
            const parsed = new URL(url);
            expect(parsed.username).toBe('ghp_abc');
            expect(parsed.password).toBe('x-oauth-basic');
        });

        it('throws for invalid URL', () => {
            expect(() => strategy.getAuthUrl('not-a-url', 'tok', 'generic'))
                .toThrow('Failed to parse Git URL');
        });
    });

    describe('setup()', () => {
        it('returns effectiveUrl with token auth', async () => {
            const result = await strategy.setup('https://github.com/owner/repo.git', {
                token: 'ghp_abc123'
            });
            expect(result.effectiveUrl).toContain('ghp_abc123');
        });

        it('throws when token is missing', async () => {
            await expect(strategy.setup('https://github.com/repo.git', {}))
                .rejects.toThrow('Access token is required');
        });
    });
});
