import { describe, it, expect } from 'vitest';
import { GitCleanupManager } from '../../../../src/services/workspace/git/utils/GitCleanupManager';

describe('GitCleanupManager (pure logic)', () => {
    const manager = new GitCleanupManager({
        tempDir: '/tmp/test-temp',
        sshDir: '/tmp/test-ssh'
    });

    describe('formatSize()', () => {
        it('formats bytes', () => {
            expect(manager.formatSize(500)).toBe('500.00 B');
        });

        it('formats kilobytes', () => {
            expect(manager.formatSize(1024)).toBe('1.00 KB');
        });

        it('formats megabytes', () => {
            expect(manager.formatSize(1024 * 1024)).toBe('1.00 MB');
        });

        it('formats gigabytes', () => {
            expect(manager.formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
        });

        it('formats fractional values', () => {
            expect(manager.formatSize(1536)).toBe('1.50 KB');
        });

        it('formats zero', () => {
            expect(manager.formatSize(0)).toBe('0.00 B');
        });
    });
});
