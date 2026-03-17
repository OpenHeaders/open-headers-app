import { describe, it, expect } from 'vitest';
import { BasicAuthStrategy } from '../../../../src/services/workspace/git/auth/BasicAuthStrategy';

describe('BasicAuthStrategy', () => {
    const strategy = new BasicAuthStrategy();

    describe('validate()', () => {
        it('returns valid when username and password provided', () => {
            expect(strategy.validate({ username: 'user', password: 'pass' })).toEqual({ valid: true });
        });

        it('returns error when username missing', () => {
            const result = strategy.validate({ password: 'pass' });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Username');
        });

        it('returns error when password missing', () => {
            const result = strategy.validate({ username: 'user' });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Password');
        });
    });

    describe('embedCredentials()', () => {
        it('embeds username and password into HTTPS URL', () => {
            const result = strategy.embedCredentials('https://github.com/owner/repo.git', 'user', 'pass');
            expect(result).toBe('https://user:pass@github.com/owner/repo.git');
        });

        it('encodes special characters in credentials', () => {
            const result = strategy.embedCredentials('https://github.com/owner/repo.git', 'user@org', 'p@ss!');
            expect(result).toContain('user%40org');
            expect(result).toContain('p%40ss!');
        });

        it('throws for invalid URL', () => {
            expect(() => strategy.embedCredentials('not-a-url', 'user', 'pass'))
                .toThrow('Failed to parse Git URL');
        });
    });

    describe('getSafeDisplayUrl()', () => {
        it('masks password in URL', () => {
            const result = strategy.getSafeDisplayUrl('https://github.com/owner/repo.git', 'user');
            expect(result).toContain('user');
            expect(result).toContain('***');
        });

        it('falls back for invalid URL', () => {
            const result = strategy.getSafeDisplayUrl('not-a-url', 'user');
            expect(result).toContain('with credentials');
        });
    });

    describe('setup()', () => {
        it('returns effectiveUrl with embedded credentials', async () => {
            const result = await strategy.setup('https://github.com/owner/repo.git', {
                username: 'user',
                password: 'pass'
            });
            expect(result.effectiveUrl).toContain('user:pass@');
        });

        it('throws when username is missing', async () => {
            await expect(strategy.setup('https://github.com/repo.git', { password: 'pass' }))
                .rejects.toThrow('Username and password are required');
        });

        it('throws when password is missing', async () => {
            await expect(strategy.setup('https://github.com/repo.git', { username: 'user' }))
                .rejects.toThrow('Username and password are required');
        });
    });
});
