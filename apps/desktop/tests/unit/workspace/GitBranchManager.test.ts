import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitExecutor } from '@/services/workspace/git/core/GitExecutor';
import { GitBranchManager } from '@/services/workspace/git/repository/GitBranchManager';

function createMockExecutor() {
  const executor = new GitExecutor();
  const spy = vi.spyOn(executor, 'execute').mockResolvedValue({ stdout: '', stderr: '' });
  return { executor, execute: spy };
}

describe('GitBranchManager', () => {
  let manager: GitBranchManager;
  let mockExecute: ReturnType<typeof createMockExecutor>['execute'];

  beforeEach(() => {
    const mock = createMockExecutor();
    mockExecute = mock.execute;
    manager = new GitBranchManager(mock.executor);
  });

  // ------- getLocalBranches -------
  describe('getLocalBranches', () => {
    it('parses branches with current marker', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '* main\n  feature-1\n  feature-2\n',
      });

      const result = await manager.getLocalBranches('/repo');
      expect(result.current).toBe('main');
      expect(result.branches).toEqual(['main', 'feature-1', 'feature-2']);
    });

    it('parses single branch', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '* main\n',
      });

      const result = await manager.getLocalBranches('/repo');
      expect(result.current).toBe('main');
      expect(result.branches).toEqual(['main']);
    });

    it('handles no current branch marker', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '  branch-a\n  branch-b\n',
      });

      const result = await manager.getLocalBranches('/repo');
      expect(result.current).toBeNull();
      expect(result.branches).toEqual(['branch-a', 'branch-b']);
    });

    it('trims whitespace from branch names', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '*   main   \n    dev   \n',
      });

      const result = await manager.getLocalBranches('/repo');
      expect(result.current).toBe('main');
      expect(result.branches).toEqual(['main', 'dev']);
    });

    it('passes correct command to executor', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '* main\n' });
      await manager.getLocalBranches('/my/repo');
      expect(mockExecute).toHaveBeenCalledWith('branch', { cwd: '/my/repo' });
    });
  });

  // ------- getRemoteBranches -------
  describe('getRemoteBranches', () => {
    it('parses remote branches', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '  origin/main\n  origin/develop\n  origin/feature-1\n',
      });

      const result = await manager.getRemoteBranches('/repo');
      expect(result).toEqual(['origin/main', 'origin/develop', 'origin/feature-1']);
    });

    it('filters out HEAD entries', async () => {
      mockExecute.mockResolvedValue({
        stderr: '',
        stdout: '  origin/HEAD -> origin/main\n  origin/main\n  origin/develop\n',
      });

      const result = await manager.getRemoteBranches('/repo');
      expect(result).toEqual(['origin/main', 'origin/develop']);
    });

    it('handles empty remote branches', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '\n' });
      const result = await manager.getRemoteBranches('/repo');
      expect(result).toEqual([]);
    });

    it('passes correct command to executor', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '  origin/main\n' });
      await manager.getRemoteBranches('/repo');
      expect(mockExecute).toHaveBeenCalledWith('branch -r', { cwd: '/repo' });
    });
  });

  // ------- createBranch -------
  describe('createBranch', () => {
    it('creates branch from current HEAD', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.createBranch('/repo', 'new-feature');
      expect(result.success).toBe(true);
      expect(result.branch).toBe('new-feature');
      expect(result.message).toContain('new-feature');
      expect(mockExecute).toHaveBeenCalledWith('checkout -b new-feature', { cwd: '/repo' });
    });

    it('creates branch from base branch', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.createBranch('/repo', 'new-feature', 'develop');
      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith('checkout -b new-feature develop', { cwd: '/repo' });
    });

    it('throws specific error when branch already exists', async () => {
      mockExecute.mockRejectedValue(new Error("fatal: A branch named 'existing' already exists"));
      await expect(manager.createBranch('/repo', 'existing')).rejects.toThrow("Branch 'existing' already exists");
    });

    it('re-throws other errors', async () => {
      mockExecute.mockRejectedValue(new Error('unexpected error'));
      await expect(manager.createBranch('/repo', 'test')).rejects.toThrow('unexpected error');
    });
  });

  // ------- switchBranch -------
  describe('switchBranch', () => {
    it('switches to existing branch', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.switchBranch('/repo', 'develop');
      expect(result.success).toBe(true);
      expect(result.branch).toBe('develop');
      expect(result.message).toContain('develop');
      expect(mockExecute).toHaveBeenCalledWith('checkout develop', { cwd: '/repo' });
    });

    it('throws specific error when branch does not exist', async () => {
      mockExecute.mockRejectedValue(new Error("error: pathspec 'nonexistent' did not match any file(s) known to git"));
      await expect(manager.switchBranch('/repo', 'nonexistent')).rejects.toThrow("Branch 'nonexistent' does not exist");
    });

    it('re-throws other errors', async () => {
      mockExecute.mockRejectedValue(new Error('something else'));
      await expect(manager.switchBranch('/repo', 'test')).rejects.toThrow('something else');
    });
  });

  // ------- deleteBranch -------
  describe('deleteBranch', () => {
    it('deletes branch with -d flag by default', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.deleteBranch('/repo', 'old-feature');
      expect(result.success).toBe(true);
      expect(result.branch).toBe('old-feature');
      expect(mockExecute).toHaveBeenCalledWith('branch -d old-feature', { cwd: '/repo' });
    });

    it('force deletes branch with -D flag', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.deleteBranch('/repo', 'old-feature', true);
      expect(result.success).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith('branch -D old-feature', { cwd: '/repo' });
    });

    it('throws specific error for unmerged branches', async () => {
      mockExecute.mockRejectedValue(new Error("error: The branch 'unmerged' is not fully merged"));
      await expect(manager.deleteBranch('/repo', 'unmerged')).rejects.toThrow('has unmerged changes');
    });

    it('re-throws other errors', async () => {
      mockExecute.mockRejectedValue(new Error('generic error'));
      await expect(manager.deleteBranch('/repo', 'test')).rejects.toThrow('generic error');
    });
  });

  // ------- branchExists -------
  describe('branchExists', () => {
    it('returns true when branch is in local branches', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '* main\n  develop\n  feature\n' });
      const result = await manager.branchExists('/repo', 'develop');
      expect(result).toBe(true);
    });

    it('returns false when branch is not in local branches', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '* main\n  develop\n' });
      const result = await manager.branchExists('/repo', 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockExecute.mockRejectedValue(new Error('error'));
      const result = await manager.branchExists('/repo', 'test');
      expect(result).toBe(false);
    });
  });

  // ------- remoteBranchExists -------
  describe('remoteBranchExists', () => {
    it('returns true when remote has the branch', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: 'abc123\trefs/heads/main\n' });
      const result = await manager.remoteBranchExists('/repo', 'main');
      expect(result).toBe(true);
    });

    it('returns false when remote does not have the branch', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      const result = await manager.remoteBranchExists('/repo', 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockExecute.mockRejectedValue(new Error('network error'));
      const result = await manager.remoteBranchExists('/repo', 'main');
      expect(result).toBe(false);
    });

    it('uses origin as default remote', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      await manager.remoteBranchExists('/repo', 'main');
      expect(mockExecute).toHaveBeenCalledWith('ls-remote --heads origin main', { cwd: '/repo', timeout: 15000 });
    });

    it('uses custom remote name', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '' });
      await manager.remoteBranchExists('/repo', 'main', 'upstream');
      expect(mockExecute).toHaveBeenCalledWith('ls-remote --heads upstream main', { cwd: '/repo', timeout: 15000 });
    });
  });

  // ------- listBranches -------
  describe('listBranches', () => {
    it('returns local branches only by default', async () => {
      mockExecute.mockResolvedValue({ stderr: '', stdout: '* main\n  develop\n' });
      const result = await manager.listBranches('/repo');
      expect(result.current).toBe('main');
      expect(result.local).toEqual(['main', 'develop']);
      expect(result.remote).toBeUndefined();
    });

    it('includes remote branches when requested', async () => {
      // First call for local branches
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '* main\n  develop\n' });
      // Second call for remote branches
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '  origin/main\n  origin/develop\n' });

      const result = await manager.listBranches('/repo', true);
      expect(result.current).toBe('main');
      expect(result.local).toEqual(['main', 'develop']);
      expect(result.remote).toEqual(['origin/main', 'origin/develop']);
    });

    it('throws when executor fails', async () => {
      mockExecute.mockRejectedValue(new Error('git error'));
      await expect(manager.listBranches('/repo')).rejects.toThrow('git error');
    });
  });

  // ------- createWorkspaceBranch -------
  describe('createWorkspaceBranch', () => {
    it('creates workspace branch with workspace/ prefix', async () => {
      // branchExists check (getLocalBranches)
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '* main\n' });
      // createBranch
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '' });

      const branchName = await manager.createWorkspaceBranch('/repo', 'ws-123');
      expect(branchName).toBe('workspace/ws-123');
    });

    it('switches to existing workspace branch instead of creating', async () => {
      // branchExists check returns the branch exists
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '* main\n  workspace/ws-123\n' });
      // switchBranch
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '' });

      const branchName = await manager.createWorkspaceBranch('/repo', 'ws-123');
      expect(branchName).toBe('workspace/ws-123');
      // Should have called checkout (switch), not checkout -b (create)
      expect(mockExecute).toHaveBeenCalledWith('checkout workspace/ws-123', { cwd: '/repo' });
    });

    it('creates from base branch when specified', async () => {
      // branchExists check
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '* main\n' });
      // createBranch from base
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '' });

      const branchName = await manager.createWorkspaceBranch('/repo', 'ws-456', 'develop');
      expect(branchName).toBe('workspace/ws-456');
      expect(mockExecute).toHaveBeenCalledWith('checkout -b workspace/ws-456 develop', { cwd: '/repo' });
    });
  });

  // ------- getBranchInfo -------
  describe('getBranchInfo', () => {
    it('parses full branch info with upstream (enterprise workspace)', async () => {
      // commitInfo — enterprise-realistic data
      mockExecute.mockResolvedValueOnce({
        stderr: '',
        stdout:
          'f7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9|Jane Doe|jane.doe@openheaders.io|1706104800|feat: Add OAuth2 Bearer Token source for staging',
      });
      // upstream
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: 'origin/workspace/staging-env\n' });
      // ahead/behind counts
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: '2\t3\n' });

      const info = await manager.getBranchInfo('/repo', 'workspace/staging-env');
      expect(info).toEqual({
        name: 'workspace/staging-env',
        commit: {
          hash: 'f7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
          author: 'Jane Doe',
          email: 'jane.doe@openheaders.io',
          date: new Date(1706104800 * 1000),
          message: 'feat: Add OAuth2 Bearer Token source for staging',
        },
        upstream: 'origin/workspace/staging-env',
        ahead: 2,
        behind: 3,
      });
    });

    it('handles branch without upstream', async () => {
      mockExecute.mockResolvedValueOnce({
        stderr: '',
        stdout: 'def456abc123|deploy-bot|deploy-bot@openheaders.io|1706108400|chore: Auto-sync workspace',
      });
      mockExecute.mockRejectedValueOnce(new Error('no upstream'));

      const info = await manager.getBranchInfo('/repo', 'feature/new-headers');
      expect(info.name).toBe('feature/new-headers');
      expect(info.upstream).toBeNull();
      expect(info.ahead).toBe(0);
      expect(info.behind).toBe(0);
    });

    it('handles commit count error gracefully', async () => {
      mockExecute.mockResolvedValueOnce({
        stderr: '',
        stdout: 'abc123|deploy-bot|deploy-bot@openheaders.io|1706108400|sync',
      });
      mockExecute.mockResolvedValueOnce({ stderr: '', stdout: 'origin/main\n' });
      mockExecute.mockRejectedValueOnce(new Error('rev-list error'));

      const info = await manager.getBranchInfo('/repo', 'main');
      expect(info.ahead).toBe(0);
      expect(info.behind).toBe(0);
    });

    it('converts unix timestamp to Date', async () => {
      mockExecute.mockResolvedValueOnce({
        stderr: '',
        stdout: 'abc123|Author|user@openheaders.io|1700000000|msg',
      });
      mockExecute.mockRejectedValueOnce(new Error('no upstream'));

      const info = await manager.getBranchInfo('/repo', 'main');
      expect(info.commit.date).toBeInstanceOf(Date);
      expect(info.commit.date.getTime()).toBe(1700000000 * 1000);
    });

    it('throws when commit log fails', async () => {
      mockExecute.mockRejectedValue(new Error('branch not found'));
      await expect(manager.getBranchInfo('/repo', 'nonexistent')).rejects.toThrow('branch not found');
    });
  });
});
