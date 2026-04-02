import { describe, expect, it } from 'vitest';
import { COMMAND_TIMEOUT, GitExecutor } from '@/services/workspace/git/core/GitExecutor';

describe('GitExecutor', () => {
  describe('COMMAND_TIMEOUT constants', () => {
    it('has expected timeout values', () => {
      expect(COMMAND_TIMEOUT).toEqual({
        SHORT: 15000,
        MEDIUM: 30000,
        LONG: 60000,
      });
    });
  });

  describe('enhanceError()', () => {
    const executor = new GitExecutor();

    it('adds command to error', () => {
      const err = executor.enhanceError(new Error('failed'), 'git push origin main');
      expect(err.command).toBe('git push origin main');
      expect(err.message).toBe('failed');
    });

    it('classifies Permission denied as AUTH_ERROR with friendly message', () => {
      const err = executor.enhanceError(
        new Error('Permission denied (publickey).'),
        'git clone https://github.com/OpenHeaders/open-headers-app.git',
      );
      expect(err.type).toBe('AUTH_ERROR');
      expect(err.friendlyMessage).toContain('credentials');
      expect(err.command).toContain('OpenHeaders');
    });

    it('classifies Could not resolve host as NETWORK_ERROR', () => {
      const err = executor.enhanceError(new Error('Could not resolve host: gitlab.openheaders.io'), 'git fetch origin');
      expect(err.type).toBe('NETWORK_ERROR');
      expect(err.friendlyMessage).toContain('connect');
    });

    it('classifies Repository not found as REPO_NOT_FOUND', () => {
      const err = executor.enhanceError(
        new Error('Repository not found.'),
        'git clone https://github.com/OpenHeaders/private-repo.git',
      );
      expect(err.type).toBe('REPO_NOT_FOUND');
      expect(err.friendlyMessage).toContain('not found');
    });

    it('classifies branch not found as BRANCH_NOT_FOUND', () => {
      const err = executor.enhanceError(
        new Error("couldn't find remote ref workspace/staging-env"),
        'git fetch origin workspace/staging-env',
      );
      expect(err.type).toBe('BRANCH_NOT_FOUND');
      expect(err.friendlyMessage).toContain('Branch');
    });

    it('preserves error code, killed, and signal properties', () => {
      const original = new Error('process killed') as Error & { code: string; killed: boolean; signal: string };
      original.code = '128';
      original.killed = true;
      original.signal = 'SIGTERM';
      const enhanced = executor.enhanceError(original, 'git clone --depth 1');
      expect(enhanced.code).toBe('128');
      expect(enhanced.killed).toBe(true);
      expect(enhanced.signal).toBe('SIGTERM');
      expect(enhanced.originalError).toBe(original);
    });

    it('does not add type/friendlyMessage for unrecognized errors', () => {
      const err = executor.enhanceError(new Error('some unknown git error'), 'git status');
      expect(err.type).toBeUndefined();
      expect(err.friendlyMessage).toBeUndefined();
      expect(err.command).toBe('git status');
    });
  });

  describe('setGitPath()', () => {
    it('accepts macOS Homebrew git path', () => {
      const executor = new GitExecutor();
      executor.setGitPath('/opt/homebrew/bin/git');
      // No public getter, but we verify it doesn't throw
    });

    it('accepts Windows git path', () => {
      const executor = new GitExecutor();
      executor.setGitPath('C:\\Program Files\\Git\\cmd\\git.exe');
    });
  });

  describe('constructor', () => {
    it('accepts null gitPath (uses system default)', () => {
      const executor = new GitExecutor(null);
      // Should not throw
      expect(executor).toBeDefined();
    });

    it('accepts explicit gitPath', () => {
      const executor = new GitExecutor('/usr/local/bin/git');
      expect(executor).toBeDefined();
    });
  });
});
