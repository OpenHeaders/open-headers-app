import { describe, expect, it } from 'vitest';
import { ERROR_TYPES, GitErrorHandler } from '@/services/workspace/git/utils/GitErrorHandler';

describe('GitErrorHandler', () => {
  const handler = new GitErrorHandler();

  describe('classifyError()', () => {
    describe('AUTH_ERROR patterns', () => {
      const authMessages = [
        'authentication failed for https://github.com/OpenHeaders/open-headers-app.git',
        'invalid username or password',
        '401 Unauthorized',
        '403 Forbidden',
        'Permission denied (publickey)',
        'could not read from remote repository',
      ];
      authMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as AUTH_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.AUTH_ERROR);
        });
      });
    });

    describe('NETWORK_ERROR patterns', () => {
      const networkMessages = [
        'could not resolve host gitlab.openheaders.io',
        'network is unreachable',
        'connection refused',
        'connection timed out',
        'no route to host',
        'ssl certificate problem: unable to get local issuer certificate',
      ];
      networkMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as NETWORK_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.NETWORK_ERROR);
        });
      });
    });

    describe('REPOSITORY_ERROR patterns', () => {
      const repoMessages = [
        'repository not found',
        'does not exist',
        'not a git repository',
        'remote origin already exists',
        'fatal: bad object HEAD',
        'corrupted index file',
      ];
      repoMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as REPOSITORY_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.REPOSITORY_ERROR);
        });
      });
    });

    describe('BRANCH_ERROR patterns', () => {
      const branchMessages = [
        "couldn't find remote ref workspace/staging-env",
        'branch feature-x not found',
        "pathspec 'main' did not match any file(s) known to git",
        "refspec 'nonexistent' does not match any",
        'invalid branch name: --oops',
      ];
      branchMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as BRANCH_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.BRANCH_ERROR);
        });
      });
    });

    describe('CONFLICT_ERROR patterns', () => {
      const conflictMessages = [
        'merge conflict in config/open-headers.json',
        'automatic merge failed; fix conflicts and then commit',
        'you have unmerged paths',
        'fix conflicts and then commit the result',
      ];
      conflictMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as CONFLICT_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.CONFLICT_ERROR);
        });
      });
    });

    describe('PERMISSION_ERROR patterns', () => {
      const permissionMessages = [
        'permission denied',
        'access denied',
        'cannot create directory /etc/openheaders',
        'unable to create file config.json',
        'insufficient permission for adding an object',
        'operation not permitted',
      ];
      permissionMessages.forEach((msg) => {
        it(`classifies "${msg.substring(0, 50)}..." as PERMISSION_ERROR`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.PERMISSION_ERROR);
        });
      });
    });

    describe('TIMEOUT_ERROR patterns', () => {
      it('classifies "timeout" message as TIMEOUT_ERROR', () => {
        expect(handler.classifyError(new Error('git clone timeout'))).toBe(ERROR_TYPES.TIMEOUT_ERROR);
      });

      it('classifies ETIMEDOUT code as TIMEOUT_ERROR', () => {
        const err = new Error('something happened') as Error & { code: string };
        err.code = 'ETIMEDOUT';
        expect(handler.classifyError(err)).toBe(ERROR_TYPES.TIMEOUT_ERROR);
      });

      it('classifies killed process as TIMEOUT_ERROR', () => {
        const err = new Error('process was killed') as Error & { killed: boolean };
        err.killed = true;
        expect(handler.classifyError(err)).toBe(ERROR_TYPES.TIMEOUT_ERROR);
      });
    });

    describe('INVALID_URL patterns', () => {
      const urlMessages = ['invalid url: not-a-url', 'malformed url'];
      urlMessages.forEach((msg) => {
        it(`classifies "${msg}" as INVALID_URL`, () => {
          expect(handler.classifyError(new Error(msg))).toBe(ERROR_TYPES.INVALID_URL);
        });
      });
    });

    describe('GIT_NOT_FOUND patterns', () => {
      it('classifies "git not found" message', () => {
        expect(handler.classifyError(new Error('git not found in PATH'))).toBe(ERROR_TYPES.GIT_NOT_FOUND);
      });

      it('classifies ENOENT code with git in message', () => {
        const err = new Error('git: command failed') as Error & { code: string };
        err.code = 'ENOENT';
        expect(handler.classifyError(err)).toBe(ERROR_TYPES.GIT_NOT_FOUND);
      });
    });

    it('returns UNKNOWN_ERROR for unrecognized messages', () => {
      expect(handler.classifyError(new Error('something completely different'))).toBe(ERROR_TYPES.UNKNOWN_ERROR);
    });
  });

  describe('isRetryable()', () => {
    it('NETWORK_ERROR is retryable', () => {
      expect(handler.isRetryable(ERROR_TYPES.NETWORK_ERROR)).toBe(true);
    });

    it('TIMEOUT_ERROR is retryable', () => {
      expect(handler.isRetryable(ERROR_TYPES.TIMEOUT_ERROR)).toBe(true);
    });

    const nonRetryable = [
      ERROR_TYPES.AUTH_ERROR,
      ERROR_TYPES.REPOSITORY_ERROR,
      ERROR_TYPES.BRANCH_ERROR,
      ERROR_TYPES.CONFLICT_ERROR,
      ERROR_TYPES.PERMISSION_ERROR,
      ERROR_TYPES.INVALID_URL,
      ERROR_TYPES.GIT_NOT_FOUND,
      ERROR_TYPES.UNKNOWN_ERROR,
    ] as const;
    nonRetryable.forEach((type) => {
      it(`${type} is not retryable`, () => {
        expect(handler.isRetryable(type)).toBe(false);
      });
    });
  });

  describe('requiresUserAction()', () => {
    const requiresAction = [
      ERROR_TYPES.AUTH_ERROR,
      ERROR_TYPES.CONFLICT_ERROR,
      ERROR_TYPES.PERMISSION_ERROR,
      ERROR_TYPES.GIT_NOT_FOUND,
      ERROR_TYPES.INVALID_URL,
    ] as const;
    requiresAction.forEach((type) => {
      it(`${type} requires user action`, () => {
        expect(handler.requiresUserAction(type)).toBe(true);
      });
    });

    const noAction = [
      ERROR_TYPES.NETWORK_ERROR,
      ERROR_TYPES.TIMEOUT_ERROR,
      ERROR_TYPES.REPOSITORY_ERROR,
      ERROR_TYPES.BRANCH_ERROR,
      ERROR_TYPES.UNKNOWN_ERROR,
    ] as const;
    noAction.forEach((type) => {
      it(`${type} does not require user action`, () => {
        expect(handler.requiresUserAction(type)).toBe(false);
      });
    });
  });

  describe('handle()', () => {
    it('returns complete HandledError for auth failure', () => {
      const result = handler.handle(
        new Error('authentication failed for https://github.com/OpenHeaders/open-headers-app.git'),
        { operation: 'clone', url: 'https://github.com/OpenHeaders/open-headers-app.git' },
      );
      expect(result).toEqual({
        type: ERROR_TYPES.AUTH_ERROR,
        message: expect.stringContaining('Authentication failed'),
        originalMessage: expect.stringContaining('authentication failed'),
        recovery: expect.arrayContaining([expect.stringContaining('token')]),
        retryable: false,
        requiresUserAction: true,
        context: { operation: 'clone', url: 'https://github.com/OpenHeaders/open-headers-app.git' },
      });
    });

    it('includes branch name in BRANCH_ERROR message', () => {
      const result = handler.handle(new Error("couldn't find remote ref workspace/staging-env"), {
        branch: 'workspace/staging-env',
      });
      expect(result.type).toBe(ERROR_TYPES.BRANCH_ERROR);
      expect(result.message).toContain('workspace/staging-env');
    });

    it('returns default context when none provided', () => {
      const result = handler.handle(new Error('network is unreachable'));
      expect(result.context).toEqual({});
    });
  });

  describe('getFriendlyMessage()', () => {
    it('returns actionable message for every error type', () => {
      const allTypes = Object.values(ERROR_TYPES);
      for (const type of allTypes) {
        const msg = handler.getFriendlyMessage(type, new Error('test'), {});
        expect(msg.length).toBeGreaterThan(10);
      }
    });
  });

  describe('getRecoverySuggestions()', () => {
    it('returns non-empty suggestions for every error type', () => {
      const allTypes = Object.values(ERROR_TYPES);
      for (const type of allTypes) {
        const suggestions = handler.getRecoverySuggestions(type, {});
        expect(suggestions.length).toBeGreaterThan(0);
      }
    });

    it('includes branch name in BRANCH_ERROR recovery', () => {
      const suggestions = handler.getRecoverySuggestions(ERROR_TYPES.BRANCH_ERROR, {
        branch: 'workspace/prod-env',
      });
      expect(suggestions.some((s) => s.includes('workspace/prod-env'))).toBe(true);
    });
  });

  describe('format()', () => {
    it('formats error with suggestions and retryable hint', () => {
      const handled = handler.handle(new Error('connection refused'));
      const formatted = handler.format(handled);
      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Suggestions:');
      expect(formatted).toContain('try again');
    });

    it('formats non-retryable error without retry hint', () => {
      const handled = handler.handle(new Error('permission denied'));
      const formatted = handler.format(handled);
      expect(formatted).toContain('Error:');
      expect(formatted).not.toContain('temporary');
    });
  });

  describe('createError()', () => {
    it('creates enhanced error with type, details, and timestamp', () => {
      const details = {
        original: 'orig error',
        recovery: ['retry the operation'],
        context: { operation: 'push', repoDir: '/Users/jane.doe/.openheaders/workspace-sync/ws-abc123' },
      };
      const err = handler.createError('Push failed', ERROR_TYPES.AUTH_ERROR, details);
      expect(err.message).toBe('Push failed');
      expect(err.type).toBe(ERROR_TYPES.AUTH_ERROR);
      expect(err.details).toEqual(details);
      expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('wrapOperation()', () => {
    it('returns result on success', async () => {
      const result = await handler.wrapOperation(async () => 'ok');
      expect(result).toBe('ok');
    });

    it('wraps thrown error into enhanced error', async () => {
      await expect(
        handler.wrapOperation(
          async () => {
            throw new Error('authentication failed');
          },
          { operation: 'clone' },
        ),
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('logError()', () => {
    it('returns handled error', () => {
      const result = handler.logError(new Error('connection refused'), { operation: 'sync' });
      expect(result.type).toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(result.context.operation).toBe('sync');
    });
  });
});
