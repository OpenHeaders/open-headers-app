import { describe, it, expect } from 'vitest';
import { GitAuthenticator } from '../../../src/services/workspace/git/auth/GitAuthenticator';

describe('GitAuthenticator', () => {
    const auth = new GitAuthenticator('/tmp/ssh-test');

    describe('setupAuth() with type "none"', () => {
        it('returns original URL and process env', async () => {
            const result = await auth.setupAuth('https://github.com/repo.git', 'none');
            expect(result.effectiveUrl).toBe('https://github.com/repo.git');
            expect(result.type).toBe('none');
        });

        it('handles empty string authType as none', async () => {
            const result = await auth.setupAuth('https://github.com/repo.git', '');
            expect(result.type).toBe('none');
        });
    });

    describe('setupAuth() with unknown type', () => {
        it('throws for unknown auth type', async () => {
            await expect(auth.setupAuth('https://github.com/repo.git', 'kerberos'))
                .rejects.toThrow('Unknown authentication type');
        });
    });

    describe('cleanup()', () => {
        it('does nothing for auth type "none"', async () => {
            await expect(auth.cleanup('none', {})).resolves.toBeUndefined();
        });

        it('does nothing for empty auth type', async () => {
            await expect(auth.cleanup('', {})).resolves.toBeUndefined();
        });
    });
});
