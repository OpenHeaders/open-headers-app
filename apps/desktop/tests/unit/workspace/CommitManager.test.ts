import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitExecutor } from '../../../src/services/workspace/git/core/GitExecutor';
import { CommitManager } from '../../../src/services/workspace/git/operations/CommitManager';

function createMockExecutor() {
  const executor = new GitExecutor();
  const spy = vi.spyOn(executor, 'execute').mockResolvedValue({ stdout: '', stderr: '' });
  return { executor, spy };
}

describe('CommitManager', () => {
  let manager: CommitManager;
  let executeSpy: ReturnType<typeof createMockExecutor>['spy'];

  beforeEach(() => {
    const mock = createMockExecutor();
    manager = new CommitManager(mock.executor);
    executeSpy = mock.spy;
  });

  describe('generateCommitMessage()', () => {
    it('generates create message with workspace name', () => {
      const msg = manager.generateCommitMessage('create', 'OpenHeaders Staging Environment');
      expect(msg).toBe('feat: Create workspace configuration for OpenHeaders Staging Environment');
    });

    it('generates update message', () => {
      const msg = manager.generateCommitMessage('update', 'OpenHeaders Production');
      expect(msg).toBe('feat: Update workspace configuration for OpenHeaders Production');
    });

    it('generates sync message', () => {
      const msg = manager.generateCommitMessage('sync', 'OpenHeaders QA');
      expect(msg).toBe('sync: Synchronize workspace OpenHeaders QA');
    });

    it('generates auto-sync message', () => {
      const msg = manager.generateCommitMessage('auto-sync', 'OpenHeaders Dev');
      expect(msg).toBe('chore: Auto-sync workspace OpenHeaders Dev');
    });

    it('uses default template for unknown action', () => {
      const msg = manager.generateCommitMessage('custom-action', 'OpenHeaders Prod');
      expect(msg).toBe('chore: Update workspace OpenHeaders Prod');
    });
  });

  describe('generateAutoCommitMessage()', () => {
    it('includes modified count with enterprise file names', () => {
      const msg = manager.generateAutoCommitMessage({
        hasChanges: true,
        modified: ['config/open-headers.json', 'config/environments.json'],
        added: [],
        deleted: [],
        renamed: [],
        untracked: [],
      });
      expect(msg).toBe('chore: Auto-commit configuration changes (2 modified)');
    });

    it('includes added count', () => {
      const msg = manager.generateAutoCommitMessage({
        hasChanges: true,
        modified: [],
        added: ['.openheaders/workspaces/ws-staging/proxy-rules.json'],
        deleted: [],
        renamed: [],
        untracked: [],
      });
      expect(msg).toBe('chore: Auto-commit configuration changes (1 added)');
    });

    it('includes deleted count', () => {
      const msg = manager.generateAutoCommitMessage({
        hasChanges: true,
        modified: [],
        added: [],
        deleted: ['.openheaders/workspaces/ws-staging/old-rules.json'],
        renamed: [],
        untracked: [],
      });
      expect(msg).toBe('chore: Auto-commit configuration changes (1 deleted)');
    });

    it('combines multiple change types', () => {
      const msg = manager.generateAutoCommitMessage({
        hasChanges: true,
        modified: ['sources.json', 'rules.json', 'environments.json'],
        added: ['new-source.json'],
        deleted: ['deprecated-rule.json', 'old-env.json'],
        renamed: [],
        untracked: [],
      });
      expect(msg).toBe('chore: Auto-commit configuration changes (3 modified, 1 added, 2 deleted)');
    });

    it('generates message even when no recognized changes (empty summary)', () => {
      const msg = manager.generateAutoCommitMessage({
        hasChanges: true,
        modified: [],
        added: [],
        deleted: [],
        renamed: ['old.json'],
        untracked: ['temp.lock'],
      });
      expect(msg).toBe('chore: Auto-commit configuration changes ()');
    });
  });

  describe('escapeMessage()', () => {
    it('escapes double quotes', () => {
      expect(manager.escapeMessage('feat: Add "OAuth2 Bearer Token" source')).toBe(
        'feat: Add \\"OAuth2 Bearer Token\\" source',
      );
    });

    it('escapes dollar signs', () => {
      expect(manager.escapeMessage('fix: Handle $TOKEN variable')).toBe('fix: Handle \\$TOKEN variable');
    });

    it('escapes both quotes and dollar signs', () => {
      expect(manager.escapeMessage('Set "$API_KEY" to new value')).toBe('Set \\"\\$API_KEY\\" to new value');
    });

    it('returns unchanged string without special chars', () => {
      expect(manager.escapeMessage('chore: Update workspace configuration')).toBe(
        'chore: Update workspace configuration',
      );
    });
  });

  describe('getStatus()', () => {
    it('returns full status with enterprise file paths', async () => {
      executeSpy.mockResolvedValue({
        stdout: [
          'M  .openheaders/workspaces/ws-staging/sources.json',
          'A  .openheaders/workspaces/ws-staging/new-rules.json',
          'D  .openheaders/workspaces/ws-staging/old-env.json',
          '?? .openheaders/workspaces/ws-staging/temp.lock',
        ].join('\n'),
        stderr: '',
      });

      const status = await manager.getStatus('/repo');
      expect(status).toEqual({
        hasChanges: true,
        modified: ['.openheaders/workspaces/ws-staging/sources.json'],
        added: ['.openheaders/workspaces/ws-staging/new-rules.json'],
        deleted: ['.openheaders/workspaces/ws-staging/old-env.json'],
        renamed: [],
        untracked: ['.openheaders/workspaces/ws-staging/temp.lock'],
      });
    });

    it('returns clean status for no changes', async () => {
      executeSpy.mockResolvedValue({ stdout: '', stderr: '' });

      const status = await manager.getStatus('/repo');
      expect(status.hasChanges).toBe(false);
      expect(status.modified).toEqual([]);
      expect(status.added).toEqual([]);
      expect(status.deleted).toEqual([]);
      expect(status.untracked).toEqual([]);
    });
  });

  describe('createCommit()', () => {
    it('creates commit and returns hash', async () => {
      // commit
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // rev-parse HEAD
      executeSpy.mockResolvedValueOnce({ stdout: 'f7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9\n', stderr: '' });

      const result = await manager.createCommit('/repo', 'feat: Add staging OAuth2 source');
      expect(result).toEqual({
        hash: 'f7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
        message: 'feat: Add staging OAuth2 source',
      });
    });

    it('throws specific error when nothing to commit', async () => {
      executeSpy.mockRejectedValueOnce(new Error('nothing to commit, working tree clean'));

      await expect(manager.createCommit('/repo', 'test')).rejects.toThrow('No changes staged for commit');
    });
  });

  describe('stageFile()', () => {
    it('stages file with correct command', async () => {
      await manager.stageFile('/repo', 'config/open-headers.json');
      expect(executeSpy).toHaveBeenCalledWith('add "config/open-headers.json"', { cwd: '/repo' });
    });

    it('handles files with spaces in path', async () => {
      await manager.stageFile('/repo', 'OpenHeaders Config/staging tokens.json');
      expect(executeSpy).toHaveBeenCalledWith('add "OpenHeaders Config/staging tokens.json"', { cwd: '/repo' });
    });
  });

  describe('hasUncommittedChanges()', () => {
    it('returns true when status has changes', async () => {
      executeSpy.mockResolvedValue({ stdout: 'M  file.json\n', stderr: '' });
      expect(await manager.hasUncommittedChanges('/repo')).toBe(true);
    });

    it('returns false when status is clean', async () => {
      executeSpy.mockResolvedValue({ stdout: '', stderr: '' });
      expect(await manager.hasUncommittedChanges('/repo')).toBe(false);
    });
  });

  describe('getHistory()', () => {
    it('parses commit history with enterprise data', async () => {
      executeSpy.mockResolvedValue({
        stdout: [
          'f7a3b2c1|Jane Doe|jane.doe@openheaders.io|1706104800|feat: Add staging OAuth2 source',
          'abc12345|deploy-bot|deploy-bot@openheaders.io|1706101200|chore: Auto-sync workspace',
        ].join('\n'),
        stderr: '',
      });

      const history = await manager.getHistory('/repo', 2);
      expect(history).toEqual([
        {
          hash: 'f7a3b2c1',
          author: 'Jane Doe',
          email: 'jane.doe@openheaders.io',
          date: new Date(1706104800 * 1000),
          message: 'feat: Add staging OAuth2 source',
        },
        {
          hash: 'abc12345',
          author: 'deploy-bot',
          email: 'deploy-bot@openheaders.io',
          date: new Date(1706101200 * 1000),
          message: 'chore: Auto-sync workspace',
        },
      ]);
    });

    it('returns empty array on error', async () => {
      executeSpy.mockRejectedValue(new Error('not a git repository'));
      const history = await manager.getHistory('/nonexistent');
      expect(history).toEqual([]);
    });

    it('defaults to 10 commits', async () => {
      executeSpy.mockResolvedValue({ stdout: '', stderr: '' });
      await manager.getHistory('/repo');
      expect(executeSpy).toHaveBeenCalledWith('log -10 --pretty=format:"%H|%an|%ae|%at|%s"', { cwd: '/repo' });
    });
  });

  describe('commitConfiguration()', () => {
    it('throws when repoDir is missing', async () => {
      await expect(manager.commitConfiguration({ repoDir: '' })).rejects.toThrow('Repository directory is required');
    });

    it('throws when neither files nor configPaths are provided', async () => {
      await expect(manager.commitConfiguration({ repoDir: '/repo' })).rejects.toThrow('Invalid options');
    });

    it('commits files in direct file mode', async () => {
      const fs = await import('fs');
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      // ensureGitUser calls
      executeSpy.mockResolvedValueOnce({ stdout: 'Jane Doe\n', stderr: '' }); // user.name
      executeSpy.mockResolvedValueOnce({ stdout: 'jane@openheaders.io\n', stderr: '' }); // user.email
      // stage file
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // commit
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // rev-parse HEAD
      executeSpy.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

      const result = await manager.commitConfiguration({
        repoDir: '/repo',
        files: { 'config/open-headers.json': '{"sources":[]}' },
        message: 'feat: Initial workspace config',
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123');
      expect(result.files).toBe(1);

      vi.restoreAllMocks();
    });
  });

  describe('ensureGitUser()', () => {
    it('uses OpenHeaders defaults when no user is configured', async () => {
      // user.name empty
      executeSpy.mockResolvedValueOnce({ stdout: '\n', stderr: '' });
      // user.email empty
      executeSpy.mockResolvedValueOnce({ stdout: '\n', stderr: '' });
      // set user.name
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // set user.email
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await manager.ensureGitUser('/repo', null, null);

      expect(executeSpy).toHaveBeenCalledWith('config user.name "OpenHeaders User"', { cwd: '/repo' });
      expect(executeSpy).toHaveBeenCalledWith('config user.email "user@openheaders.io"', { cwd: '/repo' });
    });

    it('uses provided author and email when not configured', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '\n', stderr: '' });
      executeSpy.mockResolvedValueOnce({ stdout: '\n', stderr: '' });
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await manager.ensureGitUser('/repo', 'Jane Doe', 'jane.doe@openheaders.io');

      expect(executeSpy).toHaveBeenCalledWith('config user.name "Jane Doe"', { cwd: '/repo' });
      expect(executeSpy).toHaveBeenCalledWith('config user.email "jane.doe@openheaders.io"', { cwd: '/repo' });
    });
  });
});
