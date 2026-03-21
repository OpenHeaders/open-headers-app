import { describe, it, expect } from 'vitest';
import { GitErrorHandler, ERROR_TYPES } from '../../../src/services/workspace/git/utils/GitErrorHandler';

describe('GitErrorHandler', () => {
    const handler = new GitErrorHandler();

    describe('classifyError()', () => {
        it('classifies authentication errors', () => {
            expect(handler.classifyError(new Error('authentication failed for repo'))).toBe(ERROR_TYPES.AUTH_ERROR);
            expect(handler.classifyError(new Error('invalid username or password'))).toBe(ERROR_TYPES.AUTH_ERROR);
            expect(handler.classifyError(new Error('401 Unauthorized'))).toBe(ERROR_TYPES.AUTH_ERROR);
            expect(handler.classifyError(new Error('403 Forbidden'))).toBe(ERROR_TYPES.AUTH_ERROR);
        });

        it('classifies network errors', () => {
            expect(handler.classifyError(new Error('could not resolve host github.com'))).toBe(ERROR_TYPES.NETWORK_ERROR);
            expect(handler.classifyError(new Error('connection refused'))).toBe(ERROR_TYPES.NETWORK_ERROR);
            expect(handler.classifyError(new Error('connection timed out'))).toBe(ERROR_TYPES.NETWORK_ERROR);
        });

        it('classifies repository errors', () => {
            expect(handler.classifyError(new Error('repository not found'))).toBe(ERROR_TYPES.REPOSITORY_ERROR);
            expect(handler.classifyError(new Error('not a git repository'))).toBe(ERROR_TYPES.REPOSITORY_ERROR);
        });

        it('classifies branch errors', () => {
            expect(handler.classifyError(new Error("couldn't find remote ref feature-x"))).toBe(ERROR_TYPES.BRANCH_ERROR);
            expect(handler.classifyError(new Error("pathspec 'main' did not match"))).toBe(ERROR_TYPES.BRANCH_ERROR);
        });

        it('classifies conflict errors', () => {
            expect(handler.classifyError(new Error('merge conflict in file.txt'))).toBe(ERROR_TYPES.CONFLICT_ERROR);
            expect(handler.classifyError(new Error('automatic merge failed'))).toBe(ERROR_TYPES.CONFLICT_ERROR);
        });

        it('classifies permission errors', () => {
            expect(handler.classifyError(new Error('permission denied'))).toBe(ERROR_TYPES.PERMISSION_ERROR);
            expect(handler.classifyError(new Error('unable to create file'))).toBe(ERROR_TYPES.PERMISSION_ERROR);
        });

        it('classifies timeout errors by code', () => {
            const err = new Error('something happened') as Error & { code: string };
            err.code = 'ETIMEDOUT';
            expect(handler.classifyError(err)).toBe(ERROR_TYPES.TIMEOUT_ERROR);
        });

        it('classifies killed processes as timeout', () => {
            const err = new Error('process killed') as Error & { killed: boolean };
            err.killed = true;
            expect(handler.classifyError(err)).toBe(ERROR_TYPES.TIMEOUT_ERROR);
        });

        it('classifies git not found by code', () => {
            const err = new Error('git something failed') as Error & { code: string };
            err.code = 'ENOENT';
            expect(handler.classifyError(err)).toBe(ERROR_TYPES.GIT_NOT_FOUND);
        });

        it('returns UNKNOWN_ERROR for unrecognized errors', () => {
            expect(handler.classifyError(new Error('something completely different'))).toBe(ERROR_TYPES.UNKNOWN_ERROR);
        });
    });

    describe('isRetryable()', () => {
        it('network and timeout errors are retryable', () => {
            expect(handler.isRetryable(ERROR_TYPES.NETWORK_ERROR)).toBe(true);
            expect(handler.isRetryable(ERROR_TYPES.TIMEOUT_ERROR)).toBe(true);
        });

        it('auth, conflict, permission errors are not retryable', () => {
            expect(handler.isRetryable(ERROR_TYPES.AUTH_ERROR)).toBe(false);
            expect(handler.isRetryable(ERROR_TYPES.CONFLICT_ERROR)).toBe(false);
            expect(handler.isRetryable(ERROR_TYPES.PERMISSION_ERROR)).toBe(false);
        });
    });

    describe('requiresUserAction()', () => {
        it('auth, conflict, permission, git-not-found, invalid-url require user action', () => {
            expect(handler.requiresUserAction(ERROR_TYPES.AUTH_ERROR)).toBe(true);
            expect(handler.requiresUserAction(ERROR_TYPES.CONFLICT_ERROR)).toBe(true);
            expect(handler.requiresUserAction(ERROR_TYPES.PERMISSION_ERROR)).toBe(true);
            expect(handler.requiresUserAction(ERROR_TYPES.GIT_NOT_FOUND)).toBe(true);
            expect(handler.requiresUserAction(ERROR_TYPES.INVALID_URL)).toBe(true);
        });

        it('network and timeout do not require user action', () => {
            expect(handler.requiresUserAction(ERROR_TYPES.NETWORK_ERROR)).toBe(false);
            expect(handler.requiresUserAction(ERROR_TYPES.TIMEOUT_ERROR)).toBe(false);
        });
    });

    describe('handle()', () => {
        it('returns a complete HandledError object', () => {
            const result = handler.handle(new Error('authentication failed'));
            expect(result.type).toBe(ERROR_TYPES.AUTH_ERROR);
            expect(result.message).toContain('Authentication failed');
            expect(result.originalMessage).toBe('authentication failed');
            expect(result.recovery).toBeInstanceOf(Array);
            expect(result.recovery.length).toBeGreaterThan(0);
            expect(result.retryable).toBe(false);
            expect(result.requiresUserAction).toBe(true);
        });
    });

    describe('format()', () => {
        it('formats error with suggestions', () => {
            const handled = handler.handle(new Error('connection refused'));
            const formatted = handler.format(handled);
            expect(formatted).toContain('Error:');
            expect(formatted).toContain('Suggestions:');
            expect(formatted).toContain('try again');
        });
    });

    describe('createError()', () => {
        it('creates enhanced error with type and details', () => {
            const details = { original: 'orig', recovery: ['retry'], context: { operation: 'push', repoDir: '/tmp' } };
            const err = handler.createError('test msg', ERROR_TYPES.AUTH_ERROR, details);
            expect(err.message).toBe('test msg');
            expect(err.type).toBe(ERROR_TYPES.AUTH_ERROR);
            expect(err.details).toEqual(details);
            expect(err.timestamp).toBeDefined();
        });
    });
});
