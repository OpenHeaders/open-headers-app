import { describe, it, expect } from 'vitest';
import { SSHAuthStrategy } from '../../../src/services/workspace/git/auth/SSHAuthStrategy';

describe('SSHAuthStrategy', () => {
    const strategy = new SSHAuthStrategy('/tmp/ssh-test');

    describe('validate()', () => {
        it('returns valid for proper PEM key', () => {
            const result = strategy.validate({
                privateKey: '-----BEGIN RSA PRIVATE KEY-----\nbase64data\n-----END RSA PRIVATE KEY-----'
            });
            expect(result.valid).toBe(true);
        });

        it('returns error when private key missing', () => {
            const result = strategy.validate({});
            expect(result.valid).toBe(false);
            expect(result.error).toContain('private key');
        });

        it('returns error for invalid key format', () => {
            const result = strategy.validate({ privateKey: 'not a real key' });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid SSH key format');
        });

        it('accepts OpenSSH format keys', () => {
            const result = strategy.validate({
                privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nbase64data\n-----END OPENSSH PRIVATE KEY-----'
            });
            expect(result.valid).toBe(true);
        });
    });

    describe('extractHostname()', () => {
        it('extracts hostname from git@ URL', () => {
            expect(strategy.extractHostname('git@github.com:owner/repo.git')).toBe('github.com');
        });

        it('extracts hostname from HTTPS URL', () => {
            expect(strategy.extractHostname('https://github.com/owner/repo.git')).toBe('github.com');
        });

        it('throws for invalid URL', () => {
            expect(() => strategy.extractHostname('???')).toThrow('Failed to extract hostname');
        });
    });

    describe('convertToSshUrl()', () => {
        it('converts HTTPS URL to SSH format with custom host', () => {
            const result = strategy.convertToSshUrl('https://github.com/owner/repo.git', 'abc123');
            expect(result).toBe('git@abc123.git:owner/repo.git');
        });

        it('updates existing SSH URL with custom host', () => {
            const result = strategy.convertToSshUrl('git@github.com:owner/repo.git', 'abc123');
            expect(result).toBe('git@abc123.git:owner/repo.git');
        });

        it('strips .git suffix before re-adding', () => {
            const result = strategy.convertToSshUrl('https://github.com/owner/repo.git', 'hash');
            expect(result).toBe('git@hash.git:owner/repo.git');
        });

        it('throws for URL with insufficient path parts', () => {
            expect(() => strategy.convertToSshUrl('https://github.com/only-one', 'hash'))
                .toThrow('Invalid repository URL');
        });
    });
});
