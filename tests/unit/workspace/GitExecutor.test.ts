import { describe, it, expect } from 'vitest';
import { GitExecutor, COMMAND_TIMEOUT } from '../../../src/services/workspace/git/core/GitExecutor';

describe('GitExecutor', () => {
    describe('COMMAND_TIMEOUT constants', () => {
        it('has expected timeout values', () => {
            expect(COMMAND_TIMEOUT.SHORT).toBe(15000);
            expect(COMMAND_TIMEOUT.MEDIUM).toBe(30000);
            expect(COMMAND_TIMEOUT.LONG).toBe(60000);
        });
    });

    describe('enhanceError()', () => {
        const executor = new GitExecutor();

        it('adds command to error', () => {
            const err = executor.enhanceError(new Error('failed'), 'git push');
            expect(err.command).toBe('git push');
        });

        it('classifies Permission denied', () => {
            const err = executor.enhanceError(new Error('Permission denied (publickey)'), 'git clone');
            expect(err.type).toBe('AUTH_ERROR');
            expect(err.friendlyMessage).toContain('credentials');
        });

        it('classifies Could not resolve host', () => {
            const err = executor.enhanceError(new Error('Could not resolve host: github.com'), 'git clone');
            expect(err.type).toBe('NETWORK_ERROR');
        });

        it('classifies Repository not found', () => {
            const err = executor.enhanceError(new Error('Repository not found'), 'git clone');
            expect(err.type).toBe('REPO_NOT_FOUND');
        });

        it('classifies branch not found', () => {
            const err = executor.enhanceError(new Error("couldn't find remote ref main"), 'git fetch');
            expect(err.type).toBe('BRANCH_NOT_FOUND');
        });

        it('preserves error code and signal', () => {
            const original = new Error('killed') as Error & { code: string; killed: boolean; signal: string };
            original.code = '128';
            original.killed = true;
            original.signal = 'SIGTERM';
            const enhanced = executor.enhanceError(original, 'git clone');
            expect(enhanced.code).toBe('128');
            expect(enhanced.killed).toBe(true);
            expect(enhanced.signal).toBe('SIGTERM');
        });
    });

    describe('setGitPath()', () => {
        it('updates the git path', () => {
            const executor = new GitExecutor();
            executor.setGitPath('/usr/local/bin/git');
            // No public getter, but we verify it doesn't throw
        });
    });
});
