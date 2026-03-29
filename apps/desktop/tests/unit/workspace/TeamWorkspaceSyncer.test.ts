import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamWorkspaceSyncer, SYNC_STATUS } from '../../../src/services/workspace/git/operations/TeamWorkspaceSyncer';

function createMockDependencies() {
    return {
        repositoryManager: {
            pullRepository: vi.fn().mockResolvedValue({ success: true, message: 'Pull successful' }),
            pushRepository: vi.fn().mockResolvedValue({ success: true, message: 'Push successful' }),
            getStatus: vi.fn().mockResolvedValue({
                branch: 'main',
                hasChanges: false,
                lastCommit: 'abc123',
                changes: {}
            })
        },
        branchManager: {},
        commitManager: {
            autoCommit: vi.fn().mockResolvedValue({ success: true })
        },
        configValidator: {
            loadJson: vi.fn().mockResolvedValue({ configPaths: {} }),
            validateAll: vi.fn().mockResolvedValue({ valid: true, errors: [] })
        },
        executor: {
            execute: vi.fn()
        }
    };
}

describe('TeamWorkspaceSyncer', () => {
    let syncer: TeamWorkspaceSyncer;
    let deps: ReturnType<typeof createMockDependencies>;

    beforeEach(() => {
        deps = createMockDependencies();
        syncer = new TeamWorkspaceSyncer(deps as unknown as ConstructorParameters<typeof TeamWorkspaceSyncer>[0]);
    });

    // ------- SYNC_STATUS constants -------
    describe('SYNC_STATUS', () => {
        it('has expected status values', () => {
            expect(SYNC_STATUS.UP_TO_DATE).toBe('up_to_date');
            expect(SYNC_STATUS.NEEDS_PULL).toBe('needs_pull');
            expect(SYNC_STATUS.NEEDS_PUSH).toBe('needs_push');
            expect(SYNC_STATUS.CONFLICT).toBe('conflict');
            expect(SYNC_STATUS.ERROR).toBe('error');
        });
    });

    // ------- hasLocalChanges -------
    describe('hasLocalChanges', () => {
        it('returns true when there are local changes', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: ' M file.txt\n' });
            const result = await syncer.hasLocalChanges('/repo');
            expect(result).toBe(true);
        });

        it('returns false when there are no local changes', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '' });
            const result = await syncer.hasLocalChanges('/repo');
            expect(result).toBe(false);
        });

        it('returns false when only whitespace in output', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '   \n  ' });
            const result = await syncer.hasLocalChanges('/repo');
            expect(result).toBe(false);
        });

        it('returns false on error', async () => {
            deps.executor.execute.mockRejectedValue(new Error('git error'));
            const result = await syncer.hasLocalChanges('/repo');
            expect(result).toBe(false);
        });

        it('calls executor with correct command', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '' });
            await syncer.hasLocalChanges('/my/repo');
            expect(deps.executor.execute).toHaveBeenCalledWith(
                'status --porcelain',
                { cwd: '/my/repo' }
            );
        });
    });

    // ------- getCommitCount -------
    describe('getCommitCount', () => {
        it('returns parsed commit count', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '5\n' });
            const count = await syncer.getCommitCount('/repo', 'HEAD..origin/main');
            expect(count).toBe(5);
        });

        it('returns 0 for empty output', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '' });
            const count = await syncer.getCommitCount('/repo', 'HEAD..origin/main');
            expect(count).toBe(0);
        });

        it('returns 0 on error', async () => {
            deps.executor.execute.mockRejectedValue(new Error('error'));
            const count = await syncer.getCommitCount('/repo', 'HEAD..origin/main');
            expect(count).toBe(0);
        });

        it('returns 0 for non-numeric output', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: 'abc\n' });
            const count = await syncer.getCommitCount('/repo', 'range');
            expect(count).toBe(0);
        });

        it('calls executor with correct command', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '3\n' });
            await syncer.getCommitCount('/repo', 'origin/main..HEAD');
            expect(deps.executor.execute).toHaveBeenCalledWith(
                'rev-list --count origin/main..HEAD',
                { cwd: '/repo' }
            );
        });
    });

    // ------- getLastSyncTime -------
    describe('getLastSyncTime', () => {
        it('returns Date for valid timestamp', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '1700000000\n' });
            const result = await syncer.getLastSyncTime('/repo');
            expect(result).toBeInstanceOf(Date);
            expect(result!.getTime()).toBe(1700000000 * 1000);
        });

        it('returns null when no sync commits found', async () => {
            deps.executor.execute.mockResolvedValue({ stdout: '' });
            const result = await syncer.getLastSyncTime('/repo');
            expect(result).toBeNull();
        });

        it('returns null on error', async () => {
            deps.executor.execute.mockRejectedValue(new Error('error'));
            const result = await syncer.getLastSyncTime('/repo');
            expect(result).toBeNull();
        });
    });

    // ------- checkSyncStatus -------
    describe('checkSyncStatus', () => {
        it('returns UP_TO_DATE when local and remote are same', async () => {
            // fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'abc123\n' });
            // rev-parse origin/branch
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'abc123\n' });

            const result = await syncer.checkSyncStatus('/repo', 'main');
            expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
            expect(result.localCommit).toBe('abc123');
            expect(result.remoteCommit).toBe('abc123');
        });

        it('returns NEEDS_PULL when local is behind remote', async () => {
            // fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'local-hash\n' });
            // rev-parse origin/branch
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'remote-hash\n' });
            // merge-base
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'local-hash\n' });
            // getCommitCount
            deps.executor.execute.mockResolvedValueOnce({ stdout: '3\n' });

            const result = await syncer.checkSyncStatus('/repo', 'main');
            expect(result.status).toBe(SYNC_STATUS.NEEDS_PULL);
            expect(result.behind).toBe(3);
        });

        it('returns NEEDS_PUSH when local is ahead of remote', async () => {
            // fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'local-hash\n' });
            // rev-parse origin/branch
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'remote-hash\n' });
            // merge-base matches remote
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'remote-hash\n' });
            // getCommitCount
            deps.executor.execute.mockResolvedValueOnce({ stdout: '2\n' });

            const result = await syncer.checkSyncStatus('/repo', 'main');
            expect(result.status).toBe(SYNC_STATUS.NEEDS_PUSH);
            expect(result.ahead).toBe(2);
        });

        it('returns CONFLICT when branches have diverged', async () => {
            // fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'local-hash\n' });
            // rev-parse origin/branch
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'remote-hash\n' });
            // merge-base is different from both
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'common-ancestor\n' });
            // ahead count
            deps.executor.execute.mockResolvedValueOnce({ stdout: '2\n' });
            // behind count
            deps.executor.execute.mockResolvedValueOnce({ stdout: '3\n' });

            const result = await syncer.checkSyncStatus('/repo', 'main');
            expect(result.status).toBe(SYNC_STATUS.CONFLICT);
            expect(result.ahead).toBe(2);
            expect(result.behind).toBe(3);
        });

        it('throws on fetch failure (infrastructure errors propagate)', async () => {
            deps.executor.execute.mockRejectedValue(new Error('network timeout'));

            await expect(syncer.checkSyncStatus('/repo', 'main'))
                .rejects.toThrow('network timeout');
        });

        it('retries fetch when branch not found on remote, then throws', async () => {
            // First fetch fails with missing ref
            deps.executor.execute.mockRejectedValueOnce(new Error("couldn't find remote ref main"));
            // Second fetch also fails
            deps.executor.execute.mockRejectedValueOnce(new Error("couldn't find remote ref main"));
            // Third fetch also fails - exhausts retries, throws
            deps.executor.execute.mockRejectedValueOnce(new Error("couldn't find remote ref main"));

            await expect(syncer.checkSyncStatus('/repo', 'main'))
                .rejects.toThrow("couldn't find remote ref main");
            // Should have tried 3 times
            expect(deps.executor.execute).toHaveBeenCalledTimes(3);
        });
    });

    // ------- handlePull -------
    describe('handlePull', () => {
        it('pulls and validates configuration', async () => {
            const progressCallback = vi.fn();
            const result = await syncer.handlePull({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.NEEDS_PULL, localCommit: 'local-abc', remoteCommit: 'remote-def', behind: 3 },
                progressCallback,
                path: 'config/'
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
            expect(result.changes).toBe(true);
            expect(result.pulled).toBe(3);
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ phase: 'pull' })
            );
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ phase: 'validate' })
            );
        });
    });

    // ------- handlePush -------
    describe('handlePush', () => {
        it('pushes commits and returns success', async () => {
            const progressCallback = vi.fn();
            const result = await syncer.handlePush({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.NEEDS_PUSH, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 2 },
                progressCallback
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
            expect(result.pushed).toBe(2);
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ phase: 'push' })
            );
        });
    });

    // ------- handleConflict -------
    describe('handleConflict', () => {
        it('returns requiresManualResolution when autoResolve is false', async () => {
            const result = await syncer.handleConflict({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.CONFLICT, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 1, behind: 2 },
                autoResolve: false,
                progressCallback: vi.fn()
            });

            expect(result.success).toBe(false);
            expect(result.status).toBe(SYNC_STATUS.CONFLICT);
            expect(result.requiresManualResolution).toBe(true);
            expect(result.ahead).toBe(1);
            expect(result.behind).toBe(2);
        });

        it('auto-resolves by rebasing when autoResolve is true', async () => {
            // hasLocalChanges - no changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // pull --rebase
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });

            const result = await syncer.handleConflict({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.CONFLICT, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 1, behind: 2 },
                autoResolve: true,
                progressCallback: vi.fn()
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
            expect(result.resolved).toBe(true);
        });

        it('stashes local changes during auto-resolve', async () => {
            // hasLocalChanges - has changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: ' M file.txt\n' });
            // stash push
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // pull --rebase
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // stash pop
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });

            const result = await syncer.handleConflict({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: { env: {} },
                status: { status: SYNC_STATUS.CONFLICT, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 1, behind: 1 },
                autoResolve: true,
                progressCallback: vi.fn()
            });

            expect(result.success).toBe(true);
            expect(result.resolved).toBe(true);
        });

        it('returns conflict status and aborts rebase when auto-resolve fails', async () => {
            // hasLocalChanges — no changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // pull --rebase fails
            deps.executor.execute.mockRejectedValueOnce(new Error('CONFLICT: merge conflict'));
            // rebase --abort (cleanup)
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });

            const result = await syncer.handleConflict({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.CONFLICT, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 1, behind: 1 },
                autoResolve: true,
                progressCallback: vi.fn()
            });

            expect(result.success).toBe(false);
            expect(result.status).toBe(SYNC_STATUS.CONFLICT);
            expect(result.requiresManualResolution).toBe(true);
            // Verify rebase was aborted to restore clean state
            expect(deps.executor.execute).toHaveBeenCalledWith(
                'rebase --abort',
                { cwd: '/repo' }
            );
        });

        it('aborts rebase and restores stash when auto-resolve fails with stashed changes', async () => {
            // hasLocalChanges — has changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: ' M config.json\n' });
            // stash push
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // pull --rebase fails
            deps.executor.execute.mockRejectedValueOnce(new Error('CONFLICT: merge conflict'));
            // rebase --abort (cleanup)
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // stash pop (restore)
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });

            const result = await syncer.handleConflict({
                repoDir: '/repo',
                branch: 'main',
                authType: 'none',
                authData: {},
                status: { status: SYNC_STATUS.CONFLICT, localCommit: 'local-abc', remoteCommit: 'remote-def', ahead: 1, behind: 1 },
                autoResolve: true,
                progressCallback: vi.fn()
            });

            expect(result.success).toBe(false);
            expect(result.requiresManualResolution).toBe(true);
            // Verify cleanup: rebase aborted, then stash restored
            const executeCalls = deps.executor.execute.mock.calls.map(c => c[0]);
            expect(executeCalls).toContain('rebase --abort');
            expect(executeCalls).toContain('stash pop');
        });
    });

    // ------- syncWorkspace -------
    describe('syncWorkspace', () => {
        it('returns up-to-date when no changes needed', async () => {
            // Mock checkSyncStatus to return UP_TO_DATE
            // fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'same-hash\n' });
            // rev-parse origin/main
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'same-hash\n' });

            const result = await syncer.syncWorkspace({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                workspaceName: 'OpenHeaders Staging Environment',
                repoDir: '/repo',
                branch: 'main'
            });

            expect(result.success).toBe(true);
            expect(result.status).toBe(SYNC_STATUS.UP_TO_DATE);
            expect(result.changes).toBe(false);
        });

        it('returns error with original message when sync fails', async () => {
            deps.executor.execute.mockRejectedValue(new Error('fatal: SSL connection timeout'));

            const result = await syncer.syncWorkspace({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main'
            });

            expect(result.success).toBe(false);
            expect(result.status).toBe(SYNC_STATUS.ERROR);
            // checkSyncStatus now throws, syncWorkspace's catch preserves the original error
            expect(result.message).toBe('fatal: SSL connection timeout');
            expect(result.error).toBe('fatal: SSL connection timeout');
        });

        it('calls progressCallback during sync', async () => {
            // UP_TO_DATE path
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });

            const progressCallback = vi.fn();
            await syncer.syncWorkspace({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main',
                progressCallback
            });

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({ phase: 'status' })
            );
        });
    });

    // ------- autoSync -------
    describe('autoSync', () => {
        it('commits local changes before syncing', async () => {
            // hasLocalChanges - has changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: ' M config.json\n' });
            // checkSyncStatus - fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });
            // rev-parse origin/main
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });

            const result = await syncer.autoSync({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main'
            });

            expect(deps.commitManager.autoCommit).toHaveBeenCalled();
            expect(result.autoSync).toBe(true);
            expect(result.localChangesCommitted).toBe(true);
        });

        it('skips commit when no local changes', async () => {
            // hasLocalChanges - no changes
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // checkSyncStatus - fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });
            // rev-parse origin/main
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });

            const result = await syncer.autoSync({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main'
            });

            expect(deps.commitManager.autoCommit).not.toHaveBeenCalled();
            expect(result.localChangesCommitted).toBe(false);
        });

        it('skips commit when commitChanges is false', async () => {
            // hasLocalChanges
            deps.executor.execute.mockResolvedValueOnce({ stdout: ' M file.txt\n' });
            // checkSyncStatus - fetch
            deps.executor.execute.mockResolvedValueOnce({ stdout: '' });
            // rev-parse HEAD
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });
            // rev-parse origin/main
            deps.executor.execute.mockResolvedValueOnce({ stdout: 'hash\n' });

            const result = await syncer.autoSync({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main',
                commitChanges: false
            });

            expect(deps.commitManager.autoCommit).not.toHaveBeenCalled();
            expect(result.localChangesCommitted).toBe(false);
        });

        it('returns error status when auto-sync fails', async () => {
            deps.executor.execute.mockRejectedValue(new Error('auto-sync error'));

            const result = await syncer.autoSync({
                workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                repoDir: '/repo',
                branch: 'main'
            });

            expect(result.success).toBe(false);
            expect(result.status).toBe(SYNC_STATUS.ERROR);
            expect(result.autoSync).toBe(true);
        });
    });

    // ------- validateWorkspaceConfig -------
    describe('validateWorkspaceConfig', () => {
        it('returns invalid when metadata file is not found', async () => {
            // findMetadataFile will return null since glob won't match
            const result = await syncer.validateWorkspaceConfig('/repo');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Workspace metadata not found');
        });
    });

    // ------- findMetadataFile -------
    describe('findMetadataFile', () => {
        it('returns null when no metadata file found', async () => {
            const result = await syncer.findMetadataFile('/nonexistent/repo');
            expect(result).toBeNull();
        });
    });

    // ------- getSyncStats -------
    describe('getSyncStats', () => {
        it('returns stats from repository manager', async () => {
            deps.repositoryManager.getStatus.mockResolvedValue({
                branch: 'main',
                hasChanges: true,
                lastCommit: 'abc123',
                changes: { modified: ['a.json'] }
            });

            // getLastSyncTime
            deps.executor.execute.mockResolvedValue({ stdout: '1700000000\n' });

            const stats = await syncer.getSyncStats('/repo');
            expect(stats.branch).toBe('main');
            expect(stats.hasLocalChanges).toBe(true);
            expect(stats.lastCommit).toBe('abc123');
            expect(stats.lastSync).toBeInstanceOf(Date);
        });

        it('returns error on failure', async () => {
            deps.repositoryManager.getStatus.mockRejectedValue(new Error('status error'));

            const stats = await syncer.getSyncStats('/repo');
            expect(stats.error).toBe('status error');
        });
    });

    // ------- loadWorkspaceConfig -------
    describe('loadWorkspaceConfig', () => {
        it('returns null when no config files found', async () => {
            const result = await syncer.loadWorkspaceConfig('/nonexistent/repo', 'config/');
            expect(result).toBeNull();
        });

        it('returns null on error', async () => {
            // The method catches errors internally
            const result = await syncer.loadWorkspaceConfig('/repo', 'config/');
            expect(result).toBeNull();
        });
    });
});
