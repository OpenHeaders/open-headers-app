import { describe, expect, it } from 'vitest';
import { CLEANUP_POLICIES, GitCleanupManager } from '@/services/workspace/git/utils/GitCleanupManager';

describe('GitCleanupManager', () => {
  const TEMP_DIR = '/Users/jane.doe/.openheaders/workspace-sync';
  const SSH_DIR = '/Users/jane.doe/.openheaders/ssh-keys';

  describe('CLEANUP_POLICIES constants', () => {
    it('has expected policy values', () => {
      expect(CLEANUP_POLICIES).toEqual({
        TEMP_FILE_AGE: 24 * 60 * 60 * 1000,
        OLD_REPO_AGE: 7 * 24 * 60 * 60 * 1000,
        SSH_KEY_AGE: 30 * 24 * 60 * 60 * 1000,
        MAX_TEMP_SIZE: 1024 * 1024 * 1024,
      });
    });

    it('TEMP_FILE_AGE is 24 hours', () => {
      expect(CLEANUP_POLICIES.TEMP_FILE_AGE).toBe(86400000);
    });

    it('OLD_REPO_AGE is 7 days', () => {
      expect(CLEANUP_POLICIES.OLD_REPO_AGE).toBe(604800000);
    });

    it('SSH_KEY_AGE is 30 days', () => {
      expect(CLEANUP_POLICIES.SSH_KEY_AGE).toBe(2592000000);
    });

    it('MAX_TEMP_SIZE is 1 GB', () => {
      expect(CLEANUP_POLICIES.MAX_TEMP_SIZE).toBe(1073741824);
    });
  });

  describe('formatSize()', () => {
    const manager = new GitCleanupManager({ tempDir: TEMP_DIR, sshDir: SSH_DIR });

    it('formats zero bytes', () => {
      expect(manager.formatSize(0)).toBe('0.00 B');
    });

    it('formats bytes below 1 KB', () => {
      expect(manager.formatSize(500)).toBe('500.00 B');
    });

    it('formats exactly 1 KB', () => {
      expect(manager.formatSize(1024)).toBe('1.00 KB');
    });

    it('formats fractional KB', () => {
      expect(manager.formatSize(1536)).toBe('1.50 KB');
    });

    it('formats exactly 1 MB', () => {
      expect(manager.formatSize(1024 * 1024)).toBe('1.00 MB');
    });

    it('formats exactly 1 GB', () => {
      expect(manager.formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('formats large values in GB (5.5 GB)', () => {
      expect(manager.formatSize(5.5 * 1024 * 1024 * 1024)).toBe('5.50 GB');
    });

    it('formats realistic repo size (45 MB)', () => {
      expect(manager.formatSize(45 * 1024 * 1024)).toBe('45.00 MB');
    });

    it('formats realistic SSH key size (3.2 KB)', () => {
      expect(manager.formatSize(3277)).toBe('3.20 KB');
    });

    it('formats 1 byte', () => {
      expect(manager.formatSize(1)).toBe('1.00 B');
    });

    it('formats 1023 bytes (just under 1 KB)', () => {
      expect(manager.formatSize(1023)).toBe('1023.00 B');
    });

    it('formats boundary between MB and GB', () => {
      expect(manager.formatSize(1023 * 1024 * 1024)).toBe('1023.00 MB');
    });
  });

  describe('constructor', () => {
    it('accepts cleanup paths', () => {
      const manager = new GitCleanupManager({ tempDir: TEMP_DIR, sshDir: SSH_DIR });
      expect(manager).toBeDefined();
    });

    it('accepts paths with spaces', () => {
      const manager = new GitCleanupManager({
        tempDir: '/Users/Jane Doe/Library/Application Support/OpenHeaders/workspace-sync',
        sshDir: '/Users/Jane Doe/Library/Application Support/OpenHeaders/ssh-keys',
      });
      expect(manager).toBeDefined();
    });
  });
});
