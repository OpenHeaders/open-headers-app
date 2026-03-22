import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitRepositoryManager } from '../../../src/services/workspace/git/repository/GitRepositoryManager';
import { GitExecutor } from '../../../src/services/workspace/git/core/GitExecutor';
import { GitAuthenticator } from '../../../src/services/workspace/git/auth/GitAuthenticator';

const SSH_DIR = '/Users/jane.doe/.openheaders/ssh-keys';
const REPO_DIR = '/Users/jane.doe/.openheaders/workspace-sync/ws-a1b2c3d4';
const REPO_URL = 'https://github.com/OpenHeaders/open-headers-app.git';

function createMocks() {
    const executor = new GitExecutor();
    const authManager = new GitAuthenticator(SSH_DIR);

    const executeSpy = vi.spyOn(executor, 'execute').mockResolvedValue({ stdout: '', stderr: '' });
    const setupAuthSpy = vi.spyOn(authManager, 'setupAuth').mockResolvedValue({
        effectiveUrl: REPO_URL,
        env: process.env,
        type: 'none',
    });
    const cleanupSpy = vi.spyOn(authManager, 'cleanup').mockResolvedValue(undefined);

    return { executor, authManager, executeSpy, setupAuthSpy, cleanupSpy };
}

describe('GitRepositoryManager', () => {
    let manager: GitRepositoryManager;
    let executeSpy: ReturnType<typeof createMocks>['executeSpy'];
    let setupAuthSpy: ReturnType<typeof createMocks>['setupAuthSpy'];
    let cleanupSpy: ReturnType<typeof createMocks>['cleanupSpy'];

    beforeEach(() => {
        vi.restoreAllMocks();
        const mocks = createMocks();
        manager = new GitRepositoryManager(mocks.executor, mocks.authManager);
        executeSpy = mocks.executeSpy;
        setupAuthSpy = mocks.setupAuthSpy;
        cleanupSpy = mocks.cleanupSpy;
    });

    describe('parseStatusOutput()', () => {
        it('parses staged modified files', () => {
            const result = manager.parseStatusOutput('M  src/index.ts\nM  README.md');
            expect(result).toEqual({
                modified: ['src/index.ts', 'README.md'],
                added: [],
                deleted: [],
                renamed: [],
                untracked: [],
            });
        });

        it('parses added files', () => {
            const result = manager.parseStatusOutput('A  config/open-headers.json\nA  config/environments.json');
            expect(result).toEqual({
                modified: [],
                added: ['config/open-headers.json', 'config/environments.json'],
                deleted: [],
                renamed: [],
                untracked: [],
            });
        });

        it('parses deleted files', () => {
            const result = manager.parseStatusOutput('D  old-config.json');
            expect(result.deleted).toEqual(['old-config.json']);
        });

        it('parses renamed files', () => {
            const result = manager.parseStatusOutput('R  old-name.ts -> new-name.ts');
            expect(result.renamed).toEqual(['old-name.ts -> new-name.ts']);
        });

        it('parses untracked files', () => {
            const result = manager.parseStatusOutput('?? temp.log\n?? dist/bundle.js');
            expect(result.untracked).toEqual(['temp.log', 'dist/bundle.js']);
        });

        it('handles mixed status with enterprise file paths', () => {
            const status = [
                'M  .openheaders/workspaces/ws-prod/sources.json',
                'A  .openheaders/workspaces/ws-prod/environments.json',
                'D  .openheaders/workspaces/ws-prod/old-rules.json',
                'R  config/old.json -> config/new.json',
                '?? .openheaders/workspaces/ws-prod/temp-sync.lock'
            ].join('\n');
            const result = manager.parseStatusOutput(status);
            expect(result.modified).toEqual(['.openheaders/workspaces/ws-prod/sources.json']);
            expect(result.added).toEqual(['.openheaders/workspaces/ws-prod/environments.json']);
            expect(result.deleted).toEqual(['.openheaders/workspaces/ws-prod/old-rules.json']);
            expect(result.renamed).toEqual(['config/old.json -> config/new.json']);
            expect(result.untracked).toEqual(['.openheaders/workspaces/ws-prod/temp-sync.lock']);
        });

        it('returns empty arrays for clean working directory', () => {
            const result = manager.parseStatusOutput('');
            expect(result).toEqual({
                modified: [],
                added: [],
                deleted: [],
                renamed: [],
                untracked: [],
            });
        });

        it('handles whitespace-only input', () => {
            const result = manager.parseStatusOutput('   \n  \n');
            expect(result.modified).toEqual([]);
            expect(result.untracked).toEqual([]);
        });

        it('handles files with spaces in names', () => {
            const result = manager.parseStatusOutput('M  Acme Corp Headers/staging tokens.json');
            expect(result.modified).toEqual(['Acme Corp Headers/staging tokens.json']);
        });

        it('handles both staged and unstaged modification (MM)', () => {
            const result = manager.parseStatusOutput('MM src/both.ts');
            expect(result.modified).toContain('src/both.ts');
        });
    });

    describe('getStatus()', () => {
        it('returns full repository status with enterprise data', async () => {
            // branch
            executeSpy.mockResolvedValueOnce({ stdout: 'workspace/staging-env\n', stderr: '' });
            // status
            executeSpy.mockResolvedValueOnce({ stdout: 'M  config/open-headers.json\n?? temp.lock\n', stderr: '' });
            // log
            executeSpy.mockResolvedValueOnce({
                stdout: 'f7a3b2c1d4e5f6a7b8c9|Jane Doe|jane.doe@openheaders.io|1706104800|feat: Add staging source',
                stderr: ''
            });

            const status = await manager.getStatus(REPO_DIR);
            expect(status).toEqual({
                branch: 'workspace/staging-env',
                hasChanges: true,
                changes: {
                    modified: ['config/open-headers.json'],
                    added: [],
                    deleted: [],
                    renamed: [],
                    untracked: ['temp.lock'],
                },
                lastCommit: {
                    hash: 'f7a3b2c1d4e5f6a7b8c9',
                    author: 'Jane Doe',
                    email: 'jane.doe@openheaders.io',
                    date: new Date(1706104800 * 1000),
                    message: 'feat: Add staging source',
                },
            });
        });

        it('returns hasChanges=false for clean repo', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
            executeSpy.mockResolvedValueOnce({
                stdout: 'abc123|User|user@openheaders.io|1706100000|initial commit',
                stderr: ''
            });

            const status = await manager.getStatus(REPO_DIR);
            expect(status.hasChanges).toBe(false);
            expect(status.changes.modified).toEqual([]);
        });
    });

    describe('pullRepository()', () => {
        it('returns success with changes when commits are pulled', async () => {
            // getRepositoryUrl
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            // ls-remote (branch exists check)
            executeSpy.mockResolvedValueOnce({ stdout: 'abc123\trefs/heads/main\n', stderr: '' });
            // fetch
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
            // rev-list count
            executeSpy.mockResolvedValueOnce({ stdout: '3\n', stderr: '' });
            // pull
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await manager.pullRepository({ repoDir: REPO_DIR, branch: 'main' });
            expect(result.success).toBe(true);
            expect(result.changes).toBe(true);
            expect(result.message).toContain('3');
        });

        it('returns no changes when already up to date', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            executeSpy.mockResolvedValueOnce({ stdout: 'abc\trefs/heads/main\n', stderr: '' });
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
            executeSpy.mockResolvedValueOnce({ stdout: '0\n', stderr: '' });

            const result = await manager.pullRepository({ repoDir: REPO_DIR, branch: 'main' });
            expect(result.success).toBe(true);
            expect(result.changes).toBe(false);
            expect(result.message).toContain('up to date');
        });

        it('creates new branch when branch does not exist on remote (non-empty repo)', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            // ls-remote returns other branches but not the one we want
            executeSpy.mockResolvedValueOnce({ stdout: 'abc\trefs/heads/main\n', stderr: '' });
            // symbolic-ref for default branch
            executeSpy.mockResolvedValueOnce({ stdout: 'refs/remotes/origin/main\n', stderr: '' });
            // fetch default branch
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });
            // checkout -b new-branch from origin/main
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await manager.pullRepository({
                repoDir: REPO_DIR,
                branch: 'workspace/new-env',
            });
            expect(result.success).toBe(true);
            expect(result.message).toContain('Created branch');
        });

        it('always cleans up auth resources', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            executeSpy.mockRejectedValueOnce(new Error('network error'));

            await expect(
                manager.pullRepository({ repoDir: REPO_DIR, branch: 'main' })
            ).rejects.toThrow('network error');

            expect(cleanupSpy).toHaveBeenCalledOnce();
        });
    });

    describe('pushRepository()', () => {
        it('pushes commits and returns count', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            // unpushed count
            executeSpy.mockResolvedValueOnce({ stdout: '2\n', stderr: '' });
            // push
            executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await manager.pushRepository({
                repoDir: REPO_DIR,
                branch: 'workspace/staging-env',
            });
            expect(result.success).toBe(true);
            expect(result.pushed).toBe(true);
            expect(result.commits).toBe(2);
        });

        it('returns pushed=false when no changes to push', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            executeSpy.mockResolvedValueOnce({ stdout: '0\n', stderr: '' });

            const result = await manager.pushRepository({
                repoDir: REPO_DIR,
                branch: 'main',
            });
            expect(result.success).toBe(true);
            expect(result.pushed).toBe(false);
        });

        it('always cleans up auth resources even on push failure', async () => {
            // getRepositoryUrl
            executeSpy.mockResolvedValueOnce({ stdout: REPO_URL + '\n', stderr: '' });
            // unpushed count
            executeSpy.mockResolvedValueOnce({ stdout: '1\n', stderr: '' });
            // push itself fails
            executeSpy.mockRejectedValueOnce(new Error('push rejected: permission denied'));

            await expect(
                manager.pushRepository({ repoDir: REPO_DIR, branch: 'main' })
            ).rejects.toThrow('push rejected');

            expect(cleanupSpy).toHaveBeenCalledOnce();
        });
    });

    describe('getRepositoryUrl()', () => {
        it('returns trimmed remote URL', async () => {
            executeSpy.mockResolvedValue({
                stdout: 'https://github.com/OpenHeaders/open-headers-app.git\n',
                stderr: ''
            });
            const url = await manager.getRepositoryUrl(REPO_DIR);
            expect(url).toBe('https://github.com/OpenHeaders/open-headers-app.git');
        });

        it('returns null when config fails', async () => {
            executeSpy.mockRejectedValue(new Error('not a git repo'));
            const url = await manager.getRepositoryUrl('/nonexistent');
            expect(url).toBeNull();
        });
    });

    describe('ensureCleanDirectory()', () => {
        it('creates directory when it does not exist', async () => {
            const fs = await import('fs');
            vi.spyOn(fs.promises, 'stat').mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
            const mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

            await manager.ensureCleanDirectory('/new/directory');
            expect(mkdirSpy).toHaveBeenCalledWith('/new/directory', { recursive: true });

            vi.restoreAllMocks();
        });

        it('throws when directory is not empty', async () => {
            const fs = await import('fs');
            vi.spyOn(fs.promises, 'stat').mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof fs.statSync>);
            vi.spyOn(fs.promises, 'readdir').mockResolvedValue(
                ['file.txt'] as unknown as Awaited<ReturnType<typeof fs.promises.readdir>>
            );

            await expect(manager.ensureCleanDirectory('/existing/dir'))
                .rejects.toThrow('is not empty');

            vi.restoreAllMocks();
        });
    });
});
