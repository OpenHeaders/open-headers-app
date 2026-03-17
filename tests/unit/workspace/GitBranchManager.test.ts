import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitBranchManager } from '../../../src/services/workspace/git/repository/GitBranchManager';

function createMockExecutor() {
    return {
        execute: vi.fn()
    };
}

describe('GitBranchManager', () => {
    let manager: GitBranchManager;
    let mockExecutor: ReturnType<typeof createMockExecutor>;

    beforeEach(() => {
        mockExecutor = createMockExecutor();
        manager = new GitBranchManager(mockExecutor as any);
    });

    // ------- getLocalBranches -------
    describe('getLocalBranches', () => {
        it('parses branches with current marker', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '* main\n  feature-1\n  feature-2\n'
            });

            const result = await manager.getLocalBranches('/repo');
            expect(result.current).toBe('main');
            expect(result.branches).toEqual(['main', 'feature-1', 'feature-2']);
        });

        it('parses single branch', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '* main\n'
            });

            const result = await manager.getLocalBranches('/repo');
            expect(result.current).toBe('main');
            expect(result.branches).toEqual(['main']);
        });

        it('handles no current branch marker', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '  branch-a\n  branch-b\n'
            });

            const result = await manager.getLocalBranches('/repo');
            expect(result.current).toBeNull();
            expect(result.branches).toEqual(['branch-a', 'branch-b']);
        });

        it('trims whitespace from branch names', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '*   main   \n    dev   \n'
            });

            const result = await manager.getLocalBranches('/repo');
            expect(result.current).toBe('main');
            expect(result.branches).toEqual(['main', 'dev']);
        });

        it('passes correct command to executor', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '* main\n' });
            await manager.getLocalBranches('/my/repo');
            expect(mockExecutor.execute).toHaveBeenCalledWith('branch', { cwd: '/my/repo' });
        });
    });

    // ------- getRemoteBranches -------
    describe('getRemoteBranches', () => {
        it('parses remote branches', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '  origin/main\n  origin/develop\n  origin/feature-1\n'
            });

            const result = await manager.getRemoteBranches('/repo');
            expect(result).toEqual(['origin/main', 'origin/develop', 'origin/feature-1']);
        });

        it('filters out HEAD entries', async () => {
            mockExecutor.execute.mockResolvedValue({
                stdout: '  origin/HEAD -> origin/main\n  origin/main\n  origin/develop\n'
            });

            const result = await manager.getRemoteBranches('/repo');
            expect(result).toEqual(['origin/main', 'origin/develop']);
        });

        it('handles empty remote branches', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '\n' });
            const result = await manager.getRemoteBranches('/repo');
            expect(result).toEqual([]);
        });

        it('passes correct command to executor', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '  origin/main\n' });
            await manager.getRemoteBranches('/repo');
            expect(mockExecutor.execute).toHaveBeenCalledWith('branch -r', { cwd: '/repo' });
        });
    });

    // ------- createBranch -------
    describe('createBranch', () => {
        it('creates branch from current HEAD', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.createBranch('/repo', 'new-feature');
            expect(result.success).toBe(true);
            expect(result.branch).toBe('new-feature');
            expect(result.message).toContain('new-feature');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'checkout -b new-feature',
                { cwd: '/repo' }
            );
        });

        it('creates branch from base branch', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.createBranch('/repo', 'new-feature', 'develop');
            expect(result.success).toBe(true);
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'checkout -b new-feature develop',
                { cwd: '/repo' }
            );
        });

        it('throws specific error when branch already exists', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('fatal: A branch named \'existing\' already exists'));
            await expect(manager.createBranch('/repo', 'existing')).rejects.toThrow("Branch 'existing' already exists");
        });

        it('re-throws other errors', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('unexpected error'));
            await expect(manager.createBranch('/repo', 'test')).rejects.toThrow('unexpected error');
        });
    });

    // ------- switchBranch -------
    describe('switchBranch', () => {
        it('switches to existing branch', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.switchBranch('/repo', 'develop');
            expect(result.success).toBe(true);
            expect(result.branch).toBe('develop');
            expect(result.message).toContain('develop');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'checkout develop',
                { cwd: '/repo' }
            );
        });

        it('throws specific error when branch does not exist', async () => {
            mockExecutor.execute.mockRejectedValue(new Error("error: pathspec 'nonexistent' did not match any file(s) known to git"));
            await expect(manager.switchBranch('/repo', 'nonexistent')).rejects.toThrow("Branch 'nonexistent' does not exist");
        });

        it('re-throws other errors', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('something else'));
            await expect(manager.switchBranch('/repo', 'test')).rejects.toThrow('something else');
        });
    });

    // ------- deleteBranch -------
    describe('deleteBranch', () => {
        it('deletes branch with -d flag by default', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.deleteBranch('/repo', 'old-feature');
            expect(result.success).toBe(true);
            expect(result.branch).toBe('old-feature');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'branch -d old-feature',
                { cwd: '/repo' }
            );
        });

        it('force deletes branch with -D flag', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.deleteBranch('/repo', 'old-feature', true);
            expect(result.success).toBe(true);
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'branch -D old-feature',
                { cwd: '/repo' }
            );
        });

        it('throws specific error for unmerged branches', async () => {
            mockExecutor.execute.mockRejectedValue(new Error("error: The branch 'unmerged' is not fully merged"));
            await expect(manager.deleteBranch('/repo', 'unmerged')).rejects.toThrow('has unmerged changes');
        });

        it('re-throws other errors', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('generic error'));
            await expect(manager.deleteBranch('/repo', 'test')).rejects.toThrow('generic error');
        });
    });

    // ------- branchExists -------
    describe('branchExists', () => {
        it('returns true when branch is in local branches', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '* main\n  develop\n  feature\n' });
            const result = await manager.branchExists('/repo', 'develop');
            expect(result).toBe(true);
        });

        it('returns false when branch is not in local branches', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '* main\n  develop\n' });
            const result = await manager.branchExists('/repo', 'nonexistent');
            expect(result).toBe(false);
        });

        it('returns false on error', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('error'));
            const result = await manager.branchExists('/repo', 'test');
            expect(result).toBe(false);
        });
    });

    // ------- remoteBranchExists -------
    describe('remoteBranchExists', () => {
        it('returns true when remote has the branch', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: 'abc123\trefs/heads/main\n' });
            const result = await manager.remoteBranchExists('/repo', 'main');
            expect(result).toBe(true);
        });

        it('returns false when remote does not have the branch', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            const result = await manager.remoteBranchExists('/repo', 'nonexistent');
            expect(result).toBe(false);
        });

        it('returns false on error', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('network error'));
            const result = await manager.remoteBranchExists('/repo', 'main');
            expect(result).toBe(false);
        });

        it('uses origin as default remote', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            await manager.remoteBranchExists('/repo', 'main');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'ls-remote --heads origin main',
                { cwd: '/repo', timeout: 15000 }
            );
        });

        it('uses custom remote name', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '' });
            await manager.remoteBranchExists('/repo', 'main', 'upstream');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'ls-remote --heads upstream main',
                { cwd: '/repo', timeout: 15000 }
            );
        });
    });

    // ------- listBranches -------
    describe('listBranches', () => {
        it('returns local branches only by default', async () => {
            mockExecutor.execute.mockResolvedValue({ stdout: '* main\n  develop\n' });
            const result = await manager.listBranches('/repo');
            expect(result.current).toBe('main');
            expect(result.local).toEqual(['main', 'develop']);
            expect(result.remote).toBeUndefined();
        });

        it('includes remote branches when requested', async () => {
            // First call for local branches
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '* main\n  develop\n' });
            // Second call for remote branches
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '  origin/main\n  origin/develop\n' });

            const result = await manager.listBranches('/repo', true);
            expect(result.current).toBe('main');
            expect(result.local).toEqual(['main', 'develop']);
            expect(result.remote).toEqual(['origin/main', 'origin/develop']);
        });

        it('throws when executor fails', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('git error'));
            await expect(manager.listBranches('/repo')).rejects.toThrow('git error');
        });
    });

    // ------- createWorkspaceBranch -------
    describe('createWorkspaceBranch', () => {
        it('creates workspace branch with workspace/ prefix', async () => {
            // branchExists check (getLocalBranches)
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '* main\n' });
            // createBranch
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '' });

            const branchName = await manager.createWorkspaceBranch('/repo', 'ws-123');
            expect(branchName).toBe('workspace/ws-123');
        });

        it('switches to existing workspace branch instead of creating', async () => {
            // branchExists check returns the branch exists
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '* main\n  workspace/ws-123\n' });
            // switchBranch
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '' });

            const branchName = await manager.createWorkspaceBranch('/repo', 'ws-123');
            expect(branchName).toBe('workspace/ws-123');
            // Should have called checkout (switch), not checkout -b (create)
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'checkout workspace/ws-123',
                { cwd: '/repo' }
            );
        });

        it('creates from base branch when specified', async () => {
            // branchExists check
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '* main\n' });
            // createBranch from base
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '' });

            const branchName = await manager.createWorkspaceBranch('/repo', 'ws-456', 'develop');
            expect(branchName).toBe('workspace/ws-456');
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                'checkout -b workspace/ws-456 develop',
                { cwd: '/repo' }
            );
        });
    });

    // ------- getBranchInfo -------
    describe('getBranchInfo', () => {
        it('parses branch info with upstream', async () => {
            // commitInfo
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'abc123|John Doe|john@example.com|1700000000|Initial commit'
            });
            // upstream
            mockExecutor.execute.mockResolvedValueOnce({ stdout: 'origin/main\n' });
            // ahead/behind counts
            mockExecutor.execute.mockResolvedValueOnce({ stdout: '2\t3\n' });

            const info = await manager.getBranchInfo('/repo', 'main');
            expect(info.name).toBe('main');
            expect(info.commit.hash).toBe('abc123');
            expect(info.commit.author).toBe('John Doe');
            expect(info.commit.email).toBe('john@example.com');
            expect(info.commit.message).toBe('Initial commit');
            expect(info.upstream).toBe('origin/main');
            expect(info.ahead).toBe(2);
            expect(info.behind).toBe(3);
        });

        it('handles branch without upstream', async () => {
            // commitInfo
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'def456|Jane|jane@example.com|1700001000|Add feature'
            });
            // upstream fails (no upstream configured)
            mockExecutor.execute.mockRejectedValueOnce(new Error('no upstream'));

            const info = await manager.getBranchInfo('/repo', 'feature');
            expect(info.name).toBe('feature');
            expect(info.upstream).toBeNull();
            expect(info.ahead).toBe(0);
            expect(info.behind).toBe(0);
        });

        it('handles commit count error gracefully', async () => {
            // commitInfo
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'abc|Author|email@test.com|1700000000|msg'
            });
            // upstream
            mockExecutor.execute.mockResolvedValueOnce({ stdout: 'origin/main\n' });
            // ahead/behind fails
            mockExecutor.execute.mockRejectedValueOnce(new Error('rev-list error'));

            const info = await manager.getBranchInfo('/repo', 'main');
            expect(info.ahead).toBe(0);
            expect(info.behind).toBe(0);
        });

        it('converts unix timestamp to Date', async () => {
            mockExecutor.execute.mockResolvedValueOnce({
                stdout: 'abc|Author|email@test.com|1700000000|msg'
            });
            mockExecutor.execute.mockRejectedValueOnce(new Error('no upstream'));

            const info = await manager.getBranchInfo('/repo', 'main');
            expect(info.commit.date).toBeInstanceOf(Date);
            expect(info.commit.date.getTime()).toBe(1700000000 * 1000);
        });

        it('throws when commit log fails', async () => {
            mockExecutor.execute.mockRejectedValue(new Error('branch not found'));
            await expect(manager.getBranchInfo('/repo', 'nonexistent')).rejects.toThrow('branch not found');
        });
    });
});
