import { describe, it, expect } from 'vitest';
import { TokenAuthStrategy } from '../../../src/services/workspace/git/auth/TokenAuthStrategy';

// Enterprise-realistic tokens
const GITHUB_PAT = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
const GITLAB_TOKEN = 'glpat-xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456';
const BITBUCKET_TOKEN = 'ATBBc9gPq4XKr2hJmN5vWzYu8B0dFgH3kL6pQsSt';
const AZURE_PAT = 'vstsaccesstoken7hf4g3b2nk9jm8wp6xr1qy0e5d';
const GENERIC_TOKEN = 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc';

describe('TokenAuthStrategy', () => {
    const strategy = new TokenAuthStrategy();

    describe('validate()', () => {
        it('returns valid for GitHub PAT', () => {
            expect(strategy.validate({ token: GITHUB_PAT })).toEqual({ valid: true });
        });

        it('returns valid for GitLab token', () => {
            expect(strategy.validate({ token: GITLAB_TOKEN })).toEqual({ valid: true });
        });

        it('returns valid for Bitbucket app password', () => {
            expect(strategy.validate({ token: BITBUCKET_TOKEN })).toEqual({ valid: true });
        });

        it('returns valid for Azure DevOps PAT', () => {
            expect(strategy.validate({ token: AZURE_PAT })).toEqual({ valid: true });
        });

        it('returns error when token is undefined', () => {
            expect(strategy.validate({})).toEqual({
                valid: false,
                error: 'Access token is required',
            });
        });

        it('returns error when token is empty string', () => {
            expect(strategy.validate({ token: '' })).toEqual({
                valid: false,
                error: 'Access token is required',
            });
        });
    });

    describe('detectTokenType()', () => {
        it('detects github.com', () => {
            expect(strategy.detectTokenType('github.com')).toBe('github');
        });

        it('detects GitHub Enterprise Server (custom subdomain)', () => {
            expect(strategy.detectTokenType('github.openheaders.io')).toBe('github');
        });

        it('detects GitLab SaaS', () => {
            expect(strategy.detectTokenType('gitlab.com')).toBe('gitlab');
        });

        it('detects self-hosted GitLab', () => {
            expect(strategy.detectTokenType('gitlab.openheaders.io')).toBe('gitlab');
        });

        it('detects Bitbucket Cloud', () => {
            expect(strategy.detectTokenType('bitbucket.org')).toBe('bitbucket');
        });

        it('detects Bitbucket Server (self-hosted)', () => {
            expect(strategy.detectTokenType('bitbucket.openheaders.io')).toBe('bitbucket');
        });

        it('detects Azure DevOps', () => {
            expect(strategy.detectTokenType('dev.azure.com')).toBe('azure');
        });

        it('detects Visual Studio legacy URLs', () => {
            expect(strategy.detectTokenType('openheaders.visualstudio.com')).toBe('azure');
        });

        it('returns generic for Gitea / unknown hosts', () => {
            expect(strategy.detectTokenType('gitea.openheaders.io')).toBe('generic');
        });

        it('returns generic for bare IP addresses', () => {
            expect(strategy.detectTokenType('192.168.1.100')).toBe('generic');
        });
    });

    describe('getAuthUrl()', () => {
        it('GitHub: uses token as username with x-oauth-basic password', () => {
            const url = strategy.getAuthUrl(
                'https://github.com/OpenHeaders/open-headers-app.git',
                GITHUB_PAT,
                'github'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe(GITHUB_PAT);
            expect(parsed.password).toBe('x-oauth-basic');
            expect(parsed.pathname).toBe('/OpenHeaders/open-headers-app.git');
            expect(parsed.protocol).toBe('https:');
        });

        it('GitLab: uses oauth2 as username and token as password', () => {
            const url = strategy.getAuthUrl(
                'https://gitlab.openheaders.io/platform/shared-headers.git',
                GITLAB_TOKEN,
                'gitlab'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe('oauth2');
            expect(parsed.password).toBe(GITLAB_TOKEN);
            expect(parsed.hostname).toBe('gitlab.openheaders.io');
        });

        it('Bitbucket: uses x-token-auth as username', () => {
            const url = strategy.getAuthUrl(
                'https://bitbucket.org/OpenHeaders/open-headers-app.git',
                BITBUCKET_TOKEN,
                'bitbucket'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe('x-token-auth');
            expect(parsed.password).toBe(BITBUCKET_TOKEN);
        });

        it('Azure DevOps: uses token as password with "token" username', () => {
            const url = strategy.getAuthUrl(
                'https://dev.azure.com/OpenHeaders/SharedHeaders/_git/open-headers-app',
                AZURE_PAT,
                'azure'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe('token');
            expect(parsed.password).toBe(AZURE_PAT);
            expect(parsed.pathname).toBe('/OpenHeaders/SharedHeaders/_git/open-headers-app');
        });

        it('generic: uses token as password with "token" username', () => {
            const url = strategy.getAuthUrl(
                'https://gitea.openheaders.io/team/repo.git',
                GENERIC_TOKEN,
                'generic'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe('token');
            expect(parsed.password).toBe(GENERIC_TOKEN);
        });

        it('auto: detects token type from GitHub hostname', () => {
            const url = strategy.getAuthUrl(
                'https://github.com/OpenHeaders/open-headers-app.git',
                GITHUB_PAT,
                'auto'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe(GITHUB_PAT);
            expect(parsed.password).toBe('x-oauth-basic');
        });

        it('auto: detects token type from GitLab hostname', () => {
            const url = strategy.getAuthUrl(
                'https://gitlab.com/OpenHeaders/open-headers-app.git',
                GITLAB_TOKEN,
                'auto'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe('oauth2');
            expect(parsed.password).toBe(GITLAB_TOKEN);
        });

        it('preserves port numbers in the URL', () => {
            const url = strategy.getAuthUrl(
                'https://gitlab.openheaders.io:8443/platform/shared-headers.git',
                GITLAB_TOKEN,
                'gitlab'
            );
            const parsed = new URL(url);
            expect(parsed.port).toBe('8443');
            expect(parsed.username).toBe('oauth2');
        });

        it('handles URL with existing credentials (overwrites them)', () => {
            const url = strategy.getAuthUrl(
                'https://old-user:old-pass@github.com/OpenHeaders/open-headers-app.git',
                GITHUB_PAT,
                'github'
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe(GITHUB_PAT);
            expect(parsed.password).toBe('x-oauth-basic');
        });

        it('throws for malformed URL', () => {
            expect(() => strategy.getAuthUrl('not-a-valid-url', GITHUB_PAT, 'github'))
                .toThrow('Failed to parse Git URL');
        });

        it('throws for empty URL', () => {
            expect(() => strategy.getAuthUrl('', GITHUB_PAT, 'github'))
                .toThrow('Failed to parse Git URL');
        });

        it('defaults tokenType to auto when omitted', () => {
            const url = strategy.getAuthUrl(
                'https://github.com/OpenHeaders/open-headers-app.git',
                GITHUB_PAT
            );
            const parsed = new URL(url);
            expect(parsed.username).toBe(GITHUB_PAT);
            expect(parsed.password).toBe('x-oauth-basic');
        });
    });

    describe('setup()', () => {
        it('returns effectiveUrl with embedded token and process.env', async () => {
            const result = await strategy.setup(
                'https://github.com/OpenHeaders/open-headers-app.git',
                { token: GITHUB_PAT, tokenType: 'github' }
            );
            expect(result.effectiveUrl).toContain(GITHUB_PAT);
            expect(result.effectiveUrl).toContain('x-oauth-basic');
            expect(result.env).toBe(process.env);
        });

        it('defaults tokenType to auto when not specified', async () => {
            const result = await strategy.setup(
                'https://github.com/OpenHeaders/open-headers-app.git',
                { token: GITHUB_PAT }
            );
            const parsed = new URL(result.effectiveUrl);
            expect(parsed.username).toBe(GITHUB_PAT);
        });

        it('throws when token is undefined', async () => {
            await expect(
                strategy.setup('https://github.com/OpenHeaders/open-headers-app.git', {})
            ).rejects.toThrow('Access token is required');
        });

        it('throws when token is empty string', async () => {
            await expect(
                strategy.setup('https://github.com/OpenHeaders/open-headers-app.git', { token: '' })
            ).rejects.toThrow('Access token is required');
        });
    });
});
